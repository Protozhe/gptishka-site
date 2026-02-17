#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/gptishka-new"
ADMIN_ENV_FILE="$APP_DIR/apps/admin-backend/.env"

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
npm run build:admin:api
npm run build:admin:ui
rsync -a --delete apps/admin-ui/dist/ admin/

pm2 restart gptishka-admin-api --update-env
pm2 restart gptishka-storefront --update-env
nginx -t
systemctl reload nginx
pm2 save

echo "DEPLOY OK"
