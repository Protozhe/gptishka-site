import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const bundlePages = [
  read("bundle-activation.html"),
  read("en/bundle-activation.html"),
];
const vpnPages = [
  read("store/vpn/activate/index.html"),
  read("en/store/vpn/activate/index.html"),
];
const sharedCss = read("assets/css/activation-pages-refresh.css");
const redeemCss = read("assets/css/redeem-start-refresh.css");

for (const page of bundlePages) {
  assert.ok(page.includes('class="activation-bundle-flow home-wide-body"'));
  assert.ok(page.includes('class="nav nav-shell"'));
  assert.ok(page.includes('class="header-product-pill"'));
  assert.ok(page.includes("/assets/img/logo-new-dark.png?v=20260622-header4"));
  assert.ok(page.includes("/assets/css/activation-pages-refresh.css?v=20260724-activation-pages1"));
  assert.ok(page.includes("<footer>"));
}

for (const page of vpnPages) {
  assert.ok(page.includes('class="vpn-activation-flow home-wide-body"'));
  assert.ok(page.includes('class="nav nav-shell"'));
  assert.ok(page.includes('class="header-product-pill"'));
  assert.ok(page.includes("/assets/img/logo-new-dark.png?v=20260622-header4"));
  assert.ok(page.includes("/assets/css/activation-pages-refresh.css?v=20260724-activation-pages1"));
}

assert.ok(sharedCss.includes("zoom: 0.85"));
assert.ok(sharedCss.includes("brightness(0) invert(1)"));
assert.ok(sharedCss.includes("--activation-shell: #18212d"));
assert.ok(sharedCss.includes("body.activation-bundle-flow .bundle-card"));
assert.ok(sharedCss.includes("body.vpn-activation-flow.home-wide-body .activation-shell"));

// All AI products and tariffs share redeem-start.html, so the same desktop
// scale must remain present in the common activation page.
assert.ok(redeemCss.includes("zoom: 0.85"));

console.log("All activation page refresh markers found.");
