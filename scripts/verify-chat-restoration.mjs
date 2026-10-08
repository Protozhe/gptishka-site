import { assertAssetReference } from "./release-assets.mjs";
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

expect(header.includes("Кредиты Codex от 1 500 ₽") && header.includes("Math.min(...prices)"), "shared header does not sell Codex Credits");
expect(app.includes("ai-directory-card--codex"), "Codex Credits is missing from top-ups");
expect(app.includes('claude: "Claude Opus 5.5"'), "Claude card does not show the current model");
expect(app.includes('chatgpt: "GPT-6"'), "ChatGPT card does not show its current model");
expect(app.includes('grok: "Grok 4.7"'), "SuperGrok card does not show the model in its plan");
for (const file of ["catalog/index.html", "catalog/ai/index.html", "en/catalog/index.html", "en/catalog/ai/index.html"]) {
  const html = read(file);
  expect(html.includes('ai-directory-card__desc">GPT-6</p>'), `${file}: ChatGPT fallback model is stale`);
  expect(html.includes('ai-directory-card__desc">Grok 4.7</p>'), `${file}: SuperGrok fallback model is stale`);
}
for (const file of ["index.html", "en/index.html", "catalog/index.html", "catalog/ai/index.html", "en/catalog/index.html", "en/catalog/ai/index.html", "suno.html", "en/suno.html"]) {
  assertAssetReference(read(file), "assets/js/app.min.js", file);
}
expect(/const displayPlanSummary = serviceKey === "claude"\s*\? planSummary/.test(app), "Claude card ignores the available Max plans");
expect(app.includes('new Set(group.items.map(item => getServicePlanKey(item, serviceKey))).size'), "Claude plan count includes delivery variants");
expect(app.includes('const title = isEnPage ? "Steam Top Up" : "Пополнение Steam";'), "Steam title regressed");
expect(app.includes("const displayTitle = title;"), "stored showcase data can overwrite the final Steam title");
expect(onboarding.includes('document.body.classList.add("chatgpt-onboarding-ready")'), "compact ChatGPT flow is not activated");
expect(onboarding.includes('briefTitle: "Автоматическое подключение"'), "ChatGPT product page does not identify automatic activation");
expect(onboarding.includes('new Set(["go", "plus"])'), "ChatGPT automatic activation note must apply only to Go and Plus");
expect(onboarding.includes('if (!automaticPlanKeys.has(card.dataset.planKey || "")) return;'), "ChatGPT automatic activation note is not restricted to eligible plans");
for (const file of ["chatgpt.html", "en/chatgpt.html"]) {
  const html = read(file);
  assertAssetReference(html, "assets/css/chatgpt-onboarding-v1.css", file);
  assertAssetReference(html, "assets/js/chatgpt-onboarding-v1.js", file);
}
expect(onboarding.includes('plans.insertAdjacentHTML("afterend"'), "Codex banner is not placed directly after the purchase section");
expect(onboardingCss.includes('chatgpt-symbol-mask-v2.webp?v=20260909-emerald-codex1'), "Codex banner does not use the current storefront mark");
expect(!onboardingCss.includes('background: url("/assets/img/services/chatgpt-card.webp?v=20260721-webp1")'), "Codex banner still uses the retired ChatGPT card image");
expect(onboardingCss.includes("service-info-section--chatgpt"), "legacy ChatGPT information block is not hidden");
expect(onboardingCss.includes("service-info-section--claude"), "legacy Claude information block is not hidden");
expect(onboardingCss.includes("+ .service-faq-section"), "ChatGPT FAQ spacing can regress after the hidden information block");
expect(app.includes('const selectedTitle = getServiceConstructorPlanTitle(selectedItem, serviceKey, selectedPlan);'), "ChatGPT constructor title does not use the selected product");
expect(app.includes('serviceConstructorTitleEl.textContent = selectedTitle || "ChatGPT";'), "ChatGPT constructor title falls back incorrectly");
expect(app.includes("function isChatGptPro20RenewalItem(item)"), "Pro 20x renewal confirmation is missing");
expect(app.includes('data-pro20-renewal-confirm-continue'), "Pro 20x renewal confirmation cannot be accepted");
expect(app.includes('form.dataset.pro20RenewalConfirmed !== "1"'), "Pro 20x payment is not gated by confirmation");
expect(onboardingCss.includes(".pro20-renewal-confirm"), "Pro 20x renewal confirmation styling is missing");
expect(fs.existsSync("codex-credits.html"), "Russian Codex Credits page is missing");
expect(fs.existsSync("en/codex-credits.html"), "English Codex Credits page is missing");
expect(fs.existsSync("assets/css/codex-credits.css"), "Codex Credits base stylesheet is missing");
const codexRu = read("codex-credits.html");
const codexEn = read("en/codex-credits.html");
for (const [label, html] of [["Russian", codexRu], ["English", codexEn]]) {
  expect(html.includes("/assets/css/codex-credits.css?v=20260916-wide-readable3"), `${label} Codex Credits page does not load the Steam-style layout`);
  expect(html.includes("data-chatgpt-workspace") && html.includes('data-default-section="credits"') && html.includes('id="credits"') && html.includes('class="chatgpt-workspace-mark"') && html.includes('data-codex-order-form'), `${label} Codex Credits page is missing the product identity or credit checkout`);
  expect(html.includes("codex-supporting"), `${label} Codex Credits page is missing compact supporting details`);
  expect(!html.includes("codex-credits-calm-v1.css"), `${label} Codex Credits page still loads the regressed calm override`);
}
expect(!codexRu.includes("codex-credits-calm-v1.js"), "Russian Codex Credits page still loads the regressed DOM rewrite");

const ignoredDirectories = new Set([".git", "node_modules", "backups", "visual-baseline"]);
const htmlFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (ignoredDirectories.has(entry.name) || entry.name.startsWith("_"))) continue;
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(candidate);
    else if (entry.isFile() && entry.name.endsWith(".html") && !entry.name.startsWith("_")) htmlFiles.push(candidate);
  }
};
walk(".");
const sharedAssetPattern = /(site-header-unify\.js|app\.min\.js|chatgpt-onboarding-v1\.(?:css|js))\?v=([^"'\s>]+)/g;
for (const file of htmlFiles) {
  const html = read(file);
  for (const match of html.matchAll(sharedAssetPattern)) {
    const directory = match[1].endsWith(".css") ? "css" : "js";
    assertAssetReference(html, `assets/${directory}/${match[1]}`, file);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Accepted chat restoration checks passed.");
