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

# Build for linux/amd64. --provenance=false prevents buildx from creating an OCI
# manifest list (image index), which Lambda does not support.
docker build \
  --platform linux/amd64 \
  --provenance=false \
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
    --role "arn:aws:iam::${ACCOUNT_ID}:role/service-role/caliper-aggregator-role-zhx8jult" \
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
