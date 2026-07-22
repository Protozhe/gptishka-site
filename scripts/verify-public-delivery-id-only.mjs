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
assert.match(app, /if \(key === "claude" \|\| key === "grok"\) return deliveryKey === "id";/);
assert.match(app, /\["manual_login", "credentials", "support", "support_claude"\]\.includes\(deliveryType\)/);
assert.match(app, /const allItems = sortServicePageItems\(serviceKey, getPublicServiceItems\(servicePageItems, serviceKey\)\);/);
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
  assert.ok(html.includes("/assets/js/app.min.js?v=20260722-delivery-id-only1"), `${page} has stale app.js version`);
}

console.log("Public delivery UI removed; Claude/Grok ID-only flow verified.");
