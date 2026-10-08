import { assertAssetReference } from "./release-assets.mjs";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const fallbackPages = [
  "404.html",
  "500.html",
  "account.html",
  "app/index.html",
  "service.html",
  "success.html",
  "fail.html",
  "chatgpt-plus-kupit.html",
  "chatgpt-plus-cena.html",
  "kak-oplatit-chatgpt-v-rossii.html",
  "podklyuchenie-chatgpt-online.html"
];
const pairedPages = [
  "index.html",
  "about.html",
  "bundle-activation.html",
  "catalog/index.html",
  "catalog/ai/index.html",
  "catalog/vpn/index.html",
  "chatgpt.html",
  "claude.html",
  "contact.html",
  "guarantee.html",
  "oferta.html",
  "news/index.html",
  "politika.html",
  "redeem-start.html",
  "refund.html",
  "site-map.html",
  "store/steam/index.html",
  "store/steam/topup/index.html",
  "store/vpn/index.html",
  "store/vpn/activate/index.html",
  "supergrok.html"
];

function verifyServiceRoutes(source, label) {
  function fn(name) {
    const start = source.search(new RegExp("^  (?:async )?function " + name + "\\(", "m"));
    assert.ok(start >= 0, name);
    const next = source.slice(start + 3).search(/^  (?:async )?function /m);
    assert.ok(next >= 0, name);
    return source.slice(start, start + next + 3);
  }
  for (const en of [false, true]) {
    const context = vm.createContext({isEnPage: en});
    for (const name of ["normalizeAiServiceKey", "getProductSearchText", "getAiServiceConfig", "getServicePagePath"]) vm.runInContext(fn(name), context);
    for (const [route, key] of englishProductRoutes) {
      if (key === "itunes") continue; // Apple uses its dedicated top-up page and language router below.
      const actual = vm.runInContext(`getServicePagePath(${JSON.stringify(key)})`, context);
      assert.equal(actual, en ? route : `/${key}`, `${label}: ${key} route (${en ? "en" : "ru"})`);
    }
  }
}
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

for (const page of fallbackPages) {
  const html = read(page);
  assertAssetReference(html, "assets/js/site-header-unify.js", page);
  assertAssetReference(html, "assets/js/client-i18n.js", page);
}

for (const page of pairedPages) {
  const englishPage = path.join("en", page);
  if (!fs.existsSync(path.join(root, englishPage))) {
    failures.push(`${page}: ${englishPage} is missing`);
  }
  const html = read(page);
  if (!html.includes("lang-switch") && !html.includes("site-header-unify.js")) {
    failures.push(`${page}: language switch is missing`);
  }
}

for (const script of ["assets/js/app.js", "assets/js/app.min.js"]) {
  const source = read(script);
  if (!source.includes("targetUrl.search = window.location.search;")) {
    failures.push(`${script}: query parameters are not preserved`);
  }
  if (!source.includes("targetUrl.hash = window.location.hash;")) {
    failures.push(`${script}: hash is not preserved`);
  }
}

for (const page of [
  "en/index.html",
  "en/catalog/index.html",
  "en/catalog/ai/index.html",
  "en/catalog/vpn/index.html",
  "en/store/steam/topup/index.html"
]) {
  if (read(page).includes('href="/en/app/"')) {
    failures.push(`${page}: contains the removed /en/app/ route`);
  }
}

const englishProductRoutes = [
  ["/en/chatgpt.html", "chatgpt"],
  ["/en/claude.html", "claude"],
  ["/en/supergrok.html", "supergrok"],
  ["/en/perplexity.html", "perplexity"],
  ["/en/gemini.html", "gemini"],
  ["/en/itunes.html", "itunes"]
];
const languageSource = read("assets/js/language-switcher.js");
const maps = languageSource.slice(languageSource.indexOf("  const ENGLISH_PRODUCT_ROUTES"), languageSource.indexOf("  const languages ="));
const languageFn = languageSource.slice(languageSource.indexOf("  function languageHref("), languageSource.indexOf("  function ensureStylesheet("));
for (const [route, key] of englishProductRoutes) {
  const window = {location: {href: `https://gptishka.shop/${key}?order=test&lang=ru#subscriptions`}};
  const context = vm.createContext({URL, window});
  vm.runInContext(maps + languageFn, context);
  assert.equal(vm.runInContext('languageHref("en")', context), `${route}?order=test#subscriptions`);
  window.location.href = `https://gptishka.shop${route}?order=test#subscriptions`;
  assert.equal(vm.runInContext('languageHref("ru")', context), `/${key}?order=test#subscriptions`);
}
for (const page of pairedPages.map((file) => path.join("en", file))) {
  const html = read(page);
  for (const [route, slug] of englishProductRoutes) {
    const brokenHref = new RegExp(`href=["']/en/${slug}["']`, "i");
    const brokenAbsolute = new RegExp(`https://gptishka\\.shop/en/${slug}(?=["'])`, "i");
    if (brokenHref.test(html) || brokenAbsolute.test(html)) {
      failures.push(`${page}: contains broken extensionless ${slug} route`);
    }
  }
}

const serverSource = read("server.js");
for (const [route] of englishProductRoutes.slice(3)) {
  if (!serverSource.includes(route)) {
    failures.push(`server.js: missing English product route ${route}`);
  }
}

for (const script of ["assets/js/app.js", "assets/js/app.min.js"]) {
  const source = read(script);
  verifyServiceRoutes(source, script);
  if (!source.includes("const displayHref = isEnPage ? getServicePagePath(serviceKey) : configuredHref;")) {
    failures.push(`${script}: API service-card links are not localized`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Language coverage OK: ${pairedPages.length} route pairs and ${fallbackPages.length} fallback pages.`);
