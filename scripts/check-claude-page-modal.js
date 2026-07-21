const fs = require("fs");

const source = fs.readFileSync("assets/js/app.js", "utf8");
const minifiedSource = fs.readFileSync("assets/js/app.min.js", "utf8");
const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
const page = fs.readFileSync("claude.html", "utf8");

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

const expectedAssetVersion = "20260618-claude-logo2";
const expectedJsAssetVersion = "20260721-cards-webp1";

[
  ["service-page--constructor", "claude.html: constructor page class"],
  ['data-service-page="claude"', "claude.html: Claude service scope"],
  ['data-service-layout="constructor"', "claude.html: constructor layout marker"],
  ["service-hero--claude", "claude.html: Claude hero modifier"],
  ['class="service-hero__orange-overlay"', "claude.html: Claude hero orange overlay"],
  ['class="service-hero__dark-overlay"', "claude.html: Claude hero dark overlay"],
  ["service-constructor-shell", "claude.html: constructor shell"],
  ["service-product-gallery", "claude.html: product gallery"],
  ["/assets/img/services/claude-card.png?v=20260618-claude-logo2", "claude.html: Claude product image cache-bust"],
  ["service-selected-plan", "claude.html: selected plan summary"],
  ['id="servicePlanFilters"', "claude.html: plan filter container"],
  ['id="serviceDeliveryFilters"', "claude.html: delivery filter container"],
  ['id="serviceDurationFilters"', "claude.html: duration filter container"],
  [`/assets/css/home-stability-hotfix.css?v=${expectedAssetVersion}`, "claude.html: CSS cache-bust"],
  [`/assets/js/app.min.js?v=${expectedJsAssetVersion}`, "claude.html: JS cache-bust"],
].forEach(([marker, label]) => requireMarker(page, marker, label));

[
  ["20260615-chatgpt-seamless1", "claude.html: old ChatGPT cache-bust"],
  ["service-hero__stats", "claude.html: old hero stats block"],
  ["payment-method-modal", "claude.html: old static payment modal markup"],
  ["chatgpt-plans-bg", "claude.html: removed hero video asset"],
  ['<video class="service-hero__video"', "claude.html: removed hero video element"],
].forEach(([marker, label]) => rejectMarker(page, marker, label));

[
  ["AI_ORDER_MODAL_SERVICE_KEYS", "app.js: shared AI modal service allowlist"],
  ["AI_ORDER_MODAL_SERVICE_CONFIG", "app.js: shared AI modal config"],
  ['new Set(["chatgpt", "claude", "grok", "vpn"])', "app.js: Claude in modal service allowlist"],
  ["isAiOrderModalServiceKey", "app.js: generic service check"],
  ["getAiOrderModalServiceConfig", "app.js: service-specific modal config lookup"],
  ["renderChatGptGoOrderCard(item, serviceKey)", "app.js: render receives service key"],
  ['logo: "/assets/img/services/claude-card.png?v=20260618-claude-logo2"', "app.js: Claude modal logo cache-bust"],
  ['displayName: "Claude"', "app.js: Claude display name"],
  ["service-checkout-card", "app.js: constructor checkout card"],
  ['class="buy-btn pay-now-btn"', "app.js: constructor checkout CTA hook"],
  ["const term = getAiOrderModalServiceConfig(serviceKey).displayName", "app.js: constructor card uses service-specific term"],
  ["function getServiceDeliveryDisplayLabel(serviceKey, deliveryKey)", "app.js: service-specific delivery display labels"],
  ['if ((key === "claude" || key === "grok") && value === "id") return isEnPage ? "Without login" : "Без входа";', "app.js: Claude/Grok id delivery displays as no-login"],
  ["function getServiceDeliveryFilterKey(item, serviceKey)", "app.js: service-specific delivery filter key"],
  ['if ((key === "claude" || key === "grok") && deliveryKey === "id") return "link";', "app.js: Claude/Grok id delivery merges into no-login filter"],
  ["function getServiceConstructorPlanTitle(item, serviceKey, planLabel)", "app.js: constructor selected plan title helper"],
  ['if (key === "claude") return String(item?.title || planLabel || "").trim();', "app.js: Claude selected plan uses product title"],
].forEach(([marker, label]) => requireMarker(source, marker, label));

[
  ['new Set(["chatgpt", "claude", "grok", "vpn"])', "app.min.js: shared AI modal allowlist"],
  ["claude-card.png?v=20260618-claude-logo2", "app.min.js: Claude modal logo cache-bust"],
  ["claude-card-hover.png?v=20260618-claude-logo2", "app.min.js: Claude hover logo cache-bust"],
].forEach(([marker, label]) => requireMarker(minifiedSource, marker, label));

[
  ['[data-service-page="claude"] .buy-btn', "css: scoped Claude buy CTA"],
  ['[data-service-page="claude"] .pay-now-btn', "css: scoped Claude pay CTA"],
  ['.service-page[data-service-page="claude"] ~ .chatgpt-go-order-modal', "css: scoped Claude modal theme"],
  ["#ffb15a", "css: Claude orange highlight"],
  ["#f97316", "css: Claude orange primary"],
  ["#c2410c", "css: Claude orange deep"],
  [".service-hero__orange-overlay", "css: Claude orange video overlay"],
  ["claudeHeroBackgroundShift", "css: Claude visible animated hero background"],
  ['[data-service-page="claude"] .service-checkout-card .buy-btn:hover:not(:disabled)', "css: Claude constructor buy hover override"],
  ["#f68b2f", "css: softer Claude hover orange"],
].forEach(([marker, label]) => requireMarker(css, marker, label));

requireCssRegex(
  /\[data-service-page="claude"\][\s\S]*\.payment-method[\s\S]*\.payment-option/,
  "Claude payment options scoped to service page",
);

requireCssRegex(
  /\[data-service-page="claude"\]\s+\.service-checkout-card\s+\.buy-btn:hover:not\(:disabled\)[\s\S]*transform:\s*none;/,
  "Claude constructor buy hover does not lift static selected plan",
);

if (failures.length) {
  console.error(`Claude page/modal checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Claude page and modal markers found.");
