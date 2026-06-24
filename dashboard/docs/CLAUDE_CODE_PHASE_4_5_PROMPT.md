# Caliper Phase 4.5 — dbt Analytics on Scheduled Lambda

**Paste this entire document into Claude Code running inside the `caliper/` monorepo root. Read it end-to-end before starting.**

---

## 0. Context

**Done in previous phases:**
- Production live at `caliper-xi.vercel.app`
- DynamoDB (events + assignments) + Aurora (config + readouts) all working
- Aggregator Lambda processing DynamoDB Streams
- 5 statistical methods + Bedrock readouts shipping
- Dashboard renders ReadoutCard, CUPED card, mSPRT card, SRM banner

**What you're building now:**

A dbt-core analytics pipeline that models raw event data into a segment-level mart table, deployed as a containerized Lambda triggered on a 15-minute schedule.

End-to-end:
```
synthetic_generator → Aurora.raw_events → dbt Lambda → Aurora.mart_segment_results
                                                       ↓
                                                  Dashboard reads here
```

**What you're NOT building:**

- ❌ Real-time DynamoDB → Aurora replication (the synthetic generator writes to both)
- ❌ dbt snapshots, macros, custom materializations
- ❌ dbt Cloud
- ❌ Incremental models (full-refresh is fine at our volume)
- ❌ dbt docs hosting

## 1. Pre-flight assumptions

The user has already done these — verify they exist, do NOT re-create:

- Docker installed locally (verify: `docker --version`)
- ECR repository `caliper-dbt` created in us-east-1
- Aurora tables `raw_events` and `raw_assignments` created (verify with `\dt` in pgcli)

If any are missing, stop and tell the user before proceeding.

## 2. File structure to create

```
dashboard/
├── analytics/                          ← NEW dbt project root
│   ├── dbt_project.yml
│   ├── profiles.yml                    (uses env vars for DB creds)
│   ├── packages.yml
│   ├── models/
│   │   ├── sources.yml
│   │   ├── staging/
│   │   │   ├── stg_events.sql
│   │   │   ├── stg_assignments.sql
│   │   │   └── _staging.yml            (tests + descriptions)
│   │   ├── intermediate/
│   │   │   └── int_user_outcomes.sql
│   │   └── marts/
│   │       ├── mart_segment_results.sql
│   │       └── _marts.yml
│   └── tests/
│       └── assert_segment_totals_match.sql
└── lambdas/
    └── dbt-runner/                     ← NEW container Lambda
        ├── Dockerfile
        ├── handler.py
        ├── requirements.txt
        ├── deploy.sh
        └── README.md
```

## 3. Update synthetic data generator to write to Aurora

`dashboard/scripts/generate_demo_data.py` currently writes to DynamoDB only. Update it to ALSO write to the new Aurora `raw_events` and `raw_assignments` tables.

Implementation:

```python
import psycopg
from psycopg.rows import dict_row

def write_to_aurora(conn, events_batch, assignments_batch):
    """Bulk insert into raw_events and raw_assignments using COPY."""
    with conn.cursor() as cur:
        # Use psycopg's COPY for speed — at 30K events, individual inserts are too slow
        with cur.copy("COPY raw_events (experiment_id, user_id, variant, event_name, properties, context, ts) FROM STDIN") as copy:
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
        
        with cur.copy("COPY raw_assignments (experiment_id, user_id, variant, pre_experiment_activity, assigned_at) FROM STDIN") as copy:
            for a in assignments_batch:
                copy.write_row((
                    a["experiment_id"],
                    a["user_id"],
                    a["variant"],
                    float(a.get("pre_experiment_activity", 0)),
                    a["assigned_at"],
                ))
    conn.commit()
```

Connect via the same `DATABASE_URL` pattern used elsewhere. The wipe step at the start of the generator should also `TRUNCATE raw_events, raw_assignments` so reruns don't accumulate duplicates.

