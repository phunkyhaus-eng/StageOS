#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tools/set_github_env_secrets.sh <environment> <secrets-file> [repo]

Examples:
  tools/set_github_env_secrets.sh staging deploy/secrets/staging.secrets.local
  tools/set_github_env_secrets.sh production deploy/secrets/production.secrets.local owner/repo

Notes:
  - Supports both AWS and Render deployment profiles.
  - Profile detection:
    - DEPLOY_TARGET=aws|render (if present) wins.
    - Else auto-detect from keys in the file.
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

deploy_target="${DEPLOY_TARGET:-}"
if [ -z "$deploy_target" ]; then
  if [ -n "${RENDER_API_DEPLOY_HOOK_URL:-}" ] || [ -n "${RENDER_WEB_DEPLOY_HOOK_URL:-}" ]; then
    deploy_target="render"
  elif [ -n "${AWS_DEPLOY_ROLE_ARN:-}" ] || [ -n "${ECS_CLUSTER_NAME:-}" ]; then
    deploy_target="aws"
  else
    deploy_target="render"
  fi
fi

if [ "$deploy_target" != "aws" ] && [ "$deploy_target" != "render" ]; then
  echo "DEPLOY_TARGET must be one of: aws, render"
  exit 1
fi

required_vars=()
if [ "$deploy_target" = "aws" ]; then
  required_vars=(
    DATABASE_URL
    AWS_REGION
    AWS_DEPLOY_ROLE_ARN
    ECS_CLUSTER_NAME
    ECS_API_SERVICE_NAME
    ECS_WEB_SERVICE_NAME
    ECS_WORKER_SERVICE_NAME
  )
else
  required_vars=(
    DATABASE_URL
    RENDER_API_DEPLOY_HOOK_URL
    RENDER_WEB_DEPLOY_HOOK_URL
  )
fi

if [ "$environment" = "staging" ]; then
  required_vars+=(
    STAGING_WEB_BASE_URL
    STAGING_API_BASE_URL
  )
fi

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
invalid_format=()
for key in "${required_vars[@]}"; do
  value="${!key}"

  if [[ "$value" == *"REPLACE_ME"* ]] || [[ "$value" == *"example"* ]] || [[ "$value" == *"PUT_REAL"* ]] || [[ "$value" == *"YOUR_REAL"* ]]; then
    invalid+=("$key")
  fi

  if [ "$key" = "AWS_DEPLOY_ROLE_ARN" ]; then
    if [[ ! "$value" =~ ^arn:aws(-[a-z0-9]+)?:iam::[0-9]{12}:role/.+ ]]; then
      invalid_format+=("$key")
    fi
  fi

  if [ "$key" = "DATABASE_URL" ]; then
    if [[ ! "$value" =~ ^postgres(ql)?:// ]]; then
      invalid_format+=("$key")
    fi
  fi

  if [ "$key" = "STAGING_WEB_BASE_URL" ] || [ "$key" = "STAGING_API_BASE_URL" ]; then
    if [[ ! "$value" =~ ^https?:// ]]; then
      invalid_format+=("$key")
    fi
  fi

  if [[ "$key" =~ ^RENDER_.*_DEPLOY_HOOK_URL$ ]]; then
    if [[ ! "$value" =~ ^https?:// ]]; then
      invalid_format+=("$key")
    fi
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

if [ "${#invalid_format[@]}" -gt 0 ]; then
  echo "These keys have invalid format:"
  for key in "${invalid_format[@]}"; do
    if [ "$key" = "AWS_DEPLOY_ROLE_ARN" ]; then
      echo "- $key (expected full IAM role ARN like arn:aws:iam::123456789012:role/role-name)"
    elif [ "$key" = "DATABASE_URL" ]; then
      echo "- $key (expected postgres:// or postgresql:// URL)"
    elif [[ "$key" =~ ^RENDER_.*_DEPLOY_HOOK_URL$ ]]; then
      echo "- $key (expected https:// Render deploy hook URL)"
    else
      echo "- $key (expected http:// or https:// URL)"
    fi
  done
  echo "Update $secrets_file and run again."
  exit 1
fi

upload_vars=()
for key in "${loaded_vars[@]}"; do
  if [ "$key" = "DEPLOY_TARGET" ]; then
    continue
  fi
  upload_vars+=("$key")
done

if [ "${#upload_vars[@]}" -eq 0 ]; then
  echo "No keys found to upload."
  exit 1
fi

for key in "${upload_vars[@]}"; do
  value="${!key:-}"
  if [ -z "$value" ]; then
    continue
  fi
  if [ -n "$repo" ]; then
    printf '%s' "$value" | gh secret set "$key" --env "$environment" --repo "$repo" --body -
  else
    printf '%s' "$value" | gh secret set "$key" --env "$environment" --body -
  fi
  echo "Set $key for environment $environment"
done

echo "Done. Environment secrets updated for: $environment (profile: $deploy_target)"
