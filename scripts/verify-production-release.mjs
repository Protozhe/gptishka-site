import { spawnSync } from "node:child_process";

const checks = [
  "scripts/verify-dependency-compatibility.mjs",
  "scripts/verify-admin-access.mjs",
  "scripts/verify-admin-sessions-uploads.mjs",
  "scripts/verify-admin-telegram-mfa.mjs",
  "scripts/verify-admin-telegram-presentation.mjs",
  "scripts/verify-codex-paid-conversions.mjs",
  "scripts/verify-codex-attribution.mjs",
  "scripts/verify-chatgpt-ad-price-meta.mjs",
  "scripts/verify-external-codex-routing.mjs",
  "scripts/verify-checkout-language.cjs",
  "scripts/verify-claude-plan-links.mjs",
  "scripts/verify-activation-confidentiality.mjs",
  "scripts/verify-pally-settlement.mjs",
  "scripts/verify-payment-concurrency.mjs",
  "scripts/verify-kyc-price.cjs",
  "scripts/verify-aiee-proxy.mjs",
  "scripts/verify-ios-renewal.mjs",
  "scripts/verify-review-product-labels.cjs",
  "scripts/verify-preserved-reviews.cjs",
  "scripts/verify-public-news-sync.cjs",
  "scripts/verify-manager-notifications.mjs",
  "scripts/verify-activation-start-limit.mjs",
  "scripts/verify-activation-token-recovery.mjs",
  "scripts/verify-metrika-sync-packaging.mjs",
  "scripts/verify-admin-cdk-duration-sort.mjs",
  "scripts/verify-admin-product-duration-sort.mjs",
  "scripts/check-activation-pages-refresh.mjs",
  "scripts/verify-activation-success-message.mjs",
  "scripts/verify-activation-review-flow.mjs",
  "scripts/check-information-flat-pages.mjs",
  "scripts/check-language-coverage.mjs",
  "scripts/check-reviews-hub.js",
  "scripts/check-support-resume-refresh.mjs",
  "scripts/verify-activation-video-removed.mjs",
  "scripts/verify-chongzhi-submit-timeout-recovery.mjs",
  "scripts/verify-aiee-codex-activation.mjs",
  "scripts/verify-chatgpt-plus-dual-pool.mjs",
  "scripts/verify-aichongzhi-grok-activation.mjs",
  "scripts/verify-supergrok-activation-page.mjs",
  "scripts/verify-service-modal-harmony.mjs",
  "scripts/verify-order-hours.mjs",
  "scripts/verify-deferred-analytics.mjs",
  "scripts/verify-deployment-safety.mjs",
  "scripts/verify-homepage-ai-battle.mjs",
  "scripts/verify-public-vpn-hidden.mjs",
  "scripts/verify-showcase-card-mode.mjs",
  "scripts/verify-showcase-product-visual-editor.mjs",
  "scripts/verify-showcase-service-cards.mjs",
  "scripts/verify-suno-link-flow.mjs",
  "scripts/verify-devin-payment-link-flow.mjs",
  "scripts/verify-chat-restoration.mjs",
  "scripts/verify-native-page-navigation.mjs",
  "scripts/verify-round-favicon.mjs",
  "scripts/verify-storefront-ticker-removed.mjs",
  "scripts/verify-software-rendering-safe.mjs",
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
