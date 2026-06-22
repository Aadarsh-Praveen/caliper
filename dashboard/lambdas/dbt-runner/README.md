# dbt-runner Lambda

Runs `dbt run` + `dbt test` against Aurora every 15 minutes.

## One-time setup

After running `bash deploy.sh` successfully, you'll need to do these manually in AWS Console:

### 1. Set environment variables on the Lambda

Lambda console → caliper-dbt-runner → Configuration → Environment variables:
- `AURORA_HOST` = caliper-aurora.cluster-c0ns46scw2ka.us-east-1.rds.amazonaws.com
- `AURORA_USER` = caliper_admin
- `AURORA_PASSWORD` = (your password from .env)

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
