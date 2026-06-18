"""
Caliper aggregator Lambda — triggered by DynamoDB Streams (batch 100, 5s window).
Reads EVT# items, increments SUMMARY#variant n/conversions counters (ADD),
then writes STATS#latest and SRM#detected flags.
"""
import os, logging
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from stats.frequentist import two_proportion_z_test
from stats.srm import srm_check

logger = logging.getLogger()
logger.setLevel(logging.INFO)
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ.get("DYNAMODB_TABLE_NAME", "caliper-main"))

PRIMARY_METRICS = {
    "hero_cta_test": "buy_section_view",
    "buy_button_test": "add_to_cart",
    "nav_layout_test": "nav_cta_click",
}
EXPECTED_PROPORTIONS = {"control": 0.5, "treatment": 0.5}


def _s(v): return v.get("S") if v else None


def lambda_handler(event, context):
    by_exp = defaultdict(lambda: defaultdict(list))
    records = event.get("Records", [])
    for rec in records:
        if rec.get("eventName") not in ("INSERT", "MODIFY"):
            continue
        img = rec.get("dynamodb", {}).get("NewImage", {})
        sk = _s(img.get("SK"))
        if not sk or not sk.startswith("EVT#"):
            continue
        exp_id = _s(img.get("experiment_id")) or _s(img.get("experimentId"))
        variant = _s(img.get("variant"))
        evt = _s(img.get("event_name")) or _s(img.get("eventName"))
        if exp_id and variant in ("control", "treatment") and evt:
            by_exp[exp_id][variant].append(evt)
    for exp_id, v_events in by_exp.items():
        try:
            _update(exp_id, v_events)
        except Exception:
            logger.exception("Failed to update %s", exp_id)
    logger.info("Processed %d records, %d experiments", len(records), len(by_exp))
    return {"processed": len(records)}


def _update(exp_id, v_events):
    pm = PRIMARY_METRICS.get(exp_id)
    for variant, evts in v_events.items():
        n_inc = sum(1 for e in evts if e == "experiment_exposed")
        c_inc = sum(1 for e in evts if e == pm) if pm else 0
        if not n_inc and not c_inc:
            continue
        parts, vals = [], {}
        if n_inc:
            parts.append("#n :n"); vals[":n"] = Decimal(n_inc)
        if c_inc:
            parts.extend(["conversions :c", "#sum :c", "sum_sq :c"]); vals[":c"] = Decimal(c_inc)
        table.update_item(
            Key={"PK": f"EXP#{exp_id}", "SK": f"SUMMARY#{variant}"},
            UpdateExpression="ADD " + ", ".join(parts),
            ExpressionAttributeNames={"#n": "n", "#sum": "sum"},
            ExpressionAttributeValues=vals,
        )

    sums = {}
    for variant in ("control", "treatment"):
        it = table.get_item(Key={"PK": f"EXP#{exp_id}", "SK": f"SUMMARY#{variant}"}).get("Item")
        if it:
            sums[variant] = {"n": int(it.get("n", 0)), "conversions": int(it.get("conversions", 0))}
    if len(sums) < 2:
        return

    ctrl, trt = sums["control"], sums["treatment"]
    z, p, lift, ci_lo, ci_hi = two_proportion_z_test(ctrl["conversions"], ctrl["n"], trt["conversions"], trt["n"])
    now = datetime.now(timezone.utc).isoformat()

    if z is not None:
        table.put_item(Item={
            "PK": f"EXP#{exp_id}", "SK": "STATS#latest",
            "z_stat": Decimal(str(round(z, 6))), "p_value": Decimal(str(round(p, 6))),
            "lift": Decimal(str(round(lift, 6))), "ci_low": Decimal(str(round(ci_lo, 6))),
            "ci_high": Decimal(str(round(ci_hi, 6))),
            "control_n": Decimal(ctrl["n"]), "treatment_n": Decimal(trt["n"]),
            "updated_at": now,
        })

    obs = {v: s["n"] for v, s in sums.items() if s["n"] > 0}
    if len(obs) == 2 and sum(obs.values()) >= 100:
        chi2, sp, is_srm = srm_check(obs, EXPECTED_PROPORTIONS)
        if is_srm:
            table.put_item(Item={
                "PK": f"EXP#{exp_id}", "SK": "SRM#detected",
                "chi2_stat": Decimal(str(round(chi2, 6))), "p_value": Decimal(str(round(sp, 9))),
                "observed": {k: Decimal(v) for k, v in obs.items()},
                "expected": {k: Decimal(str(v)) for k, v in EXPECTED_PROPORTIONS.items()},
                "detected_at": now,
            })
            logger.warning("SRM for %s: chi2=%.2f p=%.2e", exp_id, chi2, sp)
        else:
            try:
                table.delete_item(Key={"PK": f"EXP#{exp_id}", "SK": "SRM#detected"})
            except Exception:
                pass
