#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-https://dashboard.trafegoacademy.online}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$CRON_SECRET" ]; then
  echo "CRON_SECRET nao definido."
  exit 1
fi

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/meta-sync"
