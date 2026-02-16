#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 VAR_NAME [VAR_NAME ...]"
  exit 1
fi

missing=()
invalid_format=()

for var_name in "$@"; do
  value="${!var_name:-}"
  if [ -z "$value" ]; then
    missing+=("$var_name")
    continue
  fi

  if [ "$var_name" = "AWS_DEPLOY_ROLE_ARN" ]; then
    if [[ ! "$value" =~ ^arn:aws(-[a-z0-9]+)?:iam::[0-9]{12}:role/.+ ]]; then
      invalid_format+=("$var_name")
    fi
  fi

  if [ "$var_name" = "DATABASE_URL" ]; then
    if [[ ! "$value" =~ ^postgres(ql)?:// ]]; then
      invalid_format+=("$var_name")
    fi
  fi

  if [ "$var_name" = "STAGING_WEB_BASE_URL" ] || [ "$var_name" = "STAGING_API_BASE_URL" ]; then
    if [[ ! "$value" =~ ^https?:// ]]; then
      invalid_format+=("$var_name")
    fi
  fi

  if [[ "$var_name" =~ ^RENDER_.*_DEPLOY_HOOK_URL$ ]]; then
    if [[ ! "$value" =~ ^https?:// ]]; then
      invalid_format+=("$var_name")
    fi
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required environment variables:"
  for name in "${missing[@]}"; do
    echo "- ${name}"
  done
  exit 1
fi

if [ "${#invalid_format[@]}" -gt 0 ]; then
  echo "Invalid value format for:"
  for name in "${invalid_format[@]}"; do
    if [ "$name" = "AWS_DEPLOY_ROLE_ARN" ]; then
      echo "- ${name} (expected full IAM role ARN like arn:aws:iam::123456789012:role/role-name)"
    elif [ "$name" = "DATABASE_URL" ]; then
      echo "- ${name} (expected postgres:// or postgresql:// URL)"
    elif [[ "$name" =~ ^RENDER_.*_DEPLOY_HOOK_URL$ ]]; then
      echo "- ${name} (expected https:// Render deploy hook URL)"
    else
      echo "- ${name} (expected http:// or https:// URL)"
    fi
  done
  exit 1
fi

echo "All required environment variables are present."
