import assert from "node:assert/strict";
import fs from "node:fs";

const pages = [
  "chatgpt.html",
  "claude.html",
  "supergrok.html",
  "perplexity.html",
  "gemini.html",
  "devin.html",
  "midjourney.html",
  "suno.html",
  "itunes.html",
  "service.html",
  "store/vpn/index.html",
  "en/chatgpt.html",
  "en/claude.html",
  "en/supergrok.html",
  "en/midjourney.html",
  "en/suno.html",
  "en/store/vpn/index.html",
];

for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /home-stability-hotfix\.css\?v=20260924-toggle-align1/, `${page} must load the current modal styles`);
}

const css = fs.readFileSync("assets/css/home-stability-hotfix.css", "utf8");
for (const selector of [
  "chatgpt-order-gift-note p",
  "chatgpt-order-gift-time-note strong",
  "chatgpt-order-referral-extra > strong",
  "chatgpt-order-gift-details > summary",
  "chatgpt-order-gift-details__body .chatgpt-order-grid",
  "chatgpt-order-soft-action input:checked + i",
  "chatgpt-payment-option:has(input:checked) .chatgpt-payment-check",
  "chatgpt-order-error:empty",
]) {
  assert.ok(css.includes(selector), `shared modal styles must cover ${selector}`);
}

const flatStyle = "service-checkout-flat.css?v=20260924-brand-promo1";
const modalScript = "app.min.js?v=20260924-brand-promo1";
for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  assert.ok(html.includes(flatStyle), `${page} must load the shared checkout layout`);
  assert.ok(html.includes(modalScript), `${page} must load the current checkout artwork`);
}
const flatCss = fs.readFileSync("assets/css/service-checkout-flat.css", "utf8");
assert.ok(flatCss.includes('.service-page[data-service-page] ~ .chatgpt-go-order-modal'));
assert.ok(flatCss.includes(".chatgpt-order-gift-extra"));
assert.ok(flatCss.includes(".chatgpt-order-section:has(.chatgpt-order-payment)"));
assert.ok(flatCss.includes("--checkout-flat-surface"));
assert.ok(flatCss.includes("--checkout-flat-divider"));
assert.ok(flatCss.includes("min-height: 64px"));
assert.ok(flatCss.includes(".chatgpt-order-summary-card__chips"));
assert.ok(flatCss.includes(".chatgpt-order-summary-card__price"));
assert.ok(flatCss.includes(".chatgpt-order-soft-actions > .chatgpt-order-collapsible"));
for (const service of ["chatgpt", "claude", "grok", "perplexity", "gemini", "suno", "devin", "itunes"]) {
  assert.ok(flatCss.includes(`.checkout-brand-icon--${service}`), `current ${service} modal artwork must be styled`);
}
assert.ok(flatCss.includes("[data-chatgpt-go-promo-apply]"), "promo button must use shared checkout styling");
for (const script of ["assets/js/app.js", "assets/js/app.min.js"]) {
  const source = fs.readFileSync(script, "utf8");
  assert.ok(source.includes("checkout-brand-icon--"), `${script} must render the current brand artwork`);
}
assert.ok(fs.readFileSync("itunes.html", "utf8").includes("checkout-brand-icon--itunes"));
assert.ok(!flatCss.includes('content: "Добавить +"'));
assert.ok(!flatCss.includes('content: "Ввести код +"'));
console.log(`Shared checkout styling verified on ${pages.length} product pages.`);
