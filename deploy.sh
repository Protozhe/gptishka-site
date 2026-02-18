#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/gptishka-new"
ADMIN_ENV_FILE="$APP_DIR/apps/admin-backend/.env"
RUNTIME_DIR="/var/lib/gptishka-runtime"

cd "$APP_DIR"

if [ ! -f "$ADMIN_ENV_FILE" ]; then
  echo "ERROR: missing $ADMIN_ENV_FILE"
  exit 1
fi

if grep -Eq '^(PAYMENT_SECRET|PAYMENT_SHOP_ID|ENOT_API_KEY|ENOT_SHOP_ID)=replace_me' "$ADMIN_ENV_FILE"; then
  echo "ERROR: placeholder payment credentials detected in $ADMIN_ENV_FILE"
  exit 1
fi

git fetch origin main
git reset --hard origin/main
npm install --include=dev
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
npm run build:admin:ui
rsync -a --delete apps/admin-ui/dist/ admin/

# Ensure PM2 apps (and their PORTs) match repo config on every deploy.
# This prevents port drift (e.g., storefront accidentally binding admin port).
if [ -f ecosystem.config.js ]; then
  pm2 startOrReload ecosystem.config.js --update-env
else
  pm2 restart gptishka-admin-api --update-env
  pm2 restart gptishka-storefront --update-env
fi
nginx -t
systemctl reload nginx
pm2 save

echo "DEPLOY OK"
