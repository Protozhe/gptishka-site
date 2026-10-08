#!/usr/bin/env bash
set -euo pipefail
trap '' HUP

APP_DIR="/var/www/gptishka-new"
RELEASES_DIR="/var/www/gptishka-releases"
REPO_DIR="$RELEASES_DIR/repository.git"
RUNTIME_DIR="/var/lib/gptishka-runtime"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-production}"
[[ "$DEPLOY_BRANCH" == production ]] || { echo "Only production may be deployed"; exit 1; }
install -d -m 0755 "$RELEASES_DIR" "$RUNTIME_DIR"
exec 9>"$RUNTIME_DIR/deploy.lock"
flock -w 120 9

if [ ! -d "$REPO_DIR" ]; then
  git clone --mirror https://github.com/Protozhe/gptishka-site.git "$REPO_DIR"
fi
git -C "$REPO_DIR" fetch origin "refs/heads/$DEPLOY_BRANCH:refs/heads/$DEPLOY_BRANCH"
COMMIT="$(git -C "$REPO_DIR" rev-parse "$DEPLOY_BRANCH")"
if [ -n "${DEPLOY_COMMIT:-}" ] && [ "$DEPLOY_COMMIT" != "$COMMIT" ]; then
  echo "Production changed after verification; the newer workflow must deploy it"
  exit 1
fi
RELEASE="$RELEASES_DIR/release-$COMMIT"
[[ ! -e "$RELEASE" ]] || { echo "Release already exists; inspect before retrying: $COMMIT"; exit 1; }
git clone --shared --no-checkout "$REPO_DIR" "$RELEASE"
git -C "$RELEASE" checkout --detach "$COMMIT"

