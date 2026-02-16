#!/usr/bin/env bash
set -euo pipefail

required=(
  RENDER_API_DEPLOY_HOOK_URL
  RENDER_WEB_DEPLOY_HOOK_URL
)

for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required env var: ${name}"
    exit 1
  fi
done

trigger_worker="${TRIGGER_WORKER:-true}"

trigger_hook() {
  local service="$1"
  local hook_url="$2"
  local response_file
  response_file="$(mktemp)"

  echo "Triggering Render deploy hook for ${service}..."
  local status
  status="$(curl -sS -o "$response_file" -w "%{http_code}" -X POST "$hook_url" || true)"

  if [[ ! "$status" =~ ^2 ]]; then
    echo "POST failed for ${service} (HTTP ${status}), retrying with GET..."
    status="$(curl -sS -o "$response_file" -w "%{http_code}" "$hook_url" || true)"
  fi

  if [[ "$status" =~ ^2 ]]; then
    echo "Render ${service} deploy hook accepted (HTTP ${status})."
    rm -f "$response_file"
    return 0
  fi

  echo "Render deploy hook failed for ${service} (HTTP ${status}). Response:"
  cat "$response_file"
  rm -f "$response_file"
  exit 1
}

trigger_hook "api" "$RENDER_API_DEPLOY_HOOK_URL"
trigger_hook "web" "$RENDER_WEB_DEPLOY_HOOK_URL"

if [ "$trigger_worker" = "true" ]; then
  if [ -z "${RENDER_WORKER_DEPLOY_HOOK_URL:-}" ]; then
    echo "TRIGGER_WORKER=true but RENDER_WORKER_DEPLOY_HOOK_URL is not set."
    exit 1
  fi
  trigger_hook "worker" "$RENDER_WORKER_DEPLOY_HOOK_URL"
else
  echo "Skipping worker deploy hook (TRIGGER_WORKER=false)."
fi

echo "Render rollout hooks completed."
