import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
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
const pages = [
  ...pairedPages.flatMap((file) => [file, `en/${file}`]),
  ...fallbackPages
];
const scriptNeedle = "/assets/js/language-switcher.js?v=20260810-language-persist1";
const failures = [];

for (const file of pages) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${file}: file is missing`);
    continue;
  }
  const html = fs.readFileSync(fullPath, "utf8");
  const count = html.split(scriptNeedle).length - 1;
  if (count !== 1) {
    failures.push(`${file}: expected one language menu script, found ${count}`);
  }
  const footerCount = (html.match(/<footer\b/gi) || []).length;
  if (footerCount > 1) {
    failures.push(`${file}: expected at most one page footer, found ${footerCount}`);
  }
}

const menuSource = fs.readFileSync(
  path.join(root, "assets/js/language-switcher.js"),
  "utf8"
);
for (const marker of [
  "targetUrl.searchParams.set(\"lang\", \"en\")",
  "targetUrl.searchParams.delete(\"lang\")",
  "targetUrl.hash",
  "/assets/css/language-slider.css?v=20260724-language-menu3",
  "/assets/css/header-navigation-state.css?v=20260724-header-layout3",
  "/assets/css/site-footer-unified.css?v=20260724-unified-footer1",
  "/assets/img/iconeng.png",
  "/assets/img/iconrus.avif",
  "language-menu__popover",
  "aria-expanded",
  "MutationObserver",
  "enhanceHeaderNavigation",
  "createSocialIcon",
  "is-current-section",
  "header-social-link",
  "enhanceUnifiedFooter",
  "gptishka-unified-footer",
  "gptishka-language",
  "rewriteLinksForActiveLanguage"
]) {
  if (!menuSource.includes(marker)) {
    failures.push(`language-switcher.js: missing ${marker}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Language menu coverage OK: ${pages.length} client pages.`);
