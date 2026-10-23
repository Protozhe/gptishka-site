import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";
import vm from "node:vm";

const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
const newsWorkflow = fs.readFileSync(".github/workflows/refresh-news.yml", "utf8");
const deploy = fs.readFileSync("deploy.sh", "utf8");
const agentRules = fs.readFileSync("AGENTS.md", "utf8");

assert.match(workflow, /branches:\s*\n\s*- production/);
assert.doesNotMatch(workflow, /branches:\s*\n\s*- main/);
assert.match(workflow, /deploy:\s*\n\s*needs: verify/);
assert.match(workflow, /npm run verify:production/);
assert.ok(workflow.indexOf("npm ci --include=dev") >= 0
  && workflow.indexOf("npm ci --include=dev") < workflow.indexOf("npm run verify:production"),
  "Verification dependencies must be installed before CI checks.");
assert.match(workflow, /DEPLOY_BRANCH=production DEPLOY_COMMIT="\$COMMIT" bash "\$SCRIPT"/);
assert.match(workflow, /needs\.verify\.outputs\.commit/);
assert.match(workflow, /git -C "\$REPO" show "\$COMMIT:deploy.sh"/);
assert.match(workflow, /cancel-in-progress: false/);
assert.match(newsWorkflow, /ref: production/);
assert.match(newsWorkflow, /git push origin HEAD:production/);
assert.doesNotMatch(newsWorkflow, /git push origin HEAD:main/);

const verification = deploy.indexOf("node scripts/verify-production-release.mjs");
const liveSwitch = deploy.indexOf('mv -Tf "$APP_DIR.next" "$APP_DIR"');
assert.ok(deploy.indexOf('ln -s "$ACTIVE_REAL/node_modules" "$RELEASE/node_modules"') < verification
  && deploy.indexOf("npm ci --include=dev") < verification,
  "Both dependency reuse and installation must precede TypeScript verification.");
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
const runtimeLinks = ["node_modules", "data", "apps/admin-backend/data", "uploads", "assets/downloads", "admin/admin-analytics.js", "admin/admin-errors.js"];
const ignoredLinks = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {input:runtimeLinks.join("\n") + "\n", encoding:"utf8"});
assert.equal(ignoredLinks.status, 0);
assert.deepEqual(ignoredLinks.stdout.trim().split(/\r?\n/), runtimeLinks, "Runtime symlinks and built admin scripts must be ignored even when they are not directories");
assert.match(deploy, /git -C "\$RELEASE" status --porcelain/);
assert.match(agentRules, /Production is deployed only from the `production` branch/);
assert.match(agentRules, /production-stable-2026-08-25-r2/);

const ecosystemContext = { module: { exports: {} }, process: { env: {} } };
vm.runInNewContext(fs.readFileSync("ecosystem.config.js", "utf8"), ecosystemContext);
assert.equal(ecosystemContext.module.exports.apps.length, 3);
for (const app of ecosystemContext.module.exports.apps) {
  assert.equal(app.uid, "gptishka-web");
  assert.equal(app.gid, "gptishka-web");
  assert.equal(app.env.GPTISHKA_RUNTIME_DIR, "/var/lib/gptishka-runtime/website");
}
for (const phase of ["test-site-permissions.py", "prepare-site-permissions.py\" --prepare", "prepare-site-permissions.py\" --activate"]) {
  assert.ok(deploy.includes(phase), `Deployment must preserve service permission gate ${phase}`);
}
assert.ok(deploy.indexOf("prepare-site-permissions.py\" --prepare") < liveSwitch);
assert.ok(deploy.indexOf("prepare-site-permissions.py\" --activate") < liveSwitch);
assert.match(deploy, /PAUSED_FOR_PERMISSIONS/);

console.log("Production deployment guard verified.");
