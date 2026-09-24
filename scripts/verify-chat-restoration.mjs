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

expect(header.includes("Кредиты Codex от 1 850 ₽"), "shared header does not sell Codex Credits");
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
  const version = ["suno.html", "en/suno.html"].includes(file) ? "20260924-brand-promo1" : "20260924-order-hours2";
  expect(read(file).includes(`/assets/js/app.min.js?v=${version}`), `${file}: cached app script can restore stale model labels`);
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
  expect(html.includes('chatgpt-onboarding-v1.css?v=20260923-chatgpt-auto-label1'), `${file}: ChatGPT activation note styles may be cached`);
  expect(html.includes('chatgpt-onboarding-v1.js?v=20260923-chatgpt-auto-label2'), `${file}: ChatGPT activation note copy may be cached`);
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
  expect(html.includes("codex-product-card__media"), `${label} Codex Credits page is missing the product visual card`);
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
    const expectedVersion = match[1] === "app.min.js"
      ? new Set(["20260912-native-navigation1", "20260914-centered-copy1", "20260915-no-ticker1", "20260916-codex-header-price1", "20260917-chatgpt-seo1", "20260917-chatgpt-seo2", "20260917-chatgpt-guide2", "20260919-admin-plan-titles1", "20260919-pro20-renewal-confirm1", "20260922-devin-clean2", "20260922-devin-modal1", "20260924-support-account1", "20260924-order-hours2", "20260924-brand-promo1"])
      : new Set(["20260912-chat-restoration2", "20260912-restored-products1", "20260912-codex-entry-visual1", "20260913-viewport-fill1", "20260916-codex-header-price1", "20260917-readable-guide1", "20260917-faq-topic-fix1", "20260917-faq-dividers1", "20260919-pro20-renewal-confirm1"]);
    const isMidjourneyUpdate = match[1] === "app.min.js" && match[2] === "20260923-midjourney1" &&
      ["index.html", "catalog/index.html", "catalog/ai/index.html", "midjourney.html", "en/midjourney.html"].includes(file.replaceAll("\\", "/"));
    const isMidjourneyHoverUpdate = match[1] === "app.min.js" && match[2] === "20260923-midjourney-hover1" &&
      ["index.html", "catalog/index.html", "catalog/ai/index.html", "en/index.html", "en/catalog/ai/index.html"].includes(file.replaceAll("\\", "/"));
    const isClaudeMaxUpdate = match[1] === "app.min.js" && match[2] === "20260923-claude-max-login1" &&
      ["claude.html", "en/claude.html"].includes(file.replaceAll("\\", "/"));
    const isClaudePlansUpdate = match[1] === "app.min.js" && match[2] === "20260923-claude-plans1" &&
      ["index.html", "catalog/index.html", "catalog/ai/index.html", "en/index.html", "en/catalog/index.html", "en/catalog/ai/index.html"].includes(file.replaceAll("\\", "/"));
    const isModelCardsUpdate = match[1] === "app.min.js" && match[2] === "20260923-model-cards1" &&
      ["index.html", "catalog/index.html", "catalog/ai/index.html", "en/index.html", "en/catalog/index.html", "en/catalog/ai/index.html"].includes(file.replaceAll("\\", "/"));
    const isSunoPlansUpdate = match[1] === "app.min.js" && match[2] === "20260923-suno-plans1" &&
      ["index.html", "catalog/index.html", "catalog/ai/index.html", "en/index.html", "en/catalog/index.html", "en/catalog/ai/index.html", "suno.html", "en/suno.html"].includes(file.replaceAll("\\", "/"));
    const isModelCardsRefresh = match[1] === "app.min.js" && match[2] === "20260923-model-cards2" &&
      ["index.html", "catalog/index.html", "catalog/ai/index.html", "en/index.html", "en/catalog/index.html", "en/catalog/ai/index.html", "suno.html", "en/suno.html"].includes(file.replaceAll("\\", "/"));
    const isDevinLinkUpdate = match[1] === "app.min.js" && match[2] === "20260924-devin-link1" &&
      file.replaceAll("\\", "/") === "devin.html";
    const isChatGptAutoLabelUpdate = ["20260923-chatgpt-auto-label1", "20260923-chatgpt-auto-label2"].includes(match[2]) &&
      ["chatgpt.html", "en/chatgpt.html"].includes(file.replaceAll("\\", "/")) &&
      ["chatgpt-onboarding-v1.css", "chatgpt-onboarding-v1.js"].includes(match[1]);
    expect(expectedVersion.has(match[2]) || isMidjourneyUpdate || isMidjourneyHoverUpdate || isClaudeMaxUpdate || isClaudePlansUpdate || isModelCardsUpdate || isSunoPlansUpdate || isModelCardsRefresh || isDevinLinkUpdate || isChatGptAutoLabelUpdate, `${file}: stale cache version for ${match[1]}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Accepted chat restoration checks passed.");