Add a `--skip-aurora` flag for cases where you only want DynamoDB writes. Default behavior writes to both.

## 4. dbt project setup

### 4.1 `dbt_project.yml`

```yaml
name: 'caliper'
version: '1.0.0'
config-version: 2

profile: 'caliper'

model-paths: ["models"]
test-paths: ["tests"]

target-path: "target"
clean-targets:
  - "target"
  - "dbt_packages"

models:
  caliper:
    staging:
      +materialized: view
    intermediate:
      +materialized: view
    marts:
      +materialized: table
```

### 4.2 `profiles.yml`

Stored in `analytics/` (not the default `~/.dbt/profiles.yml`). Reads from environment variables:

```yaml
caliper:
  target: prod
  outputs:
    prod:
      type: postgres
      host: "{{ env_var('AURORA_HOST') }}"
      port: 5432
      user: "{{ env_var('AURORA_USER') }}"
      password: "{{ env_var('AURORA_PASSWORD') }}"
      dbname: caliper
      schema: public
      sslmode: require
      threads: 4
```

### 4.3 `packages.yml`

Empty or with `dbt_utils` if needed. For our scope, skip dbt_utils — we don't need its macros.

### 4.4 `models/sources.yml`

```yaml
version: 2

sources:
  - name: raw
    schema: public
    description: "Raw event and assignment data from Caliper SDK"
    tables:
      - name: raw_events
        description: "Every event fired by the Caliper SDK, written by the synthetic data generator (for the hackathon demo) and by the ingestion API in production."
        columns:
          - name: event_id
            tests: [unique, not_null]
          - name: experiment_id
            tests: [not_null]
          - name: user_id
            tests: [not_null]
          - name: variant
            tests:
              - not_null
              - accepted_values:
                  values: ['control', 'treatment']
          - name: event_name
            tests: [not_null]
          - name: ts
            tests: [not_null]
      
      - name: raw_assignments
        description: "One row per user per experiment — the variant assignment from the SDK."
        columns:
          - name: assignment_id
            tests: [unique, not_null]
          - name: experiment_id
            tests: [not_null]
          - name: user_id
            tests: [not_null]
          - name: variant
            tests:
              - accepted_values:
                  values: ['control', 'treatment']
```

### 4.5 `models/staging/stg_events.sql`

```sql
{{ config(materialized='view') }}

with source as (
    select * from {{ source('raw', 'raw_events') }}
)

select
    event_id,
    experiment_id,
    user_id,
    variant,
    event_name,
    properties,
    -- Extract device and country from context JSON for downstream use
    context->>'device' as device,
    context->>'country' as country,
    ts as event_ts,
    created_at
from source
```

### 4.6 `models/staging/stg_assignments.sql`

```sql
{{ config(materialized='view') }}

with source as (
    select * from {{ source('raw', 'raw_assignments') }}
)

select
    assignment_id,
    experiment_id,
    user_id,
    variant,
    pre_experiment_activity,
    assigned_at
from source
```

### 4.7 `models/staging/_staging.yml`

```yaml
version: 2

models:
  - name: stg_events
    description: "Cleaned events with device and country extracted from context."
    columns:
      - name: event_id
        tests: [unique, not_null]
      - name: device
      - name: country
  
  - name: stg_assignments
    description: "Cleaned assignments — one row per user per experiment."
    columns:
      - name: assignment_id
        tests: [unique, not_null]
      - name: user_id
        tests: [not_null]
```

### 4.8 `models/intermediate/int_user_outcomes.sql`

Join events to assignments, compute per-user conversion status. The "conversion event" varies by experiment, so we hardcode the primary metric mapping here:

