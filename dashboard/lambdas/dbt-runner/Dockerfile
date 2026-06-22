# Use the AWS-published Python base image for Lambda containers
FROM public.ecr.aws/lambda/python:3.12

# Install pre-compiled psycopg2 binary (provides the psycopg2 Python module at runtime)
RUN pip install --no-cache-dir psycopg2-binary==2.9.9

# Install dbt-postgres without its deps so pip doesn't try to build psycopg2 from source.
# psycopg2-binary above already satisfies the runtime import; pip just doesn't know that.
RUN pip install --no-cache-dir --no-deps dbt-postgres==1.8.0

# Install dbt-core with full deps (pulls in everything else dbt needs)
RUN pip install --no-cache-dir dbt-core==1.8.0

# Copy dbt project into the container
# Build context is the monorepo root; we copy from dashboard/analytics/
COPY dashboard/analytics/ ${LAMBDA_TASK_ROOT}/analytics/

# Copy the handler and the dbt wrapper (patches multiprocessing before dbt runs)
COPY dashboard/lambdas/dbt-runner/handler.py ${LAMBDA_TASK_ROOT}/
COPY dashboard/lambdas/dbt-runner/run_dbt.py ${LAMBDA_TASK_ROOT}/

# Set the entrypoint
CMD ["handler.lambda_handler"]
