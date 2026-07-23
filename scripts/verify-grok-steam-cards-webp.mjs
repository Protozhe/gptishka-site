import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const version = "20260721-heavy-cards-webp1";
const assets = [
  ["assets/img/services/grok-card.webp", 34266],
  ["assets/img/services/grok-card-hover.webp", 31834],
  ["assets/img/steam/steam-topup-card.webp", 42298],
  ["assets/img/steam/steam-topup-card-hover.webp", 43528],
];

for (const [relativePath, expectedBytes] of assets) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  assert.equal(bytes.length, expectedBytes, `${relativePath} size changed`);
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${relativePath} is not WebP`);
}

const app = read("assets/js/app.js");
const catalogCss = read("assets/css/home-catalog-pages.css");
const expectedMarkers = [
  `/assets/img/services/grok-card.webp?v=${version}`,
  `/assets/img/services/grok-card-hover.webp?v=${version}`,
  `/assets/img/steam/steam-topup-card.webp?v=${version}`,
  `/assets/img/steam/steam-topup-card-hover.webp?v=${version}`,
  "49e55246-a678-4f16-8b55-48ffc77a88eb",
  "655563e1-f4f4-478b-9b33-28374b868709",
];
for (const marker of expectedMarkers) assert.ok(app.includes(marker), `app.js misses ${marker}`);

for (const relativePath of ["catalog/index.html", "catalog/ai/index.html", "en/catalog/index.html", "en/catalog/ai/index.html"]) {
  assert.ok(read(relativePath).includes(`grok-card.webp?v=${version}`), `${relativePath} keeps Grok PNG`);
}
assert.ok(read("catalog/ai/index.html").includes("home-catalog-pages.css?v=20260723-ai-image-fit1"));
assert.match(catalogCss, /\.catalog-page--ai \.ai-directory-card--chatgpt \.ai-directory-card__image\s*\{[^}]*scale\(1\.06\)/s);
assert.match(catalogCss, /\.catalog-page--ai \.ai-directory-card--grok \.ai-directory-card__image\s*\{[^}]*scale\(1\.09\)/s);
assert.ok(read("store/steam/index.html").includes(`steam-topup-card-hover.webp?v=${version}`));
assert.equal(app, read("assets/js/app.min.js"), "app bundles differ");
assert.equal(app, read("main.js"), "root app copy differs");

console.log(`Grok/Steam WebP checks passed (${assets.length} assets)`);
