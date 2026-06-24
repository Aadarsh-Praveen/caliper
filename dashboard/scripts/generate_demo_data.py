#!/usr/bin/env python3
"""
Synthetic data generator for Caliper demo.
Writes ~10,000 events across three experiments to DynamoDB and Aurora.
"""
import argparse
import json
import os
import random
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
import numpy as np
import psycopg

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

DYNAMODB_TABLE = "caliper-main"
REGION = "us-east-1"

EXPERIMENTS = {
    "hero_cta_test": {
        "baseline_rate": 0.12,
        "treatment_lift": 0.15,
        "primary_metric": "buy_section_view",
        "srm": False,
    },
    "buy_button_test": {
        "baseline_rate": 0.10,
        "treatment_lift": 0.23,
        "primary_metric": "add_to_cart",
        "srm": False,
    },
    "nav_layout_test": {
        "baseline_rate": 0.08,
        "treatment_lift": 0.05,
        "primary_metric": "nav_cta_click",
        "srm": True,  # 60/40 skew to trigger SRM
    },
}

DEVICES = ["desktop"] * 55 + ["mobile"] * 35 + ["tablet"] * 10
COUNTRIES = ["US"] * 70 + ["UK"] * 15 + ["CA"] * 10 + ["AU"] * 5


def to_decimal(obj):
    """Recursively convert floats in dict/list to Decimal for DynamoDB."""
    if isinstance(obj, float):
        # Round to 6 decimal places to keep attribute values clean and avoid NaN/Infinity
        return Decimal(str(round(obj, 6)))
    if isinstance(obj, dict):
        return {k: to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_decimal(v) for v in obj]
    return obj


def imul32(a: int, b: int) -> int:
    """Simulate JavaScript's 32-bit integer multiply (Math.imul), ignoring overflow."""
    return (a & 0xFFFFFFFF) * (b & 0xFFFFFFFF) & 0xFFFFFFFF


def cyrb53(s: str, seed: int = 0) -> int:
    """
    Exact port of the JS cyrb53 hash used in the SDK and dashboard/lib/hash.ts.

    This must produce bit-for-bit identical output to the TypeScript version so that
    assign_variant_hash matches the SDK's variant assignment for the same user_id.
    """
    h1 = (0xDEADBEEF ^ seed) & 0xFFFFFFFF
    h2 = (0x41C6CE57 ^ seed) & 0xFFFFFFFF
    for ch in s:
        cc = ord(ch)
        h1 = imul32(h1 ^ cc, 2654435761)
        h2 = imul32(h2 ^ cc, 1597334677)
    new_h1 = (imul32(h1 ^ (h1 >> 16), 2246822507) ^ imul32(h2 ^ (h2 >> 13), 3266489909)) & 0xFFFFFFFF
    new_h2 = (imul32(h2 ^ (h2 >> 16), 2246822507) ^ imul32(new_h1 ^ (new_h1 >> 13), 3266489909)) & 0xFFFFFFFF
    return 4294967296 * (2097151 & new_h2) + new_h1


def assign_variant_hash(user_id: str, experiment_id: str) -> str:
    """Deterministically assign a variant using the same cyrb53-based hash as the browser SDK."""
    return "control" if cyrb53(f"{user_id}:{experiment_id}") % 100 < 50 else "treatment"


