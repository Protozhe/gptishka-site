import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const version = "20260721-vpn-bg-webp1";
const sliderVersion = "20260721-shortcuts-responsive1";
const cssVersion = "20260721-css-min1";
const assets = [
  ["assets/img/home/vpn-shortcut-bg.webp", 208744],
  ["assets/img/home/vpn-promo-bg.webp", 162652],
];

for (const [relativePath, expectedBytes] of assets) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  assert.equal(bytes.length, expectedBytes, `${relativePath} size changed`);
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${relativePath} is not WebP`);
}

const css = read("assets/css/home-wide-marketplace.css");
const slider = read("assets/js/home-promo-slider.js");
const index = read("index.html");
const homepageData = read("apps/admin-backend/data/homepage-content.json");
const homepageService = read("apps/admin-backend/src/modules/homepage/homepage-content.service.ts");

assert.ok(!css.includes("vpn-promo-bg.png"), "CSS must not eagerly load the VPN promo PNG");
assert.ok(!css.includes("vpn-shortcut-bg.png"), "CSS must not duplicate the VPN shortcut image");
assert.ok(slider.includes(`/assets/img/home/vpn-promo-bg.webp?v=${version}`), "VPN promo WebP fallback missing");
assert.ok(slider.includes(`/assets/img/home/vpn-shortcut-bg.webp?v=${version}`), "VPN shortcut PNG normalization missing");
assert.ok(slider.includes("ensureSlideBackground(list[activeIndex])"), "active-slide lazy loading missing");
assert.ok(index.includes(`/assets/css/home-critical-bundle.min.css?v=${cssVersion}`), "homepage CSS cache-bust missing");
assert.ok(index.includes(`/assets/js/home-promo-slider.js?v=${sliderVersion}`), "homepage slider cache-bust missing");
assert.equal((homepageData.match(new RegExp(`vpn-shortcut-bg\\.webp\\?v=${version}`, "g")) || []).length, 2);
assert.equal((homepageData.match(new RegExp(`vpn-promo-bg\\.webp\\?v=${version}`, "g")) || []).length, 2);
assert.equal((homepageService.match(new RegExp(`vpn-promo-bg\\.webp\\?v=${version}`, "g")) || []).length, 2);

console.log(`Homepage VPN background checks passed (${assets.length} assets)`);
