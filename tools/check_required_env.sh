#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 VAR_NAME [VAR_NAME ...]"
  exit 1
fi

missing=()
invalid_format=()
strict_secret_format="${STRICT_SECRET_FORMAT:-false}"

normalize_value() {
  local value="$1"

  # Trim surrounding whitespace first.
  value="$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

  # Unwrap common copy/paste wrappers around secret values.
  if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  fi
  if [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  fi
  if [[ "$value" == \<* && "$value" == *\> && ${#value} -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

for var_name in "$@"; do
  value="${!var_name:-}"
  value="$(normalize_value "$value")"
  if [ -z "$value" ]; then
    missing+=("$var_name")
    continue
  fi

  if [ "$strict_secret_format" = "true" ]; then
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
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required environment variables:"
  for name in "${missing[@]}"; do
    echo "- ${name}"
  done
  exit 1
fi

if [ "$strict_secret_format" = "true" ] && [ "${#invalid_format[@]}" -gt 0 ]; then
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
