#!/usr/bin/env bash
set -euo pipefail
# Continue deployment even if the SSH session drops.
trap '' HUP

APP_DIR="/var/www/gptishka-new"
ADMIN_ENV_FILE="$APP_DIR/apps/admin-backend/.env"
RUNTIME_DIR="/var/lib/gptishka-runtime"

cd "$APP_DIR"

git fetch origin main
git reset --hard origin/main
npm install --include=dev

# Always publish latest admin UI first, even if backend deploy is skipped/fails.
npm run build:admin:ui
rsync -a --delete apps/admin-ui/dist/ admin/

SKIP_BACKEND_DEPLOY=0
if [ ! -f "$ADMIN_ENV_FILE" ]; then
  echo "WARN: missing $ADMIN_ENV_FILE. Skipping backend deploy steps."
  SKIP_BACKEND_DEPLOY=1
elif grep -Eq '^(PAYMENT_SECRET|PAYMENT_SHOP_ID|ENOT_API_KEY|ENOT_SHOP_ID)=replace_me' "$ADMIN_ENV_FILE"; then
  echo "WARN: placeholder payment credentials detected in $ADMIN_ENV_FILE. Skipping backend deploy steps."
  SKIP_BACKEND_DEPLOY=1
fi

if [ "$SKIP_BACKEND_DEPLOY" -eq 0 ]; then
  # Production-safe DB migrations (no reset, no drop).
  npm run prisma:deploy --workspace @gptishka/admin-backend
  npm run prisma:generate --workspace @gptishka/admin-backend

  # One-time migration: import legacy JSON pool into Postgres (then move JSON to /var/backups).
  # git reset --hard can remove previously-tracked JSON, so also check runtime snapshots.
  LEGACY_JSON="$APP_DIR/data/cdk-keys.json"
  if [ ! -f "$LEGACY_JSON" ] && [ -f "$RUNTIME_DIR/cdk-keys.json" ]; then
    LEGACY_JSON="$RUNTIME_DIR/cdk-keys.json"
  fi
  if [ ! -f "$LEGACY_JSON" ] && [ -d "$RUNTIME_DIR/snapshots" ]; then
    LEGACY_JSON="$(ls -1t "$RUNTIME_DIR"/snapshots/cdk-keys-*.json 2>/dev/null | head -n 1 || true)"
  fi
  node scripts/import-cdk-json-to-db.js "$APP_DIR" "$LEGACY_JSON" "$ADMIN_ENV_FILE" "/var/backups/gptishka" || true
  # Keep legacy pooled keys consistent: attach reserved/used keys to the actual product from the order.
  node scripts/backfill-license-keys-by-order.js "$APP_DIR" "$ADMIN_ENV_FILE" || true

  npm run build:admin:api

  # Ensure PM2 apps (and their PORTs) match repo config on every deploy.
  # This prevents port drift (e.g., storefront accidentally binding admin port).
  if [ -f ecosystem.config.js ]; then
    if ! pm2 startOrReload ecosystem.config.js --update-env; then
      echo "WARN: pm2 startOrReload failed, attempting stale-port recovery"
      if command -v fuser >/dev/null 2>&1; then
        fuser -k 4000/tcp 4100/tcp >/dev/null 2>&1 || true
      fi
      pm2 startOrReload ecosystem.config.js --update-env
    fi
  else
    pm2 restart gptishka-admin-api --update-env
    pm2 restart gptishka-storefront --update-env
  fi
  nginx -t
  systemctl reload nginx
  pm2 save
else
  echo "WARN: backend deploy steps were skipped. Admin UI and static files are updated."

  # Раньше перезапуск PM2 жил только в ветке выше, поэтому при пропуске
  # backend-шагов на прод уезжала одна статика: HTML/CSS/JS читаются с диска
  # на каждый запрос и обновлялись, а server.js остаётся в памяти процесса и
  # продолжал работать в старой версии. Из-за этого правки серверного кода
  # (в том числе закрытие доступа к /data/*.sqlite и исходникам) молча не
  # доезжали до прода, хотя деплой рапортовал об успехе.
  # Сторефронт не зависит от apps/admin-backend/.env, поэтому перезапускаем
  # его всегда.
  echo "INFO: restarting storefront so server.js changes take effect"
  if pm2 describe gptishka-storefront >/dev/null 2>&1; then
    pm2 restart gptishka-storefront --update-env || echo "WARN: storefront restart failed"
  elif [ -f ecosystem.config.js ]; then
    pm2 start ecosystem.config.js --only gptishka-storefront --update-env || echo "WARN: storefront start failed"
  else
    echo "WARN: cannot restart storefront: no PM2 process and no ecosystem.config.js"
  fi
  pm2 save || true
fi

echo "DEPLOY OK"
