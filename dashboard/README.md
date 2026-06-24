# Caliper — B2B Experimentation Dashboard

The Caliper SaaS product: the API the SDK calls, the six-page dashboard UI, the real-time stats engine, AI-generated readouts, and the dbt analytics pipeline.

**[Live Dashboard](https://caliper-xi.vercel.app)** · [Root README](../README.md)

---

## Pages

| Route | What it shows |
|---|---|
| `/` | Marketing landing page |
| `/dashboard` | Workspace overview — KPI sparklines (experiments, events, users, CUPED variance reduction, SRM alerts, readouts), event volume chart, comparative experiment grid, and an activity feed |
| `/experiments` | Experiment list with per-row sparklines and status badges |
| `/experiments/[id]` | Experiment detail — AI ReadoutCard, mSPRT card, CUPED variance reduction card, SRM banner (fires when randomization is broken), z-test stats cards, lift trend chart, conversion rate chart, funnel chart, and device/country segment table |
| `/metrics` | Metric registry showing the event taxonomy and daily event volume chart |
| `/settings` | Configuration browser — six read-only sections covering API config, database, DynamoDB, Bedrock, and Lambda settings |

---

## API Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/assign` | Variant assignment — returns or creates an `ASSIGN#` item in DynamoDB for the given `user_id` + `experiment_id`. Dual-writes to Aurora `raw_assignments`. |
| `POST` | `/api/ingest` | Accept a batch of events from the SDK. Dual-writes to DynamoDB (`EVT#` items) and Aurora `raw_events`. |
| `GET` | `/api/experiments` | List all experiments from Aurora with status, metric type, and variant config. |
| `GET` | `/api/experiments/[id]` | Single experiment by UUID. |
| `GET` | `/api/experiments/[id]/results` | Full statistical results: variant counts, z-test, mSPRT p-value, CUPED lift CI, SRM flag, and segment breakdown. |
| `POST` | `/api/experiments/[id]/readout` | Generate (and persist) an AI readout via Bedrock. Returns verdict, summary, recommendation, and confidence. |
| `GET` | `/api/experiments/[id]/timeseries` | Daily lift trend and funnel data for the experiment detail charts. |
| `GET` | `/api/dashboard` | Aggregate KPI data for the workspace overview. |
| `GET` | `/api/dashboard/comparison` | Side-by-side stats across all running experiments for the comparative grid. |
| `GET` | `/api/dashboard/timeseries` | 7-day sparkline series for the KPI cards. |
| `GET` | `/api/metrics` | Event taxonomy and daily volume from Aurora `raw_events`. |
| `GET` | `/api/settings` | Read-only configuration summary. |

---

## Lambdas

### `lambdas/aggregator/` — Real-time stats engine

Triggered by DynamoDB Streams (batch size 100, 5-second window). For each batch:

1. Groups `EVT#` records by experiment and variant; increments `SUMMARY#` counters via atomic ADD.
2. Counts new `ASSIGN#` inserts and increments `ASSIGN_COUNT#` counters (used for SRM, to avoid inflation from multi-fire events).
3. For each affected experiment, reads `SUMMARY#` totals and runs:
   - Two-proportion z-test (binary metrics)
   - mSPRT always-valid p-value
   - χ² SRM check on `ASSIGN_COUNT#` items
   - CUPED variance reduction on all `ASSIGN#` items
4. Writes `STATS#latest`, `STATS#cuped#latest`, `STATS#cuped#control`, `STATS#cuped#treatment`, and `SRM#detected` items back to DynamoDB.

All statistical computations are pure Python with no scipy dependency. See [root README](../README.md#pure-python-statistics-library) for implementation details.

### `lambdas/dbt-runner/` — Analytics pipeline

A containerized Lambda (ECR image) triggered by EventBridge every 15 minutes. Runs `dbt run` then `dbt test` against Aurora via a subprocess wrapper (`run_dbt.py`) that patches `multiprocessing.synchronize` before importing dbt — required because Lambda containers don't mount `/dev/shm`. All writable paths redirect to `/tmp`.

---

## dbt Models

Four models in a staging → intermediate → mart pattern:

| Model | Materialization | Purpose |
|---|---|---|
| `stg_events` | View | Cleans `raw_events`; extracts `device` and `country` from the `context` JSON column |
| `stg_assignments` | View | Cleans `raw_assignments` — one row per user per experiment |
| `int_user_outcomes` | View | Joins assignments to events; resolves per-user conversion outcome for each primary metric |
| `mart_segment_results` | Table (with btree index) | Pivots device and country into `(segment_dimension, segment_value)` rows with per-variant conversion rates; read directly by the dashboard's segment table |

---

## Local Development

```bash
npm install
npm run dev  # http://localhost:3001
```

### Required environment variables

```bash
# Aurora PostgreSQL
DATABASE_URL=postgresql://user:password@host/caliper?sslmode=require

# AWS credentials (DynamoDB + Bedrock)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
DYNAMODB_TABLE_NAME=caliper-main

# Bedrock model IDs
BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_FALLBACK_MODEL_ID=us.amazon.nova-lite-v1:0

# API auth
CALIPER_API_KEY=caliper_demo_key_public
```

---

## Testing

The aggregator Lambda's statistical library has 33 unit tests covering all five statistical methods:

```bash
cd lambdas/aggregator
python -m pytest tests/ -v
```

Tests cross-validate the pure Python implementations against `scipy.stats` reference values. scipy is used only as an oracle in the test suite — it is not imported anywhere in the Lambda code itself.

Install test dependencies from `scripts/requirements.txt` (not the aggregator's own `requirements.txt`, which is intentionally empty since the Lambda layer provides runtime dependencies):

```bash
pip install -r ../scripts/requirements.txt
```
