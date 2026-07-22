const fs = require("fs");

const source = fs.readFileSync("assets/js/app.js", "utf8");
const minifiedSource = fs.readFileSync("assets/js/app.min.js", "utf8");
const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
const page = fs.readFileSync("claude.html", "utf8");
const desktopHeroBytes = fs.statSync("assets/video/claude-hero-bg-lite.mp4").size;
const mobileHeroBytes = fs.statSync("assets/video/claude-hero-bg-mobile.mp4").size;
const heroPosterBytes = fs.statSync("assets/img/services/claude-hero-bg-poster.webp").size;

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
  ['id="serviceDurationFilters"', "claude.html: duration filter container"],
  ['/assets/video/claude-hero-bg-mobile.mp4?v=20260722-claude-hero-lite1', "claude.html: lightweight mobile hero animation"],
  ['/assets/video/claude-hero-bg-lite.mp4?v=20260722-claude-hero-lite1', "claude.html: lightweight desktop hero animation"],
  ['/assets/img/services/claude-hero-bg-poster.webp?v=20260722-claude-hero-lite1', "claude.html: static hero fallback"],
  ['media="(prefers-reduced-motion: no-preference)"', "claude.html: reduced-motion video guard"],
  [`/assets/css/home-stability-hotfix.css?v=${expectedAssetVersion}`, "claude.html: CSS cache-bust"],
  [`/assets/js/app.min.js?v=${expectedJsAssetVersion}`, "claude.html: JS cache-bust"],
].forEach(([marker, label]) => requireMarker(page, marker, label));

[
  ["20260615-chatgpt-seamless1", "claude.html: old ChatGPT cache-bust"],
  ["service-hero__stats", "claude.html: old hero stats block"],
  ["payment-method-modal", "claude.html: old static payment modal markup"],
  ["chatgpt-plans-bg", "claude.html: removed obsolete 5 MB hero video asset"],
  ['id="serviceDeliveryFilters"', "claude.html: removed delivery filter container"],
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
  ['if ((key === "claude" || key === "grok") && value === "id") return isEnPage ? "By ID" : "По ID";', "app.js: Claude/Grok delivery displays as ID"],
  ["function getServiceDeliveryFilterKey(item, serviceKey)", "app.js: service-specific delivery filter key"],
  ['if ((key === "claude" || key === "grok") && deliveryKey !== "id") return false;', "app.js: Claude/Grok expose ID products only"],
  ["function getServiceConstructorPlanTitle(item, serviceKey, planLabel)", "app.js: constructor selected plan title helper"],
  ['if (key === "claude") return String(item?.title || planLabel || "").trim();', "app.js: Claude selected plan uses product title"],
  ['const CLAUDE_ORDER_MODAL_PLAN_KEYS = new Set(["pro", "max-5x", "max-20x"]);', "app.js: Claude modal supports all three plans"],
  ['plan: ["pro", "max-5x", "max-20x"]', "app.js: Claude constructor exposes Pro, 5x Max and 20x Max"],
  ['"max-5x": "5x Max"', "app.js: Claude 5x Max label"],
  ['"max-20x": "20x Max"', "app.js: Claude 20x Max label"],
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
  ['.service-page[data-service-page] ~ .chatgpt-go-order-modal .chatgpt-order-card', "css: checkout polish is shared by all service modals"],
  ["--checkout-payment-bg-selected", "css: shared dark selected payment surface"],
  ['label.chatgpt-payment-option[aria-checked="true"]', "css: shared ARIA selected payment state"],
  ["overflow-wrap: anywhere", "css: Claude 20x Max text overflow protection"],
].forEach(([marker, label]) => requireMarker(css, marker, label));

requireCssRegex(
  /\[data-service-page="claude"\][\s\S]*\.payment-method[\s\S]*\.payment-option/,
  "Claude payment options scoped to service page",
);

if (desktopHeroBytes > 800_000) failures.push(`desktop hero video is too large: ${desktopHeroBytes} bytes`);
if (mobileHeroBytes > 350_000) failures.push(`mobile hero video is too large: ${mobileHeroBytes} bytes`);
if (heroPosterBytes > 50_000) failures.push(`hero poster is too large: ${heroPosterBytes} bytes`);

requireCssRegex(
  /\[data-service-page="claude"\]\s+\.service-checkout-card\s+\.buy-btn:hover:not\(:disabled\)[\s\S]*transform:\s*none;/,
  "Claude constructor buy hover does not lift static selected plan",
);

if (failures.length) {
  console.error(`Claude page/modal checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Claude page and modal markers found.");