# All checks and builds precede the switch of the live directory.
(
  cd "$RELEASE"
  node scripts/verify-production-release.mjs
)
ACTIVE_REAL="$(readlink -f "$APP_DIR")"
[[ -d "$ACTIVE_REAL" && "$ACTIVE_REAL" == /var/www/* ]] || exit 1
[[ -f "$ACTIVE_REAL/apps/admin-backend/.env" && -f "$ACTIVE_REAL/.env" ]] || exit 1
DATA="$(readlink -f "$ACTIVE_REAL/data")"
ADMIN_DATA="$(readlink -f "$ACTIVE_REAL/apps/admin-backend/data")"
UPLOADS="$(readlink -f "$ACTIVE_REAL/uploads")"
for directory in "$DATA" "$ADMIN_DATA" "$UPLOADS"; do
  [[ -d "$directory" && "$directory" == "$RUNTIME_DIR"/* ]] || { echo "Mutable data must be external"; exit 1; }
done
ln -s "$DATA" "$RELEASE/data"
ln -s "$ADMIN_DATA" "$RELEASE/apps/admin-backend/data"
ln -s "$UPLOADS" "$RELEASE/uploads"
CONFIG="$RUNTIME_DIR/shared-site/config"
install -d -m 0700 "$CONFIG"
for pair in ".env:root.env" "apps/admin-backend/.env:backend.env" "apps/admin-ui/.env.production:admin-ui.env"; do
  source="${pair%%:*}"; target="${pair##*:}"
  if [ -f "$ACTIVE_REAL/$source" ]; then
    if [ "$(readlink -f "$ACTIVE_REAL/$source")" != "$CONFIG/$target" ]; then
      install -m 0600 "$ACTIVE_REAL/$source" "$CONFIG/$target"
    fi
    ln -s "$CONFIG/$target" "$RELEASE/$source"
  fi
done

LEGACY_AI_BATTLE_STATS="$ACTIVE_REAL/apps/admin-backend/data/ai-battle-stats.json"
RUNTIME_AI_BATTLE_STATS="$RUNTIME_DIR/ai-battle-stats.json"
if [ ! -f "$RUNTIME_AI_BATTLE_STATS" ] && [ -f "$LEGACY_AI_BATTLE_STATS" ]; then
  install -m 0644 "$LEGACY_AI_BATTLE_STATS" "$RUNTIME_AI_BATTLE_STATS"
fi
LEGACY_PUBLIC_REVIEWS="$ACTIVE_REAL/data/public-reviews.json"
RUNTIME_PUBLIC_REVIEWS="$RUNTIME_DIR/public-reviews.json"
if [ ! -f "$RUNTIME_PUBLIC_REVIEWS" ] && [ -f "$LEGACY_PUBLIC_REVIEWS" ]; then
  install -m 0644 "$LEGACY_PUBLIC_REVIEWS" "$RUNTIME_PUBLIC_REVIEWS"
fi

SCHEMA_CHANGED=0
if ! diff -qr "$ACTIVE_REAL/apps/admin-backend/prisma" "$RELEASE/apps/admin-backend/prisma" >/dev/null; then SCHEMA_CHANGED=1; fi
REUSE_DEPS=0
if [ "$SCHEMA_CHANGED" -eq 0 ] && cmp -s "$ACTIVE_REAL/package-lock.json" "$RELEASE/package-lock.json" && [ -x "$ACTIVE_REAL/node_modules/.bin/tsc" ] && [ -x "$ACTIVE_REAL/node_modules/.bin/vite" ]; then
  REUSE_DEPS=1
  ln -s "$ACTIVE_REAL/node_modules" "$RELEASE/node_modules"
else
  (cd "$RELEASE" && npm ci --include=dev --prefer-offline && npm run prisma:generate --workspace @gptishka/admin-backend)
fi
(
  cd "$RELEASE"
  npm run build:admin:api
  npm run build:admin:ui
)
# Run HTTP and store tests in a fresh archive without production .env or data.
TEST_DIR="$(mktemp -d /tmp/gptishka-tests.XXXXXX)"
git -C "$RELEASE" archive "$COMMIT" | tar -x -C "$TEST_DIR"
ln -s "$(readlink -f "$RELEASE/node_modules")" "$TEST_DIR/node_modules"
(
  cd "$TEST_DIR"
  export NODE_ENV=test ADMIN_BACKEND_URL=http://127.0.0.1:9 ADMIN_BACKEND_FALLBACK_URLS=http://127.0.0.1:9
  node --test server/*.test.js apps/admin-backend/scripts/*.test.js
  find apps/admin-backend/src -name '*.test.ts' -print0 | xargs -0 node --import tsx --test
)
[[ "$TEST_DIR" == /tmp/gptishka-tests.* ]] && rm -rf -- "$TEST_DIR"
rsync -a --delete --exclude=.htaccess "$RELEASE/apps/admin-ui/dist/" "$RELEASE/admin/"
test -f "$RELEASE/admin/.htaccess"
BACKUP="/var/backups/gptishka/design-${COMMIT:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
python3 "$RELEASE/scripts/backup-release-state.py" "$ACTIVE_REAL" "$BACKUP"
if [ "$SCHEMA_CHANGED" -eq 1 ]; then
  (cd "$RELEASE" && npm run prisma:deploy --workspace @gptishka/admin-backend)
fi
nginx -t
git -C "$RELEASE" diff --exit-code
[[ -z "$(git -C "$RELEASE" status --porcelain)" ]] || { echo "Release contains unexpected local files"; exit 1; }

# Adopt the previous complete checkout as a recoverable release. No source
# file is copied over the active site, and all runtime directories stay put.
if [ ! -L "$APP_DIR" ]; then
  LEGACY="$RELEASES_DIR/legacy-before-${COMMIT:0:12}"
  [[ ! -e "$LEGACY" ]] || exit 1
  mv "$APP_DIR" "$LEGACY"
  ln -s "$LEGACY" "$APP_DIR"
  ACTIVE_REAL="$LEGACY"
fi
if [ "$REUSE_DEPS" -eq 1 ]; then
  DEPENDENCIES="$(readlink -f "$ACTIVE_REAL/node_modules")"
  ln -s "$DEPENDENCIES" "$RELEASE/node_modules.next"
  mv -Tf "$RELEASE/node_modules.next" "$RELEASE/node_modules"
fi
if [ -d "$ACTIVE_REAL/assets/downloads" ]; then
  ln -s "$(readlink -f "$ACTIVE_REAL/assets/downloads")" "$RELEASE/assets/downloads"
fi

SWITCHED=0
rollback() {
  status=$?
  if [ "$status" -ne 0 ] && [ "$SWITCHED" -eq 1 ]; then
    ln -s "$ACTIVE_REAL" "$APP_DIR.rollback"
    mv -Tf "$APP_DIR.rollback" "$APP_DIR"
    (cd "$APP_DIR" && pm2 startOrReload ecosystem.config.js --update-env) || true
    echo "Release failed; previous complete directory restored"
  fi
  exit "$status"
}
trap rollback EXIT
ln -s "$RELEASE" "$APP_DIR.next"
mv -Tf "$APP_DIR.next" "$APP_DIR"
SWITCHED=1
(cd "$APP_DIR" && pm2 startOrReload ecosystem.config.js --update-env)
HEALTH_OK=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 5 http://127.0.0.1:4100/api/admin/health >/dev/null && curl -fsS --max-time 5 http://127.0.0.1:4000/ >/dev/null && curl -fsS --max-time 5 http://127.0.0.1:4000/api/public/products >/dev/null; then
    HEALTH_OK=1; break
  fi
  sleep 1
done
[[ "$HEALTH_OK" -eq 1 ]] || { echo "Live health checks failed"; exit 1; }
systemctl reload nginx
pm2 save
printf '%s\n' "$COMMIT" > "$RUNTIME_DIR/current-release-commit"
trap - EXIT
echo "DEPLOY OK $COMMIT"
