import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const version = "20260721-cards-webp1";
const assets = [
  ["assets/img/steam/steam-balance-card.webp", 149608],
  ["assets/img/services/vpn-card.webp", 119818],
  ["assets/img/services/vpn-card-hover.webp", 129388],
  ["assets/img/services/vstar-card.webp", 123560],
  ["assets/img/services/vstar-card-hover.webp", 123016],
];

for (const [relativePath, expectedBytes] of assets) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  assert.equal(bytes.length, expectedBytes, `${relativePath} size changed`);
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${relativePath} is not WebP`);
}

const expectedReferences = [
  ["store/steam/topup/index.html", `steam-balance-card.webp?v=${version}`],
  ["store/vpn/index.html", `vpn-card.webp?v=${version}`],
  ["en/store/vpn/index.html", `vstar-card.webp?v=${version}`],
  ["catalog/vpn/index.html", `vstar-card-hover.webp?v=${version}`],
  ["en/catalog/vpn/index.html", `vstar-card-hover.webp?v=${version}`],
  ["assets/js/app.js", `vpn-card-hover.webp?v=${version}`],
  ["assets/js/home-promo-slider.js", `vstar-card.webp?v=${version}`],
];

for (const [relativePath, marker] of expectedReferences) {
  assert.ok(read(relativePath).includes(marker), `${relativePath} misses ${marker}`);
}

assert.equal(read("assets/js/app.js"), read("assets/js/app.min.js"), "app bundles differ");
assert.equal(read("assets/js/app.js"), read("main.js"), "root app copy differs");
console.log(`Steam/VPN WebP checks passed (${assets.length} assets, ${expectedReferences.length} references)`);
