const fs = require("fs");

const page = fs.readFileSync("perplexity.html", "utf8");
const source = fs.readFileSync("assets/js/app.js", "utf8");
const minifiedSource = fs.readFileSync("assets/js/app.min.js", "utf8");
const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
const failures = [];

function requireMarker(content, marker, label) {
  if (!content.includes(marker)) failures.push(label || marker);
}

[
  ['data-service-page="perplexity"', "Perplexity service scope"],
  ['data-service-layout="constructor"', "constructor layout"],
  ["/assets/css/home-stability-hotfix.css?v=20260810-perplexity-modal4", "modal CSS cache-bust"],
  ["/assets/js/app.min.js?v=20260809-perplexity-page3", "current shared checkout script"],
].forEach(([marker, label]) => requireMarker(page, marker, `perplexity.html: ${label}`));

[
  ['const PERPLEXITY_ORDER_MODAL_PLAN_KEYS = new Set(["pro"])', "Perplexity plan routing"],
  ['new Set(["chatgpt", "claude", "grok", "perplexity", "vpn"])', "Perplexity modal allowlist"],
  ['displayName: "Perplexity"', "Perplexity modal copy"],
  ['logo: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1"', "Perplexity modal logo"],
  ['if (key === "perplexity") return isPerplexityOrderModalPlanKey(planKey);', "Perplexity modal trigger"],
].forEach(([marker, label]) => requireMarker(source, marker, `app.js: ${label}`));

requireMarker(minifiedSource, 'displayName: "Perplexity"', "app.min.js: Perplexity modal copy");
requireMarker(
  css,
  '.service-page:is([data-service-page="grok"], [data-service-page="perplexity"]) ~ .chatgpt-go-order-modal',
  "CSS: shared polished modal layout",
);
requireMarker(
  css,
  '.service-page[data-service-page="perplexity"] ~ .chatgpt-go-order-modal .chatgpt-order-submit',
  "CSS: Perplexity submit accent",
);
requireMarker(css, "--grok-black-2: #0b3a37", "CSS: Perplexity teal-black theme");

if (failures.length) {
  console.error(`Perplexity page/modal checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Perplexity page and shared order modal checks passed.");
