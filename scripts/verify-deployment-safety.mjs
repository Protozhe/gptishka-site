import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
const newsWorkflow = fs.readFileSync(".github/workflows/refresh-news.yml", "utf8");
const deploy = fs.readFileSync("deploy.sh", "utf8");
const agentRules = fs.readFileSync("AGENTS.md", "utf8");

assert.match(workflow, /branches:\s*\n\s*- production/);
assert.doesNotMatch(workflow, /branches:\s*\n\s*- main/);
assert.match(workflow, /deploy:\s*\n\s*needs: verify/);
assert.match(workflow, /npm run verify:production/);
assert.match(workflow, /DEPLOY_BRANCH=production bash \.\/deploy\.sh/);
assert.match(newsWorkflow, /ref: production/);
assert.match(newsWorkflow, /git push origin HEAD:production/);
assert.doesNotMatch(newsWorkflow, /git push origin HEAD:main/);

const verification = deploy.indexOf("node scripts/verify-production-release.mjs");
const liveReset = deploy.indexOf('git reset --hard "origin/$DEPLOY_BRANCH"');
assert.ok(verification >= 0 && liveReset > verification, "Candidate checks must run before live files are replaced.");
assert.match(deploy, /DEPLOY_BRANCH="\$\{DEPLOY_BRANCH:-production\}"/);
assert.match(deploy, /refs\/heads\/\$DEPLOY_BRANCH:refs\/remotes\/origin\/\$DEPLOY_BRANCH/);
assert.match(agentRules, /Production is deployed only from the `production` branch/);
assert.match(agentRules, /production-stable-2026-08-25-r2/);

console.log("Production deployment guard verified.");
