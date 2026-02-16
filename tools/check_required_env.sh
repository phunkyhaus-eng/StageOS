#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 VAR_NAME [VAR_NAME ...]"
  exit 1
fi

missing=()

for var_name in "$@"; do
  value="${!var_name:-}"
  if [ -z "$value" ]; then
    missing+=("$var_name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required environment variables:"
  for name in "${missing[@]}"; do
    echo "- ${name}"
  done
  exit 1
fi

echo "All required environment variables are present."
