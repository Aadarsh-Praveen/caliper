#!/usr/bin/env python3
"""
Synthetic data generator for Caliper demo.
Writes ~10,000 events across three experiments directly to DynamoDB.
"""
import argparse
import random
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
import numpy as np

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


def imul32(a: int, b: int) -> int:
    return (a & 0xFFFFFFFF) * (b & 0xFFFFFFFF) & 0xFFFFFFFF


def cyrb53(s: str, seed: int = 0) -> int:
    """Exact port of the JS cyrb53 hash used in the SDK and dashboard/lib/hash.ts."""
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
    return "control" if cyrb53(f"{user_id}:{experiment_id}") % 100 < 50 else "treatment"


def random_ts(days_back: int) -> str:
    now = datetime.now(timezone.utc)
    offset_seconds = random.uniform(0, days_back * 86400)
    dt = now - timedelta(seconds=offset_seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


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
    """Returns (events, assignments, summary_counts)."""
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

        # Conversion probability
        if variant == "treatment":
            conv_rate = baseline_rate * (1 + treatment_lift)
        else:
            conv_rate = baseline_rate

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

        # Each user fires these events
        events.append(make_event("experiment_exposed", {"experiment_id": exp_id, "variant": variant}))
        events.append(make_event("page_view", {"path": "/"}, offset_s=random.uniform(0.1, 0.5)))
        events.append(make_event("scroll_depth", {"depth": 25}, offset_s=random.uniform(2, 8)))

        # Conversion
        converted = random.random() < conv_rate
        if converted:
            events.append(make_event(primary_metric, {}, offset_s=random.uniform(10, 60)))

        # Assignment record
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


def batch_write(table, items: list[dict]) -> None:
    """Write items in batches of 25 using batch_writer."""
    with table.batch_writer() as batch:
        for item in items:
            # Convert numeric values to Decimal for DynamoDB
            ddb_item = {}
            for k, v in item.items():
                if isinstance(v, int) and k != "expires_at":
                    ddb_item[k] = v
                elif isinstance(v, int):
                    ddb_item[k] = v
                elif isinstance(v, float):
                    ddb_item[k] = Decimal(str(v))
                else:
                    ddb_item[k] = v
            batch.put_item(Item=ddb_item)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Caliper demo data")
    parser.add_argument("--n-users", type=int, default=3333, help="Users per experiment")
    parser.add_argument("--days-back", type=int, default=7, help="Spread events over this many past days")
    parser.add_argument("--verbose", action="store_true", help="Print per-experiment breakdown")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(DYNAMODB_TABLE)

    start = time.time()
    total_events = 0
    total_users = 0
    total_assignments = 0

    if args.verbose:
        print(f"Generating data for {args.n_users:,} users per experiment over {args.days_back} days...")

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

        total_events += len(events)
        total_users += args.n_users
        total_assignments += len(assignments)

    elapsed = time.time() - start
    print(f"\n✓ Generated {total_events:,} events across {len(EXPERIMENTS)} experiments")
    if not args.verbose:
        for exp_id in EXPERIMENTS:
            print(f"  {exp_id}")
    print(f"✓ Wrote {total_assignments:,} assignment records")
    print(f"✓ Total runtime: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
