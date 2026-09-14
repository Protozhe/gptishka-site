import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const app = read("assets/js/app.min.js");
const header = read("assets/js/site-header-unify.js");
const onboarding = read("assets/js/chatgpt-onboarding-v1.js");
const onboardingCss = read("assets/css/chatgpt-onboarding-v1.css");

expect(header.includes("Кредиты Codex от 1 500 ₽"), "shared header does not sell Codex Credits");
expect(app.includes("ai-directory-card--codex"), "Codex Credits is missing from top-ups");
expect(app.includes('const title = isEnPage ? "Steam Top Up" : "Пополнение Steam";'), "Steam title regressed");
expect(app.includes("const displayTitle = title;"), "stored showcase data can overwrite the final Steam title");
expect(onboarding.includes('document.body.classList.add("chatgpt-onboarding-ready")'), "compact ChatGPT flow is not activated");
expect(onboarding.includes('plans.insertAdjacentHTML("afterend"'), "Codex banner is not placed directly after the purchase section");
expect(onboardingCss.includes('chatgpt-symbol-mask-v2.webp?v=20260909-emerald-codex1'), "Codex banner does not use the current storefront mark");
expect(!onboardingCss.includes('background: url("/assets/img/services/chatgpt-card.webp?v=20260721-webp1")'), "Codex banner still uses the retired ChatGPT card image");
expect(onboardingCss.includes("service-info-section--chatgpt"), "legacy ChatGPT information block is not hidden");
expect(onboardingCss.includes("service-info-section--claude"), "legacy Claude information block is not hidden");
expect(onboardingCss.includes("+ .service-faq-section"), "ChatGPT FAQ spacing can regress after the hidden information block");
expect(fs.existsSync("codex-credits.html"), "Russian Codex Credits page is missing");
expect(fs.existsSync("en/codex-credits.html"), "English Codex Credits page is missing");
expect(fs.existsSync("assets/css/codex-credits.css"), "Codex Credits base stylesheet is missing");
const codexRu = read("codex-credits.html");
const codexEn = read("en/codex-credits.html");
for (const [label, html] of [["Russian", codexRu], ["English", codexEn]]) {
  expect(html.includes("/assets/css/codex-credits.css?v=20260912-product-background1"), `${label} Codex Credits page does not load the Steam-style layout`);
  expect(html.includes("codex-product-card__media"), `${label} Codex Credits page is missing the product visual card`);
  expect(html.includes("codex-supporting"), `${label} Codex Credits page is missing compact supporting details`);
  expect(!html.includes("codex-credits-calm-v1.css"), `${label} Codex Credits page still loads the regressed calm override`);
}
expect(!codexRu.includes("codex-credits-calm-v1.js"), "Russian Codex Credits page still loads the regressed DOM rewrite");

const ignoredDirectories = new Set([".git", "node_modules", "backups", "visual-baseline"]);
const htmlFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(candidate);
    else if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(candidate);
  }
};
walk(".");
const sharedAssetPattern = /(site-header-unify\.js|app\.min\.js|chatgpt-onboarding-v1\.(?:css|js))\?v=([^"'\s>]+)/g;
for (const file of htmlFiles) {
  const html = read(file);
  for (const match of html.matchAll(sharedAssetPattern)) {
    const expectedVersion = match[1] === "app.min.js"
      ? new Set(["20260912-native-navigation1", "20260914-centered-copy1"])
      : new Set(["20260912-chat-restoration2", "20260912-restored-products1", "20260912-codex-entry-visual1", "20260913-viewport-fill1"]);
    expect(expectedVersion.has(match[2]), `${file}: stale cache version for ${match[1]}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Accepted chat restoration checks passed.");
