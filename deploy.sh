#!/usr/bin/env bash
set -euo pipefail
# Continue deployment even if the SSH session drops.
trap '' HUP

# Run from a temporary copy so `git reset --hard origin/main` cannot replace
# this script while bash is still reading it.
if [ "${GPTISHKA_DEPLOY_WRAPPED:-0}" != "1" ]; then
  DEPLOY_TMP="/tmp/gptishka-deploy-$$.sh"
  cp "$0" "$DEPLOY_TMP"
  chmod +x "$DEPLOY_TMP"
  export GPTISHKA_DEPLOY_WRAPPED=1
  exec bash "$DEPLOY_TMP" "$@"
fi

APP_DIR="/var/www/gptishka-new"
ADMIN_ENV_FILE="$APP_DIR/apps/admin-backend/.env"
RUNTIME_DIR="/var/lib/gptishka-runtime"

cd "$APP_DIR"

git fetch origin main
git reset --hard origin/main
git clean -fd -- apps/admin-backend/src apps/admin-backend/prisma
npm install --include=dev

npm run build:admin:ui

# Safety gate: do not overwrite the working production admin with an old bundle.
# The product constructor depends on service-pages/showcase backend routes and
# activation variant fields in the admin UI. If a stale branch reaches deploy,
# stop before rsync deletes the current /admin assets.
if ! grep -R -q "activationSiteUrl" apps/admin-ui/dist/assets; then
  echo "ERROR: admin UI bundle does not contain activationSiteUrl. Refusing to deploy stale admin."
  exit 1
fi
if ! grep -R -q "heroVideoUrl" apps/admin-ui/dist/assets; then
  echo "ERROR: admin UI bundle does not contain service page constructor fields. Refusing to deploy stale admin."
  exit 1
fi
if [ ! -d apps/admin-backend/src/modules/service-pages ] || ! grep -q "service-pages" apps/admin-backend/src/app.ts; then
  echo "ERROR: admin backend source does not contain service-pages routes. Refusing to deploy stale admin."
  exit 1
fi
if [ ! -d apps/admin-backend/src/modules/showcase ] || ! grep -q "showcase" apps/admin-backend/src/app.ts; then
  echo "ERROR: admin backend source does not contain showcase routes. Refusing to deploy stale admin."
  exit 1
fi

BACKUP_DIR="/var/backups/gptishka/deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -a admin "$BACKUP_DIR/admin" 2>/dev/null || true
mkdir -p "$BACKUP_DIR/apps/admin-backend"
cp -a apps/admin-backend/dist "$BACKUP_DIR/apps/admin-backend/dist" 2>/dev/null || true

# Publish latest admin UI only after the stale-admin safety gate passes.
rsync -a --delete --exclude='.htaccess' apps/admin-ui/dist/ admin/

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
fi

echo "DEPLOY OK"
