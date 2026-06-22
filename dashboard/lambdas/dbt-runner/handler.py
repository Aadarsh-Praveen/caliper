"""
Caliper dbt Runner — executes `dbt run` and `dbt test` on a schedule.

Triggered by EventBridge cron rule every 15 minutes.
Reads Aurora credentials from env vars; uses analytics/profiles.yml.
"""
import os
import subprocess
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
        # run_dbt.py patches multiprocessing.synchronize.RLock with a threading
        # equivalent before importing dbt — needed because Lambda containers don't
        # mount /dev/shm, which Python's POSIX semaphore-based locks require.
        wrapper = os.path.join(os.environ.get("LAMBDA_TASK_ROOT", "."), "run_dbt.py")

        # dbt run — all writable paths redirect to /tmp (Lambda's only writable dir)
        run_result = subprocess.run(
            ["python3", wrapper, "run",
             "--project-dir", analytics_dir,
             "--profiles-dir", analytics_dir,
             "--log-path", "/tmp",
             "--target-path", "/tmp/dbt_target",
             "--no-write-json"],
            capture_output=True,
            text=True,
            timeout=240,  # 4 min hard cap (Lambda timeout is 5 min)
        )
        print(f"[dbt run] stdout: {run_result.stdout[-2000:]}")
        if run_result.returncode != 0:
            print(f"[dbt run] stderr: {run_result.stderr[-2000:]}")
            return error_response("dbt run failed", run_result.stderr[-500:])

        # dbt test
        test_result = subprocess.run(
            ["python3", wrapper, "test",
             "--project-dir", analytics_dir,
             "--profiles-dir", analytics_dir,
             "--log-path", "/tmp",
             "--target-path", "/tmp/dbt_target",
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
