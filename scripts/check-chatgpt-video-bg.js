const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "chatgpt.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "css", "chatgpt-grok-flat-page.css"), "utf8");
const app = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireIncludes(source, marker, label) {
  if (!source.includes(marker)) fail(`${label}: missing ${marker}`);
}

function requireNotIncludes(source, marker, label) {
  if (source.includes(marker)) fail(`${label}: unexpected ${marker}`);
}

[
  ['data-service-page="chatgpt"', "chatgpt.html service scope"],
  ["service-constructor-shell", "chatgpt.html constructor"],
  ["service-product-gallery", "chatgpt.html product gallery"],
  ['<img src="/assets/img/services/chatgpt-card.webp?v=20260721-webp1"', "chatgpt.html product image"],
  ["gptishka-compliance-note", "chatgpt.html compliance notice"],
  ["/assets/css/chatgpt-grok-flat-page.css?v=20260723-ai-image-fit1", "chatgpt.html flat stylesheet"],
  ['class="service-directory-back" href="/catalog/ai/"', "chatgpt.html AI catalog back link"],
  ['class="service-directory-back__icon"', "chatgpt.html complete SVG back icon"],
  ['class="service-product-gallery__viewport"', "chatgpt.html clipped product image viewport"],
].forEach(([marker, label]) => requireIncludes(page, marker, label));

if (page.indexOf("gptishka-compliance-note") < page.indexOf("</main>")) {
  fail("chatgpt.html compliance notice must be below the main content");
}

[
  ["service-hero", "chatgpt.html removed hero"],
  ["service-hero__green-overlay", "chatgpt.html removed hero overlay"],
  ["chatgpt-plans-bg", "chatgpt.html removed hero media"],
  ["service-back-link", "chatgpt.html removed hero back link"],
].forEach(([marker, label]) => requireNotIncludes(page, marker, label));

[
  ['[data-service-page="chatgpt"]', "flat CSS ChatGPT accent scope"],
  [".gptishka-compliance-note", "flat CSS compliance notice"],
  [".service-constructor-shell", "flat CSS constructor"],
  [".service-info-card", "flat CSS information"],
  [".service-faq-item", "flat CSS FAQ"],
  ["background: transparent !important", "flat CSS transparent surfaces"],
  ["align-items: start", "flat CSS top alignment"],
  ["linear-gradient(180deg, #22262d 0%, #1d2127 46%, #181b20 100%)", "flat CSS graphite background"],
  [".service-directory-back", "flat CSS AI catalog back button"],
  [".service-directory-back__icon", "flat CSS complete SVG back icon"],
  ['font-family: "Montserrat", Arial, sans-serif', "flat CSS back button font"],
  [".service-product-gallery__viewport", "flat CSS clipped product image viewport"],
  ["transform: scale(1.06)", "flat CSS ChatGPT source-edge crop"],
].forEach(([marker, label]) => requireIncludes(css, marker, label));

requireIncludes(
  app,
  'if (key === "chatgpt" && (planKey === "pro-5x" || planKey === "pro-20x")) return true;',
  "app.js enabled ChatGPT Pro plans",
);

console.log("ChatGPT flat storefront structure is valid.");
