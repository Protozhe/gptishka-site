#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/gptishka-new"

cd "$APP_DIR"

git pull origin main
npm install
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