def random_ts(days_back: int) -> str:
    """Return a random ISO 8601 timestamp (UTC) uniformly distributed over the past days_back days."""
    now = datetime.now(timezone.utc)
    offset_seconds = random.uniform(0, days_back * 86400)
    dt = now - timedelta(seconds=offset_seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def cleanup_experiment_data(table, exp_id: str, verbose: bool) -> int:
    """
    Delete all EVT# and ASSIGN# items for an experiment before regenerating.

    Leaves SUMMARY#, STATS#, and SRM# items intact — the aggregator Lambda
    rewrites those organically as new events stream through.
    """
    deleted = 0
    for prefix in ("EVT#", "ASSIGN#"):
        kwargs: dict = {
            "KeyConditionExpression": Key("PK").eq(f"EXP#{exp_id}") & Key("SK").begins_with(prefix),
            "ProjectionExpression": "PK, SK",
        }
        while True:
            resp = table.query(**kwargs)
            items = resp.get("Items", [])
            for i in range(0, len(items), 25):
                chunk = items[i : i + 25]
                with table.batch_writer() as bw:
                    for item in chunk:
                        bw.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                deleted += len(chunk)
            last = resp.get("LastEvaluatedKey")
            if not last:
                break
            kwargs["ExclusiveStartKey"] = last
    if verbose:
        print(f"  Cleaned up {deleted:,} stale items for {exp_id}")
    return deleted


def simulate_experiment(
    exp_id: str,
    n_users: int,
    days_back: int,
    baseline_rate: float,
    treatment_lift: float,
    primary_metric: str,
    srm: bool,
    verbose: bool,
) -> tuple[list[dict], list[dict], dict]:
    """
    Generate synthetic events and assignments for one experiment.

    Conversion probability is correlated with the pre_experiment_activity covariate
    (drawn from Beta(2, 5)) so that CUPED variance reduction has real signal to exploit.
    When srm=True, assignments are skewed 60/40 instead of 50/50 to trigger SRM detection.

    Args:
        exp_id: Experiment slug, e.g. "hero_cta_test".
        n_users: Number of users to simulate.
        days_back: Events are spread uniformly across this many past days.
        baseline_rate: Control group base conversion rate.
        treatment_lift: Relative lift applied to the treatment conversion rate.
        primary_metric: Event name that counts as a conversion.
        srm: If True, assign 60% to control to deliberately trigger SRM.
        verbose: Print per-variant counts if True.

    Returns:
        Tuple of (events, assignments, summary_counts) ready for batch write.
    """
    events = []
    assignments = []
    summary_counts: dict[str, dict[str, int]] = {
        "control": {"n": 0, "conversions": 0},
        "treatment": {"n": 0, "conversions": 0},
    }
    user_ids = [str(uuid.uuid4()) for _ in range(n_users)]

    for user_id in user_ids:
        if srm:
            # Deliberately skew 60% control, 40% treatment to simulate SRM
            variant = "control" if random.random() < 0.60 else "treatment"
        else:
            variant = assign_variant_hash(user_id, exp_id)

        # Pre-experiment activity covariate for CUPED: Beta(2,5), mean ≈ 0.29
        pre_score = float(np.random.beta(2, 5))

        # Conversion probability correlated with pre_score (creates CUPED-exploitable variance)
        lift_multiplier = (1 + treatment_lift) if variant == "treatment" else 1.0
        conv_rate = baseline_rate * (0.5 + pre_score) * lift_multiplier

        base_ts = random_ts(days_back)
        device = random.choice(DEVICES)
        country = random.choice(COUNTRIES)
        ctx = {"device": device, "country": country}
        expires_at = int(time.time()) + 30 * 86400

        def make_event(event_name: str, props: dict | None = None, offset_s: float = 0.0) -> dict:
            dt = datetime.fromisoformat(base_ts.replace("Z", "+00:00"))
            dt2 = dt + timedelta(seconds=offset_s)
            ts = dt2.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt2.microsecond // 1000:03d}Z"
            ts_ms = int(dt2.timestamp() * 1000)
            return {
                "PK": f"EXP#{exp_id}",
                "SK": f"EVT#{ts_ms}#{user_id}#{event_name}",
                "GSI1PK": f"USER#{user_id}",
                "GSI1SK": f"EVT#{ts_ms}",
                "event_name": event_name,
                "experiment_id": exp_id,
                "variant": variant,
                "user_id": user_id,
                "properties": props or {},
                "context": ctx,
                "ts": ts,
                "expires_at": expires_at,
            }

        # Each user fires these events; pre_experiment_activity written on the exposed event
        events.append(make_event("experiment_exposed", {
            "experiment_id": exp_id,
            "variant": variant,
            "pre_experiment_activity": pre_score,
        }))
        events.append(make_event("page_view", {"path": "/"}, offset_s=random.uniform(0.1, 0.5)))
        events.append(make_event("scroll_depth", {"depth": 25}, offset_s=random.uniform(2, 8)))

        # Conversion
        converted = random.random() < conv_rate
        if converted:
            events.append(make_event(primary_metric, {}, offset_s=random.uniform(10, 60)))

        # Assignment record — includes covariate and conversion outcome for CUPED computation
        assignments.append({
            "PK": f"EXP#{exp_id}",
            "SK": f"ASSIGN#{user_id}",
            "GSI1PK": f"USER#{user_id}",
            "GSI1SK": f"ASSIGN#{exp_id}",
            "experiment_id": exp_id,
            "user_id": user_id,
            "variant": variant,
            "assigned_at": base_ts,
            "source": "synthetic",
            "pre_experiment_activity": pre_score,
            "converted": converted,
        })

        # Tally for SUMMARY items
        summary_counts[variant]["n"] += 1
        if converted:
            summary_counts[variant]["conversions"] += 1

    if verbose:
        ctrl = summary_counts["control"]
        trt = summary_counts["treatment"]
        total_events = len(events)
        print(
            f"  {exp_id}: {total_events:,} events from {n_users:,} users "
            f"(control: {ctrl['n']:,}, treatment: {trt['n']:,})"
            + ("  ⚠ SRM expected" if srm else "")
        )

    return events, assignments, summary_counts


def write_summary_items(table, exp_id: str, summary_counts: dict[str, dict[str, int]]) -> None:
    """Write pre-computed SUMMARY items so the dashboard shows data immediately."""
    for variant, counts in summary_counts.items():
        n = counts["n"]
        conversions = counts["conversions"]
        table.put_item(
            Item={
                "PK": f"EXP#{exp_id}",
                "SK": f"SUMMARY#{variant}",
                "n": Decimal(n),
                "conversions": Decimal(conversions),
                "sum": Decimal(conversions),      # for binary: sum of 0/1 values = conversions
                "sum_sq": Decimal(conversions),   # for binary: sum of squares = same
            }
        )


def get_aurora_conn() -> psycopg.Connection:
    """Open a psycopg3 connection to Aurora, appending sslmode=require if not already set."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL env var not set — cannot write to Aurora")
    # Ensure SSL; add sslmode=require if not already present
    if "sslmode" not in database_url:
        sep = "&" if "?" in database_url else "?"
        database_url += f"{sep}sslmode=require"
    return psycopg.connect(database_url)


def truncate_aurora(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("TRUNCATE raw_events, raw_assignments")
    conn.commit()


def write_to_aurora(conn: psycopg.Connection, events_batch: list[dict], assignments_batch: list[dict]) -> None:
    """Bulk insert into raw_events and raw_assignments using COPY."""
    with conn.cursor() as cur:
        with cur.copy(
            "COPY raw_events (experiment_id, user_id, variant, event_name, properties, context, ts) FROM STDIN"
        ) as copy:
            for e in events_batch:
                copy.write_row((
                    e["experiment_id"],
                    e["user_id"],
                    e["variant"],
                    e["event_name"],
                    json.dumps(e.get("properties", {})),
                    json.dumps(e.get("context", {})),
                    e["ts"],
                ))

        with cur.copy(
            "COPY raw_assignments (experiment_id, user_id, variant, pre_experiment_activity, assigned_at) FROM STDIN"
        ) as copy:
            for a in assignments_batch:
                copy.write_row((
                    a["experiment_id"],
                    a["user_id"],
                    a["variant"],
                    float(a.get("pre_experiment_activity", 0)),
                    a["assigned_at"],
                ))
    conn.commit()


def batch_write(table, items: list[dict]) -> None:
    """Write items in batches of 25 using batch_writer.

    to_decimal is applied to every item recursively so that nested dicts
    (like 'properties') containing floats are also converted — boto3's
    DynamoDB resource API rejects Python floats anywhere in the document.
    """
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=to_decimal(item))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Caliper demo data")
    parser.add_argument("--n-users", type=int, default=3333, help="Users per experiment")
    parser.add_argument("--days-back", type=int, default=7, help="Spread events over this many past days")
    parser.add_argument("--verbose", action="store_true", help="Print per-experiment breakdown")
    parser.add_argument("--skip-aurora", action="store_true", help="Skip Aurora writes (DynamoDB only)")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(DYNAMODB_TABLE)

    start = time.time()
    total_events = 0
    total_users = 0
    total_assignments = 0
    total_cleaned = 0

    if args.verbose:
        print(f"Cleaning up stale EVT# and ASSIGN# items for {len(EXPERIMENTS)} experiments...")

    # Delete stale EVT# and ASSIGN# items first to prevent partial-run inconsistency.
    # SUMMARY#, STATS#, and SRM# items are left for the aggregator to rewrite.
    for exp_id in EXPERIMENTS:
        total_cleaned += cleanup_experiment_data(table, exp_id, verbose=args.verbose)

    # Open Aurora connection early so we can TRUNCATE before any writes
    aurora_conn = None
    if not args.skip_aurora:
        if args.verbose:
            print("Truncating Aurora raw_events and raw_assignments...")
        aurora_conn = get_aurora_conn()
        truncate_aurora(aurora_conn)

    if args.verbose:
        print(f"\nGenerating data for {args.n_users:,} users per experiment over {args.days_back} days...")

    all_aurora_events: list[dict] = []
    all_aurora_assignments: list[dict] = []

    for exp_id, cfg in EXPERIMENTS.items():
        events, assignments, summary_counts = simulate_experiment(
            exp_id=exp_id,
            n_users=args.n_users,
            days_back=args.days_back,
            baseline_rate=cfg["baseline_rate"],
            treatment_lift=cfg["treatment_lift"],
            primary_metric=cfg["primary_metric"],
            srm=cfg["srm"],
            verbose=args.verbose,
        )

        batch_write(table, events)
        batch_write(table, assignments)
        write_summary_items(table, exp_id, summary_counts)

        all_aurora_events.extend(events)
        all_aurora_assignments.extend(assignments)

        total_events += len(events)
        total_users += args.n_users
        total_assignments += len(assignments)

    if aurora_conn is not None:
        if args.verbose:
            print(f"Writing {len(all_aurora_events):,} events and {len(all_aurora_assignments):,} assignments to Aurora via COPY...")
        write_to_aurora(aurora_conn, all_aurora_events, all_aurora_assignments)
        aurora_conn.close()

    elapsed = time.time() - start
    if total_cleaned:
        print(f"✓ Cleaned up {total_cleaned:,} stale items")
    print(f"✓ Generated {total_events:,} events across {len(EXPERIMENTS)} experiments")
    if not args.verbose:
        for exp_id in EXPERIMENTS:
            print(f"  {exp_id}")
    print(f"✓ Wrote {total_assignments:,} assignment records")
    if not args.skip_aurora:
        print(f"✓ Aurora: {len(all_aurora_events):,} events + {len(all_aurora_assignments):,} assignments written")
    print(f"✓ Total runtime: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
