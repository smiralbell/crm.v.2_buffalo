#!/bin/sh
# Sync bancaria diaria (EasyPanel / crontab).
# Uso:
#   CRON_SECRET=xxx APP_URL=https://crm.ejemplo.com ./scripts/daily-bank-sync.sh
#
# Crontab ejemplo (06:00):
#   0 6 * * * CRON_SECRET=xxx APP_URL=https://crm.ejemplo.com /ruta/scripts/daily-bank-sync.sh

set -eu

APP_URL="${APP_URL:-${NEXT_PUBLIC_BASE_URL:-}}"
SECRET="${CRON_SECRET:-}"

if [ -z "$APP_URL" ] || [ -z "$SECRET" ]; then
  echo "Faltan APP_URL y/o CRON_SECRET" >&2
  exit 1
fi

curl -fsS -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  "${APP_URL%/}/api/cron/bank-sync"
echo
