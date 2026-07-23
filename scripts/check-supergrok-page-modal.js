const fs = require("fs");

const source = fs.readFileSync("assets/js/app.js", "utf8");
const minifiedSource = fs.readFileSync("assets/js/app.min.js", "utf8");
const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
const flatCss = fs.readFileSync("assets/css/chatgpt-grok-flat-page.css", "utf8");
const page = fs.readFileSync("supergrok.html", "utf8");

const failures = [];

function requireMarker(content, marker, label) {
  if (!content.includes(marker)) failures.push(label || marker);
}

function rejectMarker(content, marker, label) {
  if (content.includes(marker)) failures.push(label || `should not include ${marker}`);
}

function requireCssRegex(pattern, label) {
  if (!pattern.test(css)) failures.push(`css: ${label}`);
}

const expectedAssetVersion = "20260722-unified-checkout1";
const expectedJsAssetVersion = "20260722-unified-checkout1";

[
  ["service-page--constructor", "supergrok.html: constructor page class"],
  ['data-service-page="grok"', "supergrok.html: Grok service scope"],
  ['data-service-layout="constructor"', "supergrok.html: constructor layout marker"],
  ["service-constructor-shell", "supergrok.html: constructor shell"],
  ["service-product-gallery", "supergrok.html: product gallery"],
  ["/assets/img/services/grok-card.webp?v=20260721-heavy-cards-webp1", "supergrok.html: Grok product image cache-bust"],
  ["service-selected-plan", "supergrok.html: selected plan summary"],
  ['class="service-faq-section" id="faq"', "supergrok.html: FAQ section"],
  ["Часто задаваемые вопросы", "supergrok.html: FAQ title"],
  ["service-faq-question", "supergrok.html: FAQ questions"],
  ['id="servicePlanFilters"', "supergrok.html: plan filter container"],
  ['id="serviceDurationFilters"', "supergrok.html: duration filter container"],
  ["/assets/css/chatgpt-grok-flat-page.css?v=20260723-ai-flat4", "supergrok.html: flat storefront stylesheet"],
  ['class="service-directory-back" href="/catalog/ai/"', "supergrok.html: AI catalog back link"],
  [`/assets/css/home-stability-hotfix.css?v=${expectedAssetVersion}`, "supergrok.html: CSS cache-bust"],
  [`/assets/js/app.min.js?v=${expectedJsAssetVersion}`, "supergrok.html: JS cache-bust"],
].forEach(([marker, label]) => requireMarker(page, marker, label));

[
  ["20260615-chatgpt-seamless1", "supergrok.html: old ChatGPT cache-bust"],
  ["service-hero", "supergrok.html: removed Grok hero"],
  ["service-hero__black-overlay", "supergrok.html: removed Grok hero overlay"],
  ["service-back-link", "supergrok.html: removed hero back link"],
  ["service-hero__stats", "supergrok.html: old hero stats block"],
  ["payment-method-modal", "supergrok.html: old static payment modal markup"],
  ["chatgpt-plans-bg", "supergrok.html: removed hero video asset"],
  ['<video class="service-hero__video"', "supergrok.html: removed hero video element"],
  ['id="serviceDeliveryFilters"', "supergrok.html: removed delivery filter container"],
].forEach(([marker, label]) => rejectMarker(page, marker, label));

[
  ["AI_ORDER_MODAL_SERVICE_KEYS", "app.js: shared AI modal service allowlist"],
  ['new Set(["chatgpt", "claude", "grok", "vpn"])', "app.js: Grok in modal service allowlist"],
  ["AI_ORDER_MODAL_SERVICE_CONFIG", "app.js: shared AI modal config"],
  ['displayName: "SuperGrok"', "app.js: Grok display name"],
  ['logo: "/assets/img/services/grok-card.webp?v=20260721-heavy-cards-webp1"', "app.js: Grok modal logo cache-bust"],
  ["const GROK_ORDER_MODAL_PLAN_KEYS", "app.js: Grok modal plan keys"],
  ['if (key === "grok") return isGrokOrderModalPlanKey(planKey);', "app.js: Grok modal plan routing"],
  ['if (key === "grok") return String(item?.title || planLabel || "").trim();', "app.js: Grok selected plan uses product title"],
].forEach(([marker, label]) => requireMarker(source, marker, label));

[
  ['new Set(["chatgpt", "claude", "grok", "vpn"])', "app.min.js: shared AI modal allowlist"],
  ["grok-card.webp?v=20260721-heavy-cards-webp1", "app.min.js: Grok modal logo cache-bust"],
].forEach(([marker, label]) => requireMarker(minifiedSource, marker, label));

[
  ['[data-service-page="grok"] .buy-btn', "css: scoped Grok buy CTA"],
  ['[data-service-page="grok"] .pay-now-btn', "css: scoped Grok pay CTA"],
  ['.service-page[data-service-page="grok"] ~ .chatgpt-go-order-modal', "css: scoped Grok modal theme"],
  ['[data-service-page="grok"] .service-checkout-card .buy-btn:hover:not(:disabled)', "css: Grok constructor buy hover override"],
  [".service-checkout-card:hover", "css: static checkout card hover override"],
  ["#05070a", "css: Grok deep black"],
  ["#f8fafc", "css: Grok high contrast text"],
].forEach(([marker, label]) => requireMarker(css, marker, label));

[
  ['[data-service-page="grok"]', "flat css: Grok accent scope"],
  [".service-constructor-shell", "flat css: constructor"],
  [".service-info-card", "flat css: information"],
  [".service-faq-item", "flat css: FAQ"],
  ["background: transparent !important", "flat css: transparent surfaces"],
  ["align-items: start", "flat css: top alignment"],
  ["linear-gradient(180deg, #22262d 0%, #1d2127 46%, #181b20 100%)", "flat css: graphite background"],
  [".service-directory-back", "flat css: AI catalog back button"],
].forEach(([marker, label]) => requireMarker(flatCss, marker, label));

requireCssRegex(
  /\[data-service-page="grok"\][\s\S]*\.payment-method[\s\S]*\.payment-option/,
  "Grok payment options scoped to service page",
);

requireCssRegex(
  /\[data-service-page="grok"\]\s+\.service-checkout-card\s+\.buy-btn:hover:not\(:disabled\)[\s\S]*transform:\s*none;/,
  "Grok constructor buy hover does not lift static selected plan",
);

requireCssRegex(
  /\[data-service-page="grok"\]\s+\.service-product-gallery\s+img\s*{[^}]*background:\s*#05070a;/,
  "Grok product logo has dark backing under transparent PNG corners",
);

requireCssRegex(
  /\.service-checkout-card:hover[\s\S]*\.service-checkout-card:focus-within[\s\S]*transform:\s*none\s*!important;/,
  "service checkout summary card stays static on hover/focus",
);

if (failures.length) {
  console.error(`SuperGrok page/modal checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("SuperGrok page and modal markers found.");