```sql
{{ config(materialized='view') }}

with assignments as (
    select * from {{ ref('stg_assignments') }}
),
events as (
    select * from {{ ref('stg_events') }}
),
-- For each user-experiment pair, did they convert on the primary metric?
conversions as (
    select 
        experiment_id,
        user_id,
        max(case when event_name = 'buy_section_view' then 1 else 0 end) as converted_buy_section_view,
        max(case when event_name = 'add_to_cart' then 1 else 0 end) as converted_add_to_cart,
        max(case when event_name = 'nav_cta_click' then 1 else 0 end) as converted_nav_cta_click,
        max(device) as device,        -- first-observed device per user
        max(country) as country        -- first-observed country per user
    from events
    group by experiment_id, user_id
),
joined as (
    select
        a.experiment_id,
        a.user_id,
        a.variant,
        a.pre_experiment_activity,
        coalesce(c.device, 'unknown') as device,
        coalesce(c.country, 'unknown') as country,
        -- Pick the right conversion column per experiment
        case 
            when a.experiment_id = 'hero_cta_test' then c.converted_buy_section_view
            when a.experiment_id = 'buy_button_test' then c.converted_add_to_cart
            when a.experiment_id = 'nav_layout_test' then c.converted_nav_cta_click
            else 0
        end as converted
    from assignments a
    left join conversions c
        on a.experiment_id = c.experiment_id 
        and a.user_id = c.user_id
)

select * from joined
```

### 4.9 `models/marts/mart_segment_results.sql`

The final table the dashboard reads:

```sql
{{ config(
    materialized='table',
    indexes=[
      {'columns': ['experiment_id', 'segment_dimension'], 'type': 'btree'}
    ]
) }}

with user_outcomes as (
    select * from {{ ref('int_user_outcomes') }}
),
-- Unpivot device and country into a single (dimension, value) column
unpivoted as (
    select 
        experiment_id, 
        variant, 
        'device' as segment_dimension, 
        device as segment_value, 
        converted
    from user_outcomes
    
    union all
    
    select 
        experiment_id, 
        variant, 
        'country' as segment_dimension, 
        country as segment_value, 
        converted
    from user_outcomes
)
select
    experiment_id,
    variant,
    segment_dimension,
    segment_value,
    count(*) as n,
    sum(converted) as conversions,
    case 
        when count(*) > 0 then sum(converted)::float / count(*)::float
        else 0
    end as conversion_rate,
    now() as computed_at
from unpivoted
group by experiment_id, variant, segment_dimension, segment_value
```

### 4.10 `models/marts/_marts.yml`

```yaml
version: 2

models:
  - name: mart_segment_results
    description: "Per-experiment, per-variant, per-segment conversion rates. Read by the Caliper dashboard's segment breakdown card."
    columns:
      - name: experiment_id
        tests: [not_null]
      - name: variant
        tests:
          - not_null
          - accepted_values:
              values: ['control', 'treatment']
      - name: segment_dimension
        tests:
          - not_null
          - accepted_values:
              values: ['device', 'country']
      - name: segment_value
        tests: [not_null]
      - name: n
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: ">= 0"
              config:
                where: "n is not null"
```

