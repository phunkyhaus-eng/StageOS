#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tools/set_github_env_secrets.sh <environment> <secrets-file> [repo]

Examples:
  tools/set_github_env_secrets.sh staging deploy/secrets/staging.secrets.example
  tools/set_github_env_secrets.sh production deploy/secrets/production.secrets.example owner/repo

Secrets file format:
  KEY=value
  # comments supported
EOF
}

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ]; then
  usage
  exit 1
fi

environment="$1"
secrets_file="$2"
repo="${3:-}"

if [ "$environment" != "staging" ] && [ "$environment" != "production" ]; then
  echo "Environment must be one of: staging, production"
  exit 1
fi

if [ ! -f "$secrets_file" ]; then
  echo "Secrets file not found: $secrets_file"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login"
  exit 1
fi

required_common=(
  DATABASE_URL
  AWS_REGION
  AWS_DEPLOY_ROLE_ARN
  ECS_CLUSTER_NAME
  ECS_API_SERVICE_NAME
  ECS_WEB_SERVICE_NAME
  ECS_WORKER_SERVICE_NAME
)

required_staging=(
  STAGING_WEB_BASE_URL
  STAGING_API_BASE_URL
)

declare -a required_vars
required_vars=("${required_common[@]}")
if [ "$environment" = "staging" ]; then
  required_vars+=("${required_staging[@]}")
fi

loaded_vars=()
while IFS= read -r raw_line || [ -n "$raw_line" ]; do
  line="$(printf '%s' "$raw_line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [ -z "$line" ]; then
    continue
  fi
  if [[ "$line" == \#* ]]; then
    continue
  fi
  if [[ "$line" != *=* ]]; then
    echo "Invalid line in $secrets_file: $raw_line"
    exit 1
  fi

  key="${line%%=*}"
  value="${line#*=}"

  key="$(printf '%s' "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  value="$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  fi
  if [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  export "$key=$value"
  loaded_vars+=("$key")
done <"$secrets_file"

missing=()
for key in "${required_vars[@]}"; do
  if [ -z "${!key:-}" ]; then
    missing+=("$key")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required keys in $secrets_file:"
  for key in "${missing[@]}"; do
    echo "- $key"
  done
  exit 1
fi

invalid=()
for key in "${required_vars[@]}"; do
  value="${!key}"
  if [[ "$value" == *"REPLACE_ME"* ]] || [[ "$value" == *"example"* ]]; then
    invalid+=("$key")
  fi
done

if [ "${#invalid[@]}" -gt 0 ]; then
  echo "These keys still appear to contain placeholder values:"
  for key in "${invalid[@]}"; do
    echo "- $key"
  done
  echo "Update $secrets_file with real values and run again."
  exit 1
fi

for key in "${required_vars[@]}"; do
  value="${!key}"
  if [ -n "$repo" ]; then
    printf '%s' "$value" | gh secret set "$key" --env "$environment" --repo "$repo" --body -
  else
    printf '%s' "$value" | gh secret set "$key" --env "$environment" --body -
  fi
  echo "Set $key for environment $environment"
done

echo "Done. Environment secrets updated for: $environment"
