const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const checks = [];
function expect(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const vpnHtml = read("store/vpn/index.html");
const appJs = read("assets/js/app.js");
const appMin = read("assets/js/app.min.js");
const css = read("assets/css/home-stability-hotfix.css");
const paymentsRoutes = read("apps/admin-backend/src/modules/payments/public-payments.routes.ts");
const successHtml = read("success.html");
const backfillServicePages = read("apps/admin-backend/scripts/backfill-service-pages.ts");

expect("VPN page uses service constructor scope", vpnHtml.includes('data-service-page="vpn"') && vpnHtml.includes('data-service-layout="constructor"'));
expect("VPN page has static dark-blue hero", vpnHtml.includes("service-hero--vpn") && vpnHtml.includes("service-hero__blue-overlay") && !vpnHtml.includes("chatgpt-plans-bg") && !vpnHtml.includes('<video class="service-hero__video"'));
expect("VPN page uses shared constructor blocks", vpnHtml.includes("service-constructor-shell") && vpnHtml.includes("service-product-gallery") && vpnHtml.includes("service-selected-plan"));
expect("VPN page uses optimized VPN service image", vpnHtml.includes("/assets/img/services/vpn-card.webp?v=20260721-cards-webp1"));
expect("VPN page keeps FAQ block", vpnHtml.includes("service-faq-section") && vpnHtml.includes("service-faq-list"));
expect("VPN page loads cache-busted shared CSS/JS", vpnHtml.includes("/assets/css/home-stability-hotfix.css?v=20260619-vpn-service1") && vpnHtml.includes("/assets/js/app.min.js?v=20260722-delivery-id-only1"));
expect("Old VPN inline checkout controls are removed from index", !vpnHtml.includes("vpnEmailInput") && !vpnHtml.includes("vpnPlansGrid") && !vpnHtml.includes("data-vpn-buy"));

expect("app.js registers VPN service modal", appJs.includes('new Set(["chatgpt", "claude", "grok", "vpn"])') && appJs.includes('displayName: "GPTishka VPN"'));
expect("app.js detects VPN products as service group", appJs.includes('key: "vpn"') && appJs.includes('name: "GPTishka VPN"'));
expect("app.js uses strict standalone VPN detection", appJs.includes("function isStandaloneVpnProduct") && appJs.includes("return isStandaloneVpnProduct(item);"));
expect("app.js does not classify bundle:vpn as VPN delivery", !appJs.includes('if (deliveryType === "vpn" || text.includes("vless") || text.includes("vpn")) return "vpn";'));
expect("app.js renders VPN directory card with optimized fallback images", appJs.includes('vpn: {') && appJs.includes('imageUrl: "/assets/img/services/vpn-card.webp?v=20260721-cards-webp1"') && appJs.includes('hoverImageUrl: "/assets/img/services/vpn-card-hover.webp?v=20260721-cards-webp1"'));
expect("app.js routes VPN page correctly", appJs.includes('if (key === "vpn") return "/store/vpn";'));
expect("app.js uses duration as VPN plan key", appJs.includes('if (key === "vpn")') && appJs.includes("return getServiceDurationKey(item);"));
expect("app.js preserves VPN delivery method in order payload", appJs.includes('deliveryKey === "vpn" ? "vpn"'));
expect("app.js supports VPN modal plan keys", appJs.includes("VPN_ORDER_MODAL_PLAN_KEYS") && appJs.includes('if (key === "vpn") return isVpnOrderModalPlanKey(planKey);'));
expect("backfill binds VPN page only to real VPN products", backfillServicePages.includes("matchProduct") && backfillServicePages.includes("isStandaloneVpnProduct") && backfillServicePages.includes("pruneNonMatchingPlacements"));
expect("backfill no longer uses broad VPN text regexp", !backfillServicePages.includes("match: /vpn|vless|reality/i"));

expect("app.min.js contains VPN service modal support", appMin.includes("GPTishka VPN") && appMin.includes("/store/vpn") && appMin.includes("vpn-card.webp?v=20260721-cards-webp1"));
expect("app.min.js contains VPN directory fallback images", appMin.includes("vpn-card.webp?v=20260721-cards-webp1") && appMin.includes("vpn-card-hover.webp?v=20260721-cards-webp1"));
expect("CSS scopes VPN dark-blue buttons", css.includes('[data-service-page="vpn"] .buy-btn') && css.includes(".service-hero.service-hero--vpn") && css.includes("--vpn-blue"));
expect("CSS themes VPN payment modal/options", css.includes('.service-page[data-service-page="vpn"] ~ .chatgpt-go-order-modal .chatgpt-order-payment') && css.includes('[data-service-page="vpn"] .payment-option'));
expect("Backend still redirects paid VPN to VLESS access page", paymentsRoutes.includes('created.deliveryType === "vpn"') && paymentsRoutes.includes('"/store/vpn/activate"'));
expect("Success page still routes VPN orders to activate page", successHtml.includes('deliveryMode === "vpn"') && successHtml.includes('/store/vpn/activate'));

const failed = checks.filter(check => !check.ok);
if (failed.length) {
  console.error("VPN page/modal checks failed:");
  for (const check of failed) console.error(`- ${check.name}`);
  process.exit(1);
}

console.log(`VPN page/modal checks passed (${checks.length})`);
