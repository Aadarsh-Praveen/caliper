#!/usr/bin/env bash
# Deploy caliper-aggregator Lambda.
# All stats are pure Python (math module only) — no scipy dependency.
# boto3 is provided by the Lambda runtime.
# Nothing extra needs to be bundled in the zip.
set -e

cd "$(dirname "$0")"

echo "Building aggregator deployment package..."

rm -rf package aggregator.zip
mkdir -p package

# Copy source code only (no pip install — deps come from Lambda layer + runtime)
cp handler.py package/
cp -r stats package/

# Zip
cd package && zip -r9 ../aggregator.zip . -x "*.pyc" -x "__pycache__/*" && cd ..

echo "Package size: $(du -sh aggregator.zip | cut -f1)"

# Deploy to existing Lambda
aws lambda update-function-code \
  --function-name caliper-aggregator \
  --zip-file fileb://aggregator.zip \
  --region us-east-1 \
  --output json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"Deployed: {d['FunctionName']} ({d['CodeSize']:,} bytes, runtime {d['Runtime']})\")
"

echo "Done. CloudWatch logs:"
echo "  https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252Fcaliper-aggregator"