(Remove the `dbt_utils.expression_is_true` test if dbt_utils isn't installed — the test is nice-to-have.)

### 4.11 `tests/assert_segment_totals_match.sql`

Sanity test: total users across all segments for an experiment should equal total assignments for that experiment.

```sql
-- Returns rows that FAIL the test (totals don't match)
with mart_totals as (
    select 
        experiment_id,
        variant,
        sum(n) as total_segment_users
    from {{ ref('mart_segment_results') }}
    where segment_dimension = 'device'  -- Only one dimension to avoid double-counting
    group by experiment_id, variant
),
assignment_totals as (
    select 
        experiment_id,
        variant,
        count(*) as total_assignments
    from {{ ref('stg_assignments') }}
    group by experiment_id, variant
),
joined as (
    select 
        m.experiment_id,
        m.variant,
        m.total_segment_users,
        a.total_assignments
    from mart_totals m
    join assignment_totals a 
        on m.experiment_id = a.experiment_id 
        and m.variant = a.variant
)
select * from joined where total_segment_users != total_assignments
```

## 5. The dbt-runner Lambda (container image)

### 5.1 `lambdas/dbt-runner/Dockerfile`

```dockerfile
# Use the AWS-published Python base image for Lambda containers
FROM public.ecr.aws/lambda/python:3.12

# Install dbt-postgres
RUN pip install --no-cache-dir \
    dbt-core==1.8.0 \
    dbt-postgres==1.8.0

# Copy dbt project into the container
# Build context is the monorepo root; we copy from dashboard/analytics/
COPY dashboard/analytics/ ${LAMBDA_TASK_ROOT}/analytics/

# Copy the handler
COPY dashboard/lambdas/dbt-runner/handler.py ${LAMBDA_TASK_ROOT}/

# Set the entrypoint
CMD ["handler.lambda_handler"]
```

### 5.2 `lambdas/dbt-runner/handler.py`

```python
"""
Caliper dbt Runner — executes `dbt run` and `dbt test` on a schedule.

Triggered by EventBridge cron rule every 15 minutes.
Reads Aurora credentials from env vars; uses analytics/profiles.yml.
"""
import os
import subprocess
import sys
import json


def lambda_handler(event, context):
    print(f"[dbt-runner] Starting run at {context.aws_request_id if context else 'local'}")
    
    # Verify env vars
    required = ["AURORA_HOST", "AURORA_USER", "AURORA_PASSWORD"]
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        return error_response(f"Missing env vars: {missing}")
    
    analytics_dir = os.path.join(os.environ.get("LAMBDA_TASK_ROOT", "."), "analytics")
    
    try:
        # Step 1: dbt deps (skip — we don't use packages)
        # Step 2: dbt run
        run_result = subprocess.run(
            ["dbt", "run", 
             "--project-dir", analytics_dir,
             "--profiles-dir", analytics_dir,
             "--no-write-json"],
            capture_output=True,
            text=True,
            timeout=240,  # 4 min hard cap (Lambda timeout is 5 min)
        )
        print(f"[dbt run] stdout: {run_result.stdout[-2000:]}")
        if run_result.returncode != 0:
            print(f"[dbt run] stderr: {run_result.stderr[-2000:]}")
            return error_response("dbt run failed", run_result.stderr[-500:])
        
        # Step 3: dbt test
        test_result = subprocess.run(
            ["dbt", "test",
             "--project-dir", analytics_dir,
             "--profiles-dir", analytics_dir,
             "--no-write-json"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        print(f"[dbt test] stdout: {test_result.stdout[-2000:]}")
        if test_result.returncode != 0:
            print(f"[dbt test] stderr: {test_result.stderr[-2000:]}")
            # Don't fail the Lambda if tests fail — log and continue
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "run": "succeeded",
                    "test": "failed",
                    "warning": "dbt run succeeded but tests failed",
                })
            }
        
        return {
            "statusCode": 200,
            "body": json.dumps({"run": "succeeded", "test": "succeeded"})
        }
    
    except subprocess.TimeoutExpired:
        return error_response("dbt execution timed out")
    except Exception as e:
        return error_response(f"Unexpected error: {str(e)}")


def error_response(message, detail=""):
    print(f"[ERROR] {message} {detail}")
    return {
        "statusCode": 500,
        "body": json.dumps({"error": message, "detail": detail})
    }
```

### 5.3 `lambdas/dbt-runner/deploy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build and deploy the dbt-runner Lambda container image to ECR + Lambda

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="caliper-dbt"
IMAGE_TAG="latest"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"
FUNCTION_NAME="caliper-dbt-runner"

# Get the monorepo root (two levels up from this script)
SCRIPT_DIR="$( cd -- "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd )"
REPO_ROOT="$( cd -- "$SCRIPT_DIR/../../.." &> /dev/null && pwd )"

echo "Building container from $REPO_ROOT..."

