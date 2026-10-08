import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = file => fs.readFileSync(file, "utf8");
const appFiles = ["assets/js/app.js", "assets/js/app.min.js"];

for (const file of appFiles) {
  const source = read(file);
  assert.match(source, /function navigateWithPageTransition[\s\S]*?window\.location\.href = href;/, `${file}: native navigation is missing`);
  assert.ok(!source.includes('document.documentElement.classList.add("is-leaving")'), `${file}: delayed leave overlay is enabled`);
  const context = vm.createContext({window: {location: {href: "https://gptishka.shop/"}}, document: {documentElement: {classList: {remove() {}}}}, PAGE_TRANSITION_LEAVE_MS: 260});
  const navigation = source.slice(source.indexOf("function navigateWithPageTransition("), source.indexOf("function initPageEnterTransition("));
  vm.runInContext(navigation, context);
  vm.runInContext('navigateWithPageTransition("#pricing"); navigateWithPageTransition("/news/"); navigateWithPageTransition("/app/");', context);
  assert.equal(context.window.location.href, "/app/", `${file}: a same-document transition must not lock later clicks`);
  const links = source.slice(source.indexOf("function initLinkPageTransitions("), source.indexOf("function runWhenIdle("));
  assert.doesNotMatch(links, /preventDefault\(|addEventListener\("click"/, `${file}: ordinary anchors must retain native repeat-click and history behavior`);
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
const designCss = read("assets/css/storefront-design.css");
assert.match(designCss, /html body#storefrontBody > header\.gptishka-canonical-header\.header-hidden\s*\{[\s\S]*?transform:\s*none\s*!important;[\s\S]*?opacity:\s*1\s*!important;[\s\S]*?pointer-events:\s*auto\s*!important;/, "Visible sticky navigation must remain clickable after legacy auto-hide fires");
assert.match(catalogCss, /\.catalog-page\s*\{[\s\S]*?animation:\s*none;/, "Catalog page still fades in");
assert.match(catalogCss, /\.catalog-grid--directory \.ai-directory-card\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?animation:\s*none;/, "Catalog cards still reveal after load");

process.stdout.write("Native page navigation and stable catalog rendering verified.\n");
