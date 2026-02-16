#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="${1:-deploy/secrets/staging.secrets.local}"
AWS_REGION_INPUT="${2:-${AWS_REGION:-us-east-1}}"

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required. Install it first."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS CLI not authenticated. Run: aws configure sso (or aws configure), then retry."
  exit 1
fi

aws_get_secret() {
  local secret_id="$1"
  aws secretsmanager get-secret-value \
    --region "$AWS_REGION_INPUT" \
    --secret-id "$secret_id" \
    --query SecretString \
    --output text 2>/dev/null || true
}

json_get() {
  local key="$1"
  python3 - "$key" <<'PY'
import json
import sys

key = sys.argv[1]
raw = sys.stdin.read().strip()
if not raw:
    print("")
    raise SystemExit(0)

try:
    obj = json.loads(raw)
except Exception:
    print(raw if key == "__raw__" else "")
    raise SystemExit(0)

value = obj.get(key, "")
if value is None:
    value = ""
print(str(value))
PY
}

NAME_PREFIX="stageos-staging"

DATABASE_SECRET_RAW="$(aws_get_secret "${NAME_PREFIX}/database")"
RUNTIME_SECRET_RAW="$(aws_get_secret "${NAME_PREFIX}/runtime")"

DATABASE_URL="$(printf '%s' "$DATABASE_SECRET_RAW" | json_get "DATABASE_URL")"
STAGING_WEB_BASE_URL="$(printf '%s' "$RUNTIME_SECRET_RAW" | json_get "APP_URL")"
STAGING_API_BASE_URL="$(printf '%s' "$RUNTIME_SECRET_RAW" | json_get "API_BASE_URL")"

if [ -z "$DATABASE_URL" ]; then
  DATABASE_SECRET_ARN="$(aws secretsmanager list-secrets \
    --region "$AWS_REGION_INPUT" \
    --query "SecretList[?contains(Name, 'stageos-staging') && contains(Name, 'database')].ARN | [0]" \
    --output text 2>/dev/null || true)"
  if [ -n "${DATABASE_SECRET_ARN:-}" ] && [ "$DATABASE_SECRET_ARN" != "None" ]; then
    DATABASE_SECRET_RAW="$(aws_get_secret "$DATABASE_SECRET_ARN")"
    DATABASE_URL="$(printf '%s' "$DATABASE_SECRET_RAW" | json_get "DATABASE_URL")"
  fi
fi

if [ -z "$STAGING_WEB_BASE_URL" ] || [ -z "$STAGING_API_BASE_URL" ]; then
  RUNTIME_SECRET_ARN="$(aws secretsmanager list-secrets \
    --region "$AWS_REGION_INPUT" \
    --query "SecretList[?contains(Name, 'stageos-staging') && contains(Name, 'runtime')].ARN | [0]" \
    --output text 2>/dev/null || true)"
  if [ -n "${RUNTIME_SECRET_ARN:-}" ] && [ "$RUNTIME_SECRET_ARN" != "None" ]; then
    RUNTIME_SECRET_RAW="$(aws_get_secret "$RUNTIME_SECRET_ARN")"
    [ -z "$STAGING_WEB_BASE_URL" ] && STAGING_WEB_BASE_URL="$(printf '%s' "$RUNTIME_SECRET_RAW" | json_get "APP_URL")"
    [ -z "$STAGING_API_BASE_URL" ] && STAGING_API_BASE_URL="$(printf '%s' "$RUNTIME_SECRET_RAW" | json_get "API_BASE_URL")"
  fi
fi

AWS_DEPLOY_ROLE_ARN="$(aws iam list-roles \
  --query "Roles[?contains(RoleName, 'stageos') && contains(RoleName, 'staging') && contains(RoleName, 'github')].Arn | [0]" \
  --output text 2>/dev/null || true)"
[ "$AWS_DEPLOY_ROLE_ARN" = "None" ] && AWS_DEPLOY_ROLE_ARN=""

ECS_CLUSTER_ARN="$(aws ecs list-clusters \
  --region "$AWS_REGION_INPUT" \
  --query "clusterArns[?contains(@, 'stageos-staging-cluster')] | [0]" \
  --output text 2>/dev/null || true)"

if [ -z "$ECS_CLUSTER_ARN" ] || [ "$ECS_CLUSTER_ARN" = "None" ]; then
  ECS_CLUSTER_ARN="$(aws ecs list-clusters \
    --region "$AWS_REGION_INPUT" \
    --query "clusterArns[?contains(@, 'stageos') && contains(@, 'staging')] | [0]" \
    --output text 2>/dev/null || true)"
