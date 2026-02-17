#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/gptishka-new"
RUNTIME_DIR="/var/lib/gptishka-runtime"
RUNTIME_CDK="$RUNTIME_DIR/cdk-keys.json"
APP_CDK="$APP_DIR/data/cdk-keys.json"
APP_CDK_LEGACY="$APP_DIR/apps/admin-backend/data/cdk-keys.json"
RUNTIME_SNAPSHOT_DIR="$RUNTIME_DIR/snapshots"
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

json_items_count() {
  local file="$1"
  node -e '
const fs = require("fs");
const p = process.argv[1];
try {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(j?.items)) process.exit(1);
  process.stdout.write(String(j.items.length));
} catch {
  process.exit(1);
}
' "$file" 2>/dev/null || return 1
}

# Preserve runtime CDK pool before hard reset.
mkdir -p "$RUNTIME_DIR"
mkdir -p "$RUNTIME_SNAPSHOT_DIR"
if [ -f "$APP_CDK" ] && json_items_count "$APP_CDK" >/dev/null; then
  cp "$APP_CDK" "$RUNTIME_CDK"
  cp "$APP_CDK" "$RUNTIME_SNAPSHOT_DIR/cdk-keys-$(date -u +%Y%m%dT%H%M%SZ).json"
fi

git fetch origin main
git reset --hard origin/main
npm install
npm run prisma:generate --workspace @gptishka/admin-backend
npm run build:admin:api
npm run build:admin:ui
rsync -a --delete apps/admin-ui/dist/ admin/

# Restore runtime CDK pool after reset and force single source-of-truth.
mkdir -p "$(dirname "$APP_CDK")" "$(dirname "$APP_CDK_LEGACY")"
if [ -f "$RUNTIME_CDK" ] && json_items_count "$RUNTIME_CDK" >/dev/null; then
  cp "$RUNTIME_CDK" "$APP_CDK"
elif [ ! -f "$APP_CDK" ]; then
  cat > "$APP_CDK" <<'JSON'
{
  "items": []
}
JSON
fi

if ! json_items_count "$APP_CDK" >/dev/null; then
  latest_snapshot="$(ls -1t "$RUNTIME_SNAPSHOT_DIR"/cdk-keys-*.json 2>/dev/null | head -n 1 || true)"
  if [ -n "${latest_snapshot:-}" ] && json_items_count "$latest_snapshot" >/dev/null; then
    cp "$latest_snapshot" "$APP_CDK"
    cp "$latest_snapshot" "$RUNTIME_CDK"
  else
    cat > "$APP_CDK" <<'JSON'
{
  "items": []
}
JSON
  fi
fi
rm -f "$APP_CDK_LEGACY"
ln -s "$APP_CDK" "$APP_CDK_LEGACY"

pm2 restart gptishka-admin-api --update-env
pm2 restart gptishka-storefront --update-env
nginx -t
systemctl reload nginx
pm2 save

echo "DEPLOY OK"
