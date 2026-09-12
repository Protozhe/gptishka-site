import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const css = read("assets/css/codex-card.css");
const app = read("assets/js/app.js");
const pages = [
  "index.html",
  "catalog/index.html",
  "catalog/ai/index.html",
  "store/steam/index.html",
  "en/index.html",
  "en/catalog/index.html",
  "en/catalog/ai/index.html",
  "en/store/steam/index.html",
];
const masks = [
  "appstore-symbol-mask-v6.webp",
  "chatgpt-symbol-mask-v2.webp",
  "claude-symbol-mask-v1.webp",
  "gemini-symbol-mask-v1.svg",
  "grok-symbol-mask-v1.webp",
  "perplexity-symbol-mask-v1.svg",
  "steam-symbol-mask-v1.webp",
  "suno-wordmark-mask-v1.webp",
];

for (const page of pages) {
  const html = read(page);
  expect(html.includes("/assets/css/codex-card.css?v=20260912-restored-products1"), `${page}: card stylesheet is missing`);
  expect(html.includes("/assets/js/app.min.js?v=20260912-native-navigation1"), `${page}: card script cache version is stale`);
}
for (const mask of masks) {
  expect(fs.existsSync(path.join(root, "assets/img/services", mask)), `missing brand mask: ${mask}`);
  expect(css.includes(mask), `card stylesheet does not reference: ${mask}`);
}

for (const brand of ["chatgpt", "claude", "grok", "perplexity", "gemini", "suno"]) {
  expect(read("catalog/ai/index.html").includes(`ai-directory-card__brand-mark--${brand}`), `static ${brand} card is not restored`);
}
expect(
  app.includes('["chatgpt", "claude", "grok", "perplexity", "gemini", "suno"].includes(serviceKey)'),
  "dynamic AI brand-card mapping is not restored",
);
for (const brand of ["steam", "codex", "appstore"]) {
  expect(app.includes(`ai-directory-card__brand-mark--${brand}`), `dynamic ${brand} top-up card is not restored`);
  expect(read("store/steam/index.html").includes(`ai-directory-card__brand-mark--${brand}`), `static ${brand} top-up card is not restored`);
}

expect(read("catalog/index.html").includes("от 1 090 RUB"), "current ChatGPT minimum price was lost");
expect(css.includes("html body.home-catalog-body .ai-directory-card--suno"), "Suno catalog override is missing");
expect(!read("catalog/index.html").includes("+    <article"), "patch marker leaked into Russian catalog");
expect(!read("en/catalog/index.html").includes("+    <article"), "patch marker leaked into English catalog");

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Card restoration verification passed.");