fi

ECS_CLUSTER_NAME=""
if [ -n "$ECS_CLUSTER_ARN" ] && [ "$ECS_CLUSTER_ARN" != "None" ]; then
  ECS_CLUSTER_NAME="${ECS_CLUSTER_ARN##*/}"
fi

ECS_API_SERVICE_NAME=""
ECS_WEB_SERVICE_NAME=""
ECS_WORKER_SERVICE_NAME=""
if [ -n "$ECS_CLUSTER_NAME" ]; then
  SERVICES="$(
    aws ecs list-services \
      --region "$AWS_REGION_INPUT" \
      --cluster "$ECS_CLUSTER_NAME" \
      --query "serviceArns[]" \
      --output text 2>/dev/null | tr '\t' '\n' | sed 's#.*/##'
  )"
  ECS_API_SERVICE_NAME="$(printf '%s\n' "$SERVICES" | grep -E '(^|-)api($|-)' | head -n1 || true)"
  ECS_WEB_SERVICE_NAME="$(printf '%s\n' "$SERVICES" | grep -E '(^|-)web($|-)|frontend' | head -n1 || true)"
  ECS_WORKER_SERVICE_NAME="$(printf '%s\n' "$SERVICES" | grep -E '(^|-)worker($|-)' | head -n1 || true)"
fi

if [ -z "$STAGING_WEB_BASE_URL" ] || [ -z "$STAGING_API_BASE_URL" ]; then
  ALB_DNS="$(aws elbv2 describe-load-balancers \
    --region "$AWS_REGION_INPUT" \
    --query "LoadBalancers[?contains(LoadBalancerName, 'stageos-staging-alb')].DNSName | [0]" \
    --output text 2>/dev/null || true)"
  [ "$ALB_DNS" = "None" ] && ALB_DNS=""

  if [ -n "$ALB_DNS" ]; then
    [ -z "$STAGING_WEB_BASE_URL" ] && STAGING_WEB_BASE_URL="http://${ALB_DNS}"
    [ -z "$STAGING_API_BASE_URL" ] && STAGING_API_BASE_URL="http://${ALB_DNS}"
  fi
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"
cat >"$OUTPUT_FILE" <<EOF
# Required for migrations and ECS deploy workflows
DATABASE_URL=${DATABASE_URL:-<MISSING_DATABASE_URL>}
AWS_REGION=${AWS_REGION_INPUT}
AWS_DEPLOY_ROLE_ARN=${AWS_DEPLOY_ROLE_ARN:-<MISSING_AWS_DEPLOY_ROLE_ARN>}
ECS_CLUSTER_NAME=${ECS_CLUSTER_NAME:-<MISSING_ECS_CLUSTER_NAME>}
ECS_API_SERVICE_NAME=${ECS_API_SERVICE_NAME:-<MISSING_ECS_API_SERVICE_NAME>}
ECS_WEB_SERVICE_NAME=${ECS_WEB_SERVICE_NAME:-<MISSING_ECS_WEB_SERVICE_NAME>}
ECS_WORKER_SERVICE_NAME=${ECS_WORKER_SERVICE_NAME:-<MISSING_ECS_WORKER_SERVICE_NAME>}

# Required for staging smoke checks
STAGING_WEB_BASE_URL=${STAGING_WEB_BASE_URL:-<MISSING_STAGING_WEB_BASE_URL>}
STAGING_API_BASE_URL=${STAGING_API_BASE_URL:-<MISSING_STAGING_API_BASE_URL>}
EOF

echo "Wrote ${OUTPUT_FILE}"

missing=()
for key in \
  DATABASE_URL \
  AWS_DEPLOY_ROLE_ARN \
  ECS_CLUSTER_NAME \
  ECS_API_SERVICE_NAME \
  ECS_WEB_SERVICE_NAME \
  ECS_WORKER_SERVICE_NAME \
  STAGING_WEB_BASE_URL \
  STAGING_API_BASE_URL; do
  value="$(grep "^${key}=" "$OUTPUT_FILE" | sed "s/^${key}=//")"
  if [[ "$value" == "<MISSING_"* ]]; then
    missing+=("$key")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing values that could not be auto-discovered:"
  for key in "${missing[@]}"; do
    echo "- ${key}"
  done
  exit 2
fi

echo "All required staging values were discovered."
