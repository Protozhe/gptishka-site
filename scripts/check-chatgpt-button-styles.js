const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pagePath = path.join(root, "chatgpt.html");
const cssPath = path.join(root, "assets", "css", "home-stability-hotfix.css");

const page = fs.readFileSync(pagePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireIncludes(source, marker, label) {
  if (!source.includes(marker)) {
    fail(`${label}: missing ${marker}`);
  }
}

function requireRegex(source, regex, label) {
  if (!regex.test(source)) {
    fail(`${label}: missing pattern ${regex}`);
  }
}

requireIncludes(
  page,
  '/assets/css/home-stability-hotfix.css?v=20260618-chatgpt-static-card2',
  "chatgpt.html CSS cache-bust",
);
requireIncludes(
  page,
  '<main class="page service-page service-page--constructor" data-service-page="chatgpt"',
  "chatgpt.html service page scope",
);

const blockMatch = css.match(
  /\/\* ChatGPT page scoped emerald controls \*\/[\s\S]*?\/\* End ChatGPT page scoped emerald controls \*\//,
);
if (!blockMatch) {
  fail("home-stability-hotfix.css: ChatGPT scoped emerald controls block not found");
}

const block = blockMatch[0];

requireIncludes(block, '[data-service-page="chatgpt"]', "CSS ChatGPT page scope");
requireIncludes(block, '.service-page[data-service-page="chatgpt"] ~ .payment-method-modal', "CSS ChatGPT payment modal scope");
requireIncludes(block, '.service-page[data-service-page="chatgpt"] ~ .chatgpt-go-order-modal', "CSS ChatGPT order modal scope");

requireIncludes(block, "--gpt-green: #35f28f;", "CSS ChatGPT green variable");
requireIncludes(block, "--gpt-green-2: #18c878;", "CSS ChatGPT green variable");
requireIncludes(block, "--gpt-green-3: #0f8f5c;", "CSS ChatGPT green variable");
requireRegex(
  block,
  /\[data-service-page="chatgpt"\]\s+\.buy-btn[\s\S]*linear-gradient\(135deg,\s*var\(--gpt-green\)\s*0%,\s*var\(--gpt-green-2\)\s*52%,\s*var\(--gpt-green-3\)\s*100%\)/,
  "CSS primary ChatGPT CTA gradient",
);
requireRegex(
  block,
  /\[data-service-page="chatgpt"\]\s+\.buy-btn[\s\S]*color:\s*var\(--gpt-button-text-dark\)/,
  "CSS primary ChatGPT CTA dark text",
);
requireIncludes(block, '[data-service-page="chatgpt"] .pay-now-btn', "CSS ChatGPT pay button");
requireIncludes(block, '.service-page[data-service-page="chatgpt"] ~ .chatgpt-go-order-modal .chatgpt-order-submit', "CSS ChatGPT order submit");
requireIncludes(block, '[data-service-page="chatgpt"] .service-filter-chip.is-active', "CSS ChatGPT selected tariff chip");

requireIncludes(block, '[data-service-page="chatgpt"] .service-back-link', "CSS ChatGPT secondary back link");
requireIncludes(block, '.service-page[data-service-page="chatgpt"] ~ .chatgpt-go-order-modal .chatgpt-order-promo .btn', "CSS ChatGPT secondary promo button");

requireIncludes(block, '.payment-method-modal__option:hover', "CSS ChatGPT payment method hover");
requireIncludes(block, '.payment-method-modal__option.is-active', "CSS ChatGPT payment method selected class");
requireIncludes(block, '.payment-method-modal__option[aria-pressed="true"]', "CSS ChatGPT payment method selected aria");
requireRegex(
  block,
  /\.service-page\[data-service-page="chatgpt"\]\s*~\s*\.payment-method-modal\s+\.payment-method-modal__option[\s\S]*background:[\s\S]*!important[\s\S]*box-shadow:[\s\S]*!important/,
  "CSS ChatGPT payment method modal important override",
);
requireIncludes(block, '.chatgpt-order-payment label:has(input:checked)', "CSS ChatGPT modal payment selected radio");

requireIncludes(block, ':focus-visible', "CSS ChatGPT focus-visible state");
requireIncludes(block, ':disabled', "CSS ChatGPT disabled state");
requireIncludes(block, '@media (prefers-reduced-motion: reduce)', "CSS ChatGPT reduced motion");
requireRegex(block, /@media\s*\(max-width:\s*640px\)[\s\S]*min-height:\s*48px;/, "CSS ChatGPT mobile button min-height");
requireRegex(
  css,
  /\[data-service-page="chatgpt"\]\s+\.service-checkout-card\s+\.buy-btn:hover:not\(:disabled\)[\s\S]*transform:\s*none;/,
  "CSS ChatGPT constructor buy hover does not lift static selected plan",
);

if (/(^|\n)\s*\.service-page\s+\.buy-btn/.test(block)) {
  fail("CSS ChatGPT block: unscoped .service-page .buy-btn selector is forbidden");
}
if (/(^|\n)\s*\.payment-method-modal__option/.test(block)) {
  fail("CSS ChatGPT block: unscoped .payment-method-modal__option selector is forbidden");
}

console.log("ChatGPT scoped emerald button styles are valid.");
