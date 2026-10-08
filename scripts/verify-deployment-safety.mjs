import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
const newsWorkflow = fs.readFileSync(".github/workflows/refresh-news.yml", "utf8");
const deploy = fs.readFileSync("deploy.sh", "utf8");
const agentRules = fs.readFileSync("AGENTS.md", "utf8");

assert.match(workflow, /branches:\s*\n\s*- production/);
assert.doesNotMatch(workflow, /branches:\s*\n\s*- main/);
assert.match(workflow, /deploy:\s*\n\s*needs: verify/);
assert.match(workflow, /npm run verify:production/);
assert.match(workflow, /DEPLOY_BRANCH=production DEPLOY_COMMIT="\$COMMIT" bash "\$SCRIPT"/);
assert.match(workflow, /needs\.verify\.outputs\.commit/);
assert.match(workflow, /git -C "\$REPO" show "\$COMMIT:deploy.sh"/);
assert.match(workflow, /cancel-in-progress: false/);
assert.match(newsWorkflow, /ref: production/);
assert.match(newsWorkflow, /git push origin HEAD:production/);
assert.doesNotMatch(newsWorkflow, /git push origin HEAD:main/);

const verification = deploy.indexOf("node scripts/verify-production-release.mjs");
const liveSwitch = deploy.indexOf('mv -Tf "$APP_DIR.next" "$APP_DIR"');
assert.ok(verification >= 0 && liveSwitch > verification, "Candidate checks must run before the live directory switches.");
for (const gate of ["npm run build:admin:api", "npm run build:admin:ui", "node --test server/*.test.js", "xargs -0 node --import tsx --test", 'python3 "$RELEASE/scripts/backup-release-state.py"', "nginx -t", 'git -C "$RELEASE" diff --exit-code']) {
  assert.ok(deploy.indexOf(gate) > verification && deploy.indexOf(gate) < liveSwitch, `${gate} must precede publication`);
}
assert.match(deploy, /Only production may be deployed/);
assert.match(deploy, /flock -w 120/);
assert.match(deploy, /trap rollback EXIT/);
assert.match(deploy, /Live health checks failed/);
assert.match(deploy, /git -C "\$RELEASE" archive "\$COMMIT" \| tar -x -C "\$TEST_DIR"/);
assert.match(deploy, /export NODE_ENV=test ADMIN_BACKEND_URL=http:\/\/127.0.0.1:9/);
assert.doesNotMatch(deploy, /git reset --hard|fuser -k|backfill-license|import-cdk-json/);
assert.ok(!fs.existsSync(".github/workflows/deploy-static-ui-hotfix.yml"), "Legacy direct-copy deployment must be retired");
assert.match(deploy, /DEPLOY_BRANCH="\$\{DEPLOY_BRANCH:-production\}"/);
assert.match(deploy, /RUNTIME_PUBLIC_REVIEWS="\$RUNTIME_DIR\/public-reviews\.json"/);
assert.match(deploy, /install -m 0644 "\$LEGACY_PUBLIC_REVIEWS" "\$RUNTIME_PUBLIC_REVIEWS"/);
assert.match(deploy, /refs\/heads\/\$DEPLOY_BRANCH:refs\/heads\/\$DEPLOY_BRANCH/);
for (const path of ["data/public-reviews.json", "data/order-activations.json", "apps/admin-backend/data/homepage-content.json"]) {
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", path], {encoding:"utf8"});
  assert.notEqual(tracked.status, 0, `${path} must not be a tracked mutable seed`);
  if (fs.existsSync(path)) assert.ok(fs.realpathSync(path).startsWith("/var/lib/gptishka-runtime/"), `${path} must resolve outside the checkout`);
}
assert.match(agentRules, /Production is deployed only from the `production` branch/);
assert.match(agentRules, /production-stable-2026-08-25-r2/);

console.log("Production deployment guard verified.");
