import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(file, "utf8");
const appFiles = ["assets/js/app.js", "assets/js/app.min.js"];

for (const file of appFiles) {
  const source = read(file);
  assert.match(source, /function navigateWithPageTransition[\s\S]*?window\.location\.href = href;/, `${file}: native navigation is missing`);
  assert.ok(!source.includes('document.documentElement.classList.add("is-leaving")'), `${file}: delayed leave overlay is enabled`);
}

const catalogPages = [
  "catalog/index.html",
  "catalog/ai/index.html",
  "catalog/vpn/index.html",
  "store/steam/index.html",
  "en/catalog/index.html",
  "en/catalog/ai/index.html",
  "en/catalog/vpn/index.html",
  "en/store/steam/index.html",
];

for (const file of catalogPages) {
  const html = read(file);
  assert.ok(!/\n\s*enableCatalogSmoothNavigation\(\);/.test(html), `${file}: delayed catalog navigation is enabled`);
  assert.ok(html.includes("/assets/css/home-catalog-pages.css?v=20260912-native-navigation1"), `${file}: catalog stability CSS cache marker is stale`);
}

const catalogCss = read("assets/css/home-catalog-pages.css");
assert.match(catalogCss, /\.catalog-page\s*\{[\s\S]*?animation:\s*none;/, "Catalog page still fades in");
assert.match(catalogCss, /\.catalog-grid--directory \.ai-directory-card\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?animation:\s*none;/, "Catalog cards still reveal after load");

process.stdout.write("Native page navigation and stable catalog rendering verified.\n");
