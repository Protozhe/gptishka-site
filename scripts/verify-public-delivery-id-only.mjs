import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(file, "utf8");
const app = read("assets/js/app.js");
const appMin = read("assets/js/app.min.js");
const pages = [
  "index.html",
  "chatgpt.html",
  "claude.html",
  "supergrok.html",
  "service.html",
  "store/vpn/index.html",
  "en/chatgpt.html",
  "en/claude.html",
  "en/supergrok.html",
  "en/store/vpn/index.html",
];

assert.equal(app, appMin, "app.js and app.min.js must stay identical");
assert.match(app, /function getPublicServiceItems\(items, serviceKey\)/);
assert.match(app, /\(key === "claude" \|\| key === "grok"\) && deliveryKey !== "id"/);
assert.match(app, /chatgpt: new Set\(\["1m"\]\)/);
assert.match(app, /claude: new Set\(\["1m"\]\)/);
assert.match(app, /grok: new Set\(\["1m", "2m"\]\)/);
assert.match(app, /chatgpt:\s*\{[^}]*duration: \["1m"\]/s);
assert.match(app, /claude:\s*\{[^}]*duration: \["1m"\]/s);
assert.match(app, /grok:\s*\{[^}]*duration: \["1m", "2m"\]/s);
assert.match(app, /claude:\s*\{[^}]*plan: \["pro", "max-5x", "max-20x"\]/s);
assert.match(app, /const CLAUDE_ORDER_MODAL_PLAN_KEYS = new Set\(\["pro", "max-5x", "max-20x"\]\)/);
assert.match(app, /\["manual_login", "credentials", "support", "support_claude"\]\.includes\(deliveryType\)/);
assert.equal(
  (app.match(/const allItems = sortServicePageItems\(serviceKey, getPublicServiceItems\(servicePageItems, serviceKey\)\);/g) || []).length,
  2,
  "both card rendering and checkout resolution must use the filtered product list",
);
assert.match(app, /if \(serviceDeliveryFiltersEl\) serviceDeliveryFiltersEl\.innerHTML = "";/);
assert.match(app, /return isEnPage \? "By ID" : "По ID";/);

for (const forbidden of [
  "Способ доставки",
  "Со входом",
  "Без входа",
  "With login",
  "No login",
  "Without login",
  "compliance-проверку",
  "under compliance review",
  "gptishka-login-disabled-note",
  "gptishka-disabled-by-compliance",
]) {
  assert.ok(!app.includes(forbidden), `app.js still contains ${forbidden}`);
}

for (const page of pages) {
  const html = read(page);
  assert.ok(!html.includes('id="serviceDeliveryFilters"'), `${page} still renders delivery filters`);
  const expectedVersion = ["supergrok.html", "en/supergrok.html"].includes(page)
    ? "20260723-supergrok-plan1"
    : ["chatgpt.html", "claude.html", "en/chatgpt.html", "en/claude.html"].includes(page)
    ? "20260723-lava-default1"
    : ["index.html", "service.html"].includes(page)
      ? "20260722-claude-max-plans1"
      : "20260722-unified-checkout1";
  assert.ok(html.includes(`/assets/js/app.min.js?v=${expectedVersion}`), `${page} has stale app.js version`);
}

console.log("Public delivery UI removed; Claude/Grok ID-only flow verified.");
