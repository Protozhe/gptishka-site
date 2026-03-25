#!/usr/bin/env bash
set -euo pipefail
# Continue recovery even if the SSH session drops.
trap '' HUP

APP_DIR="${1:-/var/www/gptishka-new}"
STORE_PORT="${STORE_PORT:-4000}"
ADMIN_PORT="${ADMIN_PORT:-4100}"
WAIT_SECONDS="${WAIT_SECONDS:-45}"

cd "$APP_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[recover] pm2 is not installed. Aborting."
  exit 1
fi

if [ ! -f server.js ]; then
  echo "[recover] server.js not found in $APP_DIR. Aborting."
  exit 1
fi

echo "[recover] syntax check"
node --check server.js
if [ -f apps/admin-backend/dist/main.js ]; then
  node --check apps/admin-backend/dist/main.js
fi

wait_http() {
  local url="$1"
  local label="$2"
  local max_wait="$3"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      echo "[recover] ${label} is healthy: ${url}"
      return 0
    fi

    local now elapsed
    now="$(date +%s)"
    elapsed="$((now - started_at))"
    if [ "$elapsed" -ge "$max_wait" ]; then
      echo "[recover] ${label} health check timed out after ${max_wait}s: ${url}"
      return 1
    fi
    sleep 2
  done
}

echo "[recover] stop pm2 apps"
pm2 delete gptishka-storefront gptishka-admin-api >/dev/null 2>&1 || true

echo "[recover] free ports ${STORE_PORT} and ${ADMIN_PORT}"
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${STORE_PORT}/tcp" "${ADMIN_PORT}/tcp" >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -ti tcp:"${STORE_PORT}" -ti tcp:"${ADMIN_PORT}" 2>/dev/null | sort -u || true)"
  if [ -n "$pids" ]; then
    kill $pids >/dev/null 2>&1 || true
    sleep 1
    kill -9 $pids >/dev/null 2>&1 || true
  fi
fi

echo "[recover] start storefront via pm2"
if [ -f ecosystem.config.js ]; then
  pm2 start ecosystem.config.js --only gptishka-storefront --update-env
else
  pm2 start ./server.js --name gptishka-storefront --update-env
fi

wait_http "http://127.0.0.1:${STORE_PORT}/" "storefront" "$WAIT_SECONDS" || {
  pm2 status
  pm2 logs gptishka-storefront --lines 80 --nostream || true
  exit 1
}

echo "[recover] start admin api via pm2"
if [ -f ecosystem.config.js ]; then
  pm2 start ecosystem.config.js --only gptishka-admin-api --update-env
else
  pm2 start ./apps/admin-backend/dist/main.js --name gptishka-admin-api --update-env
fi

wait_http "http://127.0.0.1:${ADMIN_PORT}/api/admin/health" "admin-api" "$WAIT_SECONDS" || {
  pm2 status
  pm2 logs gptishka-admin-api --lines 120 --nostream || true
  exit 1
}

pm2 save

echo "[recover] final status"
pm2 status

echo "[recover] OK: storefront and admin API are reachable"
