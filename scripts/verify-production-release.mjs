import { spawnSync } from "node:child_process";

const checks = [
  "scripts/verify-admin-cdk-duration-sort.mjs",
  "scripts/verify-admin-product-duration-sort.mjs",
  "scripts/check-activation-pages-refresh.mjs",
  "scripts/verify-activation-success-message.mjs",
  "scripts/check-information-flat-pages.mjs",
  "scripts/check-language-coverage.mjs",
  "scripts/check-reviews-hub.js",
  "scripts/check-support-resume-refresh.mjs",
  "scripts/verify-activation-video-removed.mjs",
  "scripts/verify-chongzhi-submit-timeout-recovery.mjs",
  "scripts/verify-deferred-analytics.mjs",
  "scripts/verify-deployment-safety.mjs",
  "scripts/verify-homepage-ai-battle.mjs",
  "scripts/verify-public-vpn-hidden.mjs",
  "scripts/verify-showcase-card-mode.mjs",
  "scripts/verify-showcase-product-visual-editor.mjs",
  "scripts/verify-showcase-service-cards.mjs",
];

for (const check of checks) {
  process.stdout.write(`\n[production check] ${check}\n`);
  const result = spawnSync(process.execPath, [check], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`\nProduction verification stopped: ${check} failed.\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`\nProduction release verified (${checks.length} checks).\n`);
