"""
Caliper aggregator Lambda — triggered by DynamoDB Streams (batch 100, 5s window).
Reads EVT# items, increments SUMMARY#variant n/conversions counters (ADD),
then writes STATS#latest (with mSPRT), STATS#cuped#variant, SRM#detected flags.

SRM is computed on ASSIGN_COUNT#variant counters (unique user assignments),
not on the SUMMARY#variant.n field which accumulates event counts and can
produce false positives when users fire multiple experiment_exposed events.
"""
import os, logging
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key
from stats.frequentist import two_proportion_z_test, welch_t_test
from stats.srm import srm_check
from stats.cuped import compute_theta, cuped_summary_statistics, variance_reduction_ratio
from stats.sequential import msprt_p_value, msprt_should_stop

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


def _query_all_assign_items(exp_id: str) -> list[dict]:
    """Query all ASSIGN# items for an experiment (paginated)."""
    items = []
    kwargs = {
        "KeyConditionExpression": Key("PK").eq(f"EXP#{exp_id}") & Key("SK").begins_with("ASSIGN#")
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


def _compute_cuped(exp_id: str, now: str) -> None:
    """
    Query all ASSIGN# items for the experiment, compute CUPED-adjusted stats per variant,
    and write STATS#cuped#variant + STATS#cuped#latest items.

    Requires ASSIGN# items to have pre_experiment_activity (float) and converted (bool).
    For live SDK events without covariates, theta ≈ 0 so CUPED is a no-op (correct behaviour).
    """
    assign_items = _query_all_assign_items(exp_id)
    if not assign_items:
        return

    ctrl_y, ctrl_x = [], []
    trt_y, trt_x = [], []
    for item in assign_items:
        variant = item.get("variant")
        x = float(item.get("pre_experiment_activity") or 0)
        y = float(bool(item.get("converted", False)))
        if variant == "control":
            ctrl_y.append(y)
            ctrl_x.append(x)
        elif variant == "treatment":
            trt_y.append(y)
            trt_x.append(x)

    if not ctrl_y or not trt_y:
        return

    all_y = ctrl_y + trt_y
    all_x = ctrl_x + trt_x
    n_all = len(all_x)

    x_grand_mean = sum(all_x) / n_all
    # theta computed from pooled data (both variants) — using per-variant means would bias the estimate
    theta = compute_theta(all_y, all_x)

    ctrl_mean_adj, ctrl_var_adj, ctrl_n = cuped_summary_statistics(ctrl_y, ctrl_x, x_grand_mean, theta)
    trt_mean_adj, trt_var_adj, trt_n = cuped_summary_statistics(trt_y, trt_x, x_grand_mean, theta)

    var_x = sum((xi - x_grand_mean) ** 2 for xi in all_x) / max(n_all - 1, 1)
    var_y_all = sum((yi - sum(all_y) / n_all) ** 2 for yi in all_y) / max(n_all - 1, 1)
    vr_ratio = variance_reduction_ratio(theta, var_x, var_y_all)

    for variant, mean_adj, var_adj, n_v in [
        ("control", ctrl_mean_adj, ctrl_var_adj, ctrl_n),
        ("treatment", trt_mean_adj, trt_var_adj, trt_n),
    ]:
        table.put_item(Item={
            "PK": f"EXP#{exp_id}", "SK": f"STATS#cuped#{variant}",
            "n": Decimal(n_v),
            "mean": Decimal(str(round(mean_adj, 8))),
            "variance": Decimal(str(round(max(var_adj, 0), 8))),
            "theta": Decimal(str(round(theta, 8))),
            "x_grand_mean": Decimal(str(round(x_grand_mean, 8))),
            "variance_reduction_ratio": Decimal(str(round(vr_ratio, 8))),
            "computed_at": now,
        })

    # CUPED CI from Welch's t-test on adjusted values (CLT makes adjusted binary values ~ normal at large n)
    welch = welch_t_test(ctrl_mean_adj, max(ctrl_var_adj, 1e-12), ctrl_n,
                         trt_mean_adj, max(trt_var_adj, 1e-12), trt_n)
    if welch[0] is not None:
        _, _, cuped_p, cuped_lift, cuped_ci_lo, cuped_ci_hi = welch
        table.put_item(Item={
            "PK": f"EXP#{exp_id}", "SK": "STATS#cuped#latest",
            "lift": Decimal(str(round(cuped_lift, 8))),
            "p_value": Decimal(str(round(cuped_p, 8))),
            "ci_low": Decimal(str(round(cuped_ci_lo, 8))),
            "ci_high": Decimal(str(round(cuped_ci_hi, 8))),
            "variance_reduction_ratio": Decimal(str(round(vr_ratio, 8))),
            "theta": Decimal(str(round(theta, 8))),
            "computed_at": now,
        })
        logger.info(
            "CUPED %s: theta=%.4f vr_ratio=%.3f cuped_ci=[%.4f,%.4f]",
            exp_id, theta, vr_ratio, cuped_ci_lo, cuped_ci_hi,
        )


def lambda_handler(event, context):
    """
    DynamoDB Streams entrypoint — aggregates events and writes experiment statistics.

    Processes a batch of DynamoDB Stream records (up to 100 items, 5s window) and:
    1. Groups EVT# records by experiment and variant, increments SUMMARY# counters.
    2. Counts new ASSIGN# inserts per variant, increments ASSIGN_COUNT# atomically.
    3. For each affected experiment, runs two-proportion z-test + mSPRT, SRM check,
       and CUPED variance-reduction, writing results back to DynamoDB.

    Args:
        event: DynamoDB Streams event dict with a "Records" list.
        context: Lambda context object (unused, present for the Lambda interface).

    Returns:
        Dict with {"processed": <record_count>}.
    """
    by_exp = defaultdict(lambda: defaultdict(list))
    # Counts of new unique assignments per (exp_id, variant) in this batch
    assign_incs = defaultdict(lambda: defaultdict(int))

    records = event.get("Records", [])
    for rec in records:
        event_name = rec.get("eventName")
        if event_name not in ("INSERT", "MODIFY"):
            continue
        img = rec.get("dynamodb", {}).get("NewImage", {})
        sk = _s(img.get("SK"))
        if not sk:
            continue

        if sk.startswith("EVT#"):
            exp_id = _s(img.get("experiment_id")) or _s(img.get("experimentId"))
            variant = _s(img.get("variant"))
            evt = _s(img.get("event_name")) or _s(img.get("eventName"))
            if exp_id and variant in ("control", "treatment") and evt:
                by_exp[exp_id][variant].append(evt)

        elif sk.startswith("ASSIGN#") and event_name == "INSERT":
            # Only INSERT events — each user gets exactly one ASSIGN# item (ConditionExpression guard)
            exp_id = _s(img.get("experiment_id")) or _s(img.get("experimentId"))
            if not exp_id:
                # Fall back to extracting from PK = "EXP#{exp_id}"
                pk = _s(img.get("PK"))
                if pk and pk.startswith("EXP#"):
                    exp_id = pk[4:]
            variant = _s(img.get("variant"))
            if exp_id and variant in ("control", "treatment"):
                assign_incs[exp_id][variant] += 1

    # Flush assignment counts atomically before running stats so SRM sees up-to-date totals
    for exp_id, variant_counts in assign_incs.items():
        for variant, count in variant_counts.items():
            try:
                table.update_item(
                    Key={"PK": f"EXP#{exp_id}", "SK": f"ASSIGN_COUNT#{variant}"},
                    UpdateExpression="ADD #n :n",
                    ExpressionAttributeNames={"#n": "n"},
                    ExpressionAttributeValues={":n": Decimal(count)},
                )
            except Exception:
                logger.exception("Failed to update ASSIGN_COUNT for %s/%s", exp_id, variant)

    # Run full stats + SRM update for all experiments that had new data in this batch
    all_exps = set(by_exp.keys()) | set(assign_incs.keys())
    for exp_id in all_exps:
        try:
            _update(exp_id, by_exp[exp_id])
        except Exception:
            logger.exception("Failed to update %s", exp_id)

    logger.info("Processed %d records, %d experiments", len(records), len(all_exps))
    return {"processed": len(records)}


def _update(exp_id, v_events):
    """
    Increment SUMMARY counters, compute z-test + mSPRT stats, run SRM check, and trigger CUPED.

    Called once per affected experiment after each Lambda batch. Writes STATS#latest and
    SRM#detected (or deletes SRM#detected when the split recovers) to DynamoDB, then
    delegates CUPED computation to _compute_cuped.

    Args:
        exp_id: Experiment slug, e.g. "hero_cta_test".
        v_events: Dict mapping variant name to list of event_name strings from this batch.
    """
    pm = PRIMARY_METRICS.get(exp_id)

    # Increment SUMMARY counters from experiment_exposed / primary metric events
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

    # Read current SUMMARY totals for z-test / mSPRT
    sums = {}
    for variant in ("control", "treatment"):
        it = table.get_item(Key={"PK": f"EXP#{exp_id}", "SK": f"SUMMARY#{variant}"}).get("Item")
        if it:
            sums[variant] = {"n": int(it.get("n", 0)), "conversions": int(it.get("conversions", 0))}

    now = datetime.now(timezone.utc).isoformat()

    if len(sums) == 2:
        ctrl, trt = sums["control"], sums["treatment"]
        z, p, lift, ci_lo, ci_hi = two_proportion_z_test(ctrl["conversions"], ctrl["n"], trt["conversions"], trt["n"])

        p_av = msprt_p_value(
            x1=ctrl["conversions"], n1=ctrl["n"],
            x2=trt["conversions"], n2=trt["n"],
        )
        should_stop = msprt_should_stop(p_av)

        if z is not None:
            table.put_item(Item={
                "PK": f"EXP#{exp_id}", "SK": "STATS#latest",
                "z_stat": Decimal(str(round(z, 6))), "p_value": Decimal(str(round(p, 6))),
                "lift": Decimal(str(round(lift, 6))), "ci_low": Decimal(str(round(ci_lo, 6))),
                "ci_high": Decimal(str(round(ci_hi, 6))),
                "control_n": Decimal(ctrl["n"]), "treatment_n": Decimal(trt["n"]),
                "msprt_p_value": Decimal(str(round(p_av, 8))),
                "msprt_should_stop": should_stop,
                "updated_at": now,
            })
            logger.info(
                "STATS %s: z=%.3f p=%.4f lift=%.4f msprt_p=%.4f stop=%s",
                exp_id, z, p, lift, p_av, should_stop,
            )

    # SRM: use per-variant assignment counters (one per unique user), not cumulative event counts.
    # Event counts inflate when a user fires experiment_exposed multiple times.
    assign_obs = {}
    for variant in ("control", "treatment"):
        it = table.get_item(
            Key={"PK": f"EXP#{exp_id}", "SK": f"ASSIGN_COUNT#{variant}"}
        ).get("Item")
        if it:
            n = int(it.get("n", 0))
            if n > 0:
                assign_obs[variant] = n

    if len(assign_obs) == 2 and sum(assign_obs.values()) >= 100:
        chi2, sp, is_srm = srm_check(assign_obs, EXPECTED_PROPORTIONS)
        if is_srm:
            table.put_item(Item={
                "PK": f"EXP#{exp_id}", "SK": "SRM#detected",
                "chi2_stat": Decimal(str(round(chi2, 6))), "p_value": Decimal(str(round(sp, 9))),
                "observed": {k: Decimal(v) for k, v in assign_obs.items()},
                "expected": {k: Decimal(str(v)) for k, v in EXPECTED_PROPORTIONS.items()},
                "detected_at": now,
            })
            logger.warning("SRM for %s: chi2=%.2f p=%.2e obs=%s", exp_id, chi2, sp, assign_obs)
        else:
            try:
                table.delete_item(Key={"PK": f"EXP#{exp_id}", "SK": "SRM#detected"})
            except Exception:
                pass

    # CUPED — query ASSIGN# items and compute variance-reduced stats
    try:
        _compute_cuped(exp_id, now)
    except Exception:
        logger.exception("CUPED failed for %s (non-fatal)", exp_id)
