#!/usr/bin/env bash
set -euo pipefail
# Continue deployment even if the SSH session drops.
trap '' HUP

APP_DIR="/var/www/gptishka-new"
ADMIN_ENV_FILE="$APP_DIR/apps/admin-backend/.env"
RUNTIME_DIR="/var/lib/gptishka-runtime"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-production}"

# Mutable application state must live outside the Git checkout: deployments
# replace every tracked file with the approved production branch.
install -d -m 0755 "$RUNTIME_DIR"
LEGACY_AI_BATTLE_STATS="$APP_DIR/apps/admin-backend/data/ai-battle-stats.json"
RUNTIME_AI_BATTLE_STATS="$RUNTIME_DIR/ai-battle-stats.json"
if [ ! -f "$RUNTIME_AI_BATTLE_STATS" ] && [ -f "$LEGACY_AI_BATTLE_STATS" ]; then
  # Preserve the live counter before git reset replaces its old tracked file.
  install -m 0644 "$LEGACY_AI_BATTLE_STATS" "$RUNTIME_AI_BATTLE_STATS"
fi

cd "$APP_DIR"

git fetch origin "refs/heads/$DEPLOY_BRANCH:refs/remotes/origin/$DEPLOY_BRANCH"

# Verify the candidate in an isolated tree before it can replace live files.
VERIFY_DIR="$(mktemp -d /tmp/gptishka-release.XXXXXX)"
cleanup_verify_dir() {
  if [[ "$VERIFY_DIR" == /tmp/gptishka-release.* && -d "$VERIFY_DIR" ]]; then
    rm -rf -- "$VERIFY_DIR"
  fi
}
trap cleanup_verify_dir EXIT
git archive "origin/$DEPLOY_BRANCH" | tar -x -C "$VERIFY_DIR"
(
  cd "$VERIFY_DIR"
  node scripts/verify-production-release.mjs
)
cleanup_verify_dir
trap - EXIT

git reset --hard "origin/$DEPLOY_BRANCH"

if [ -x node_modules/.bin/tsc ] && [ -x node_modules/.bin/vite ]; then
  echo "Using existing dependencies from the current lockfile"
else
  INSTALL_OK=0
  for attempt in 1 2 3; do
    if npm install --include=dev --prefer-offline; then
      INSTALL_OK=1
      break
    fi
    echo "WARN: npm install attempt $attempt failed"
    sleep $((attempt * 5))
  done
  if [ "$INSTALL_OK" -ne 1 ]; then
    echo "ERROR: npm install failed and required build tools are unavailable"
    exit 1
  fi
fi

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
fi

echo "DEPLOY OK"