# Authenticate Docker to ECR
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Build for linux/amd64 (Lambda containers don't currently support arm64 for Python base images in all regions)
docker build \
  --platform linux/amd64 \
  -t "${ECR_REPO}:${IMAGE_TAG}" \
  -f "$REPO_ROOT/dashboard/lambdas/dbt-runner/Dockerfile" \
  "$REPO_ROOT"

# Tag for ECR and push
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:${IMAGE_TAG}"

echo "Pushed: ${ECR_URI}:${IMAGE_TAG}"

# Check if the function exists; create or update
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "Updating existing function..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --image-uri "${ECR_URI}:${IMAGE_TAG}" \
    --region "$REGION" \
    --output text > /dev/null
else
  echo "Creating new function..."
  echo "NOTE: You'll need to set the execution role manually. See README.md."
  # Create with placeholder role; user will fix via AWS Console
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --package-type Image \
    --code "ImageUri=${ECR_URI}:${IMAGE_TAG}" \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/caliper-aggregator-role-zhx8jult" \
    --timeout 300 \
    --memory-size 1024 \
    --architectures x86_64 \
    --region "$REGION"
fi

echo "Done."
echo ""
echo "Next steps (manual):"
echo "  1. In Lambda console → caliper-dbt-runner → Configuration → Environment variables, add:"
echo "       AURORA_HOST=caliper-aurora.cluster-c0ns46scw2ka.us-east-1.rds.amazonaws.com"
echo "       AURORA_USER=caliper_admin"
echo "       AURORA_PASSWORD=<password>"
echo "  2. Set up EventBridge cron rule (see README.md)"
echo "  3. Invoke once manually via Lambda Test to populate mart_segment_results"
```

### 5.4 `lambdas/dbt-runner/README.md`

Document the EventBridge cron setup the user needs to do manually:

```markdown
# dbt-runner Lambda

Runs `dbt run` + `dbt test` against Aurora every 15 minutes.

## One-time setup

After running `bash deploy.sh` successfully, you'll need to do these manually in AWS Console:

### 1. Set environment variables on the Lambda

Lambda console → caliper-dbt-runner → Configuration → Environment variables:
- `AURORA_HOST` = caliper-aurora.cluster-c0ns46scw2ka.us-east-1.rds.amazonaws.com
- `AURORA_USER` = caliper_admin
- `AURORA_PASSWORD` = (your rotated password)

### 2. Ensure execution role has Aurora connectivity

The Lambda needs network access to Aurora. Two options:
- **Option A (simpler)**: Aurora is publicly accessible with security group 0.0.0.0/0 → no changes needed
- **Option B**: VPC-attach the Lambda. Adds complexity; skip for hackathon.

### 3. Create the EventBridge cron rule

EventBridge → Rules → Create rule:
- Name: `caliper-dbt-schedule`
- Schedule pattern: `rate(15 minutes)`
- Target: Lambda function `caliper-dbt-runner`

### 4. Test invocation

Lambda console → Test → create empty event `{}` → Run.

Check CloudWatch logs for output. After successful run, query Aurora:

```sql
SELECT COUNT(*) FROM mart_segment_results;
```

You should see 12-40 rows (3 experiments × 2 variants × 2 dimensions × 2-10 values).
```

## 6. Dashboard integration

### 6.1 Add a `segments` field to `lib/experiment-results.ts`

The shared results function should now also query the `mart_segment_results` table and include segment data in the response:

```ts
// Inside computeExperimentResults, after computing variant stats:
const segments = await query<any>(
  `SELECT 
    segment_dimension, segment_value, variant, n, conversions, conversion_rate
  FROM mart_segment_results
  WHERE experiment_id = $1
  ORDER BY segment_dimension, segment_value, variant`,
  [experiment.slug]   // NOTE: mart uses slug as experiment_id, not UUID
);

return {
  // ... existing fields ...
  segments: segments,  // array of {segment_dimension, segment_value, variant, n, conversions, conversion_rate}
};
```

Update `lib/types.ts` to add the segments shape on `ExperimentResults`.

### 6.2 Update the experiment detail page

In `dashboard/app/(dashboard)/experiments/[id]/page.tsx`, the "Segment Breakdown" section currently shows a placeholder. Replace with a real table populated from `results.segments`.

The component already exists as `dashboard/components/experiments/SegmentTable.tsx`. Wire it up:

```tsx
import { SegmentTable } from "@/components/experiments/SegmentTable";

// In the page:
{results.segments && results.segments.length > 0 ? (
  <SegmentTable segments={results.segments} />
) : (
  <div className="text-zinc-500 text-sm">
    Segment analysis pending — dbt runs every 15 minutes.
  </div>
)}
```

Update `SegmentTable.tsx` to render:
- Group rows by segment_dimension
- Show two columns side by side per row: control rate, treatment rate, difference
- Highlight rows where the difference is significantly different from the overall lift

Simple version is fine — just a table with columns: Dimension | Value | Control (n, rate) | Treatment (n, rate) | Lift.

## 7. Deployment order

Execute in this order. Verify at each step before moving on:

### Step 1: Update synthetic data generator
- Add Aurora write logic
- Re-run: `python dashboard/scripts/generate_demo_data.py --n-users 3333 --days-back 7 --verbose`
- Verify in pgcli: `SELECT COUNT(*) FROM raw_events;` should be ~30K

### Step 2: Develop dbt locally first
- `cd dashboard/analytics`
- Install dbt locally for testing: `pip install dbt-core==1.8.0 dbt-postgres==1.8.0`
- Set env vars: `AURORA_HOST=...`, `AURORA_USER=...`, `AURORA_PASSWORD=...`
- Run: `dbt run --profiles-dir .`
- Run: `dbt test --profiles-dir .`
- Verify in pgcli: `SELECT COUNT(*) FROM mart_segment_results;` should be 12+ rows

### Step 3: Build and deploy Lambda
- `cd dashboard/lambdas/dbt-runner`
- `bash deploy.sh`
- This will build the Docker image, push to ECR, create/update the Lambda

### Step 4: Configure Lambda env vars + cron (user does this in AWS Console)
- Stop and tell the user to do the manual config steps from README.md
- Once user confirms, run a test invocation

### Step 5: Wire dashboard
- Update `lib/experiment-results.ts` to fetch segments
- Update detail page to render SegmentTable
- Push to git, Vercel auto-deploys

## 8. Definition of done

Before declaring complete:

1. ✅ `dbt run` succeeds locally — exits 0, creates `mart_segment_results`
2. ✅ `dbt test` succeeds locally — all tests pass
3. ✅ Lambda deployed via Docker — `aws lambda get-function --function-name caliper-dbt-runner` returns OK
4. ✅ Manual Lambda test invocation succeeds — returns `{"run": "succeeded", "test": "succeeded"}`
5. ✅ `mart_segment_results` populated with 12-40 rows
6. ✅ EventBridge rule firing on schedule (verify via CloudWatch Metrics after 30 min)
7. ✅ Dashboard renders segment table on experiment detail page
8. ✅ `npm run build` in dashboard/ still passes
9. ✅ All previous functionality unchanged

## 9. What to send back when done

1. Output of `dbt run --profiles-dir .` from local execution
2. Output of `dbt test --profiles-dir .` from local execution
3. Output of `bash deploy.sh` (the Docker build + push + Lambda update)
4. CloudWatch log snippet from one successful Lambda invocation
5. SQL query result: `SELECT * FROM mart_segment_results LIMIT 5;`
6. Screenshot of the experiment detail page showing the populated segment table

If anything fails, stop and tell the user. Do not silently work around issues — for instance, if Docker build fails due to platform mismatch, surface it.

---

Begin. Read this whole document first, then execute Section 3 → 4 → 5 → 6 → 7 in order.
