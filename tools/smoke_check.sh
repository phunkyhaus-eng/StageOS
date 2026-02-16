#!/usr/bin/env bash
set -euo pipefail

if [ -z "${WEB_BASE_URL:-}" ]; then
  echo "Missing required env var: WEB_BASE_URL"
  exit 1
fi

if [ -z "${API_BASE_URL:-}" ]; then
  echo "Missing required env var: API_BASE_URL"
  exit 1
fi

curl_with_retry() {
  local url="$1"
  local label="$2"
  local expected_pattern="$3"

  echo "Smoke check: ${label} -> ${url}"
  local response
  response="$(curl -fsSL --retry 4 --retry-delay 2 --max-time 20 "$url")"

  if ! echo "$response" | grep -qE "$expected_pattern"; then
    echo "Unexpected response for ${label}"
    echo "$response"
    exit 1
  fi
}

curl_with_retry "${WEB_BASE_URL}/" "web root" "StageOS|<!doctype html>|<html"
curl_with_retry "${API_BASE_URL}/api/health" "api health" "ok|healthy|status"
curl_with_retry "${API_BASE_URL}/metrics" "api metrics" "^# HELP|process_cpu_user_seconds_total"

echo "Smoke checks passed."
