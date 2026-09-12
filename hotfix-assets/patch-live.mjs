import fs from "node:fs";
import path from "node:path";

const appDir = process.env.APP_DIR || "/var/www/gptishka-new";
const uploadDir = process.env.UPLOAD_DIR || "/tmp/gptishka-static-ui-20260912";
const backupDir = process.env.DEPLOY_BACKUP_DIR || "/var/backups/gptishka/static-ui-20260912";
const glowMarker = "gptishka-service-glow-overflow-v1";
const cacheVersion = "20260912-glow-all1";

const onboardingCssSource = path.join(uploadDir, "chatgpt-onboarding-v1.css");
const onboardingJsSource = path.join(uploadDir, "chatgpt-onboarding-v1.js");
const claudeOnboardingJsSource = path.join(uploadDir, "claude-onboarding-v1.js");
const onboardingCssTarget = path.join(appDir, "assets/css/chatgpt-onboarding-v1.css");
const onboardingJsTarget = path.join(appDir, "assets/js/chatgpt-onboarding-v1.js");
const claudeOnboardingJsTarget = path.join(appDir, "assets/js/claude-onboarding-v1.js");
const globalCssPath = path.join(appDir, "assets/css/gptishka-global-dark.css");
const chatgptPath = path.join(appDir, "chatgpt.html");
const claudePath = path.join(appDir, "claude.html");
const reviewsJsPath = path.join(appDir, "assets/js/reviews-hub.js");
const reviewsPagePath = path.join(appDir, "app/index.html");
const reviewsReadableCssSource = path.join(uploadDir, "reviews-readable-v1.css");
const reviewsReadableCssTarget = path.join(appDir, "assets/css/reviews-readable-v1.css");

for (const required of [onboardingCssSource, onboardingJsSource, claudeOnboardingJsSource, reviewsReadableCssSource, globalCssPath, chatgptPath, claudePath, reviewsJsPath, reviewsPagePath]) {
  if (!fs.existsSync(required)) throw new Error(`Required file is missing: ${required}`);
}

fs.mkdirSync(backupDir, { recursive: true });

function backupFile(filePath) {
  const relative = path.relative(appDir, filePath);
  const target = path.join(backupDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);
}

function writeAtomic(filePath, contents) {
  const stat = fs.statSync(filePath);
  const temporary = `${filePath}.codex-ui-tmp`;
  fs.writeFileSync(temporary, contents, "utf8");
  fs.chmodSync(temporary, stat.mode);
  fs.renameSync(temporary, filePath);
}

backupFile(globalCssPath);
backupFile(chatgptPath);
backupFile(claudePath);
backupFile(reviewsJsPath);
backupFile(reviewsPagePath);
fs.mkdirSync(path.dirname(onboardingCssTarget), { recursive: true });
fs.mkdirSync(path.dirname(onboardingJsTarget), { recursive: true });
fs.copyFileSync(onboardingCssSource, onboardingCssTarget);
fs.copyFileSync(onboardingJsSource, onboardingJsTarget);
fs.copyFileSync(claudeOnboardingJsSource, claudeOnboardingJsTarget);
fs.copyFileSync(reviewsReadableCssSource, reviewsReadableCssTarget);

let reviewsJs = fs.readFileSync(reviewsJsPath, "utf8");
reviewsJs = reviewsJs.replace(
  /if \(item\.sourceType === "site"\) return "Отзыв на сайте";/,
  'if (item.sourceType === "site" || item.sourceType === "playerok") return "Отзыв на сайте";',
);
reviewsJs = reviewsJs.replace(
  /if \(item\.sourceType === "playerok"\) return "Отзыв покупателя";/,
  'if (item.sourceType === "playerok") return "Отзыв оставлен на сайте";',
);
reviewsJs = reviewsJs.replace(
  /var top = create\("div", "review-card__top"\);\s*top\.append\(\s*create\("span", "review-card__source", reviewSourceLabel\(item\)\),\s*create\("span", "review-card__rating", "★"\.repeat\(Math\.max\(1, Math\.min\(5, Number\(item\.rating\) \|\| 5\)\)\)\)\s*\);/,
  `var top = create("div", "review-card__top");
    var ratingValue = Math.max(1, Math.min(5, Math.round(Number(item.rating) || 5)));
    var rating = create("span", "review-card__rating");
    rating.setAttribute("aria-label", ratingValue + " из 5");
    var stars = create("span", "review-card__stars", "★".repeat(ratingValue));
    stars.setAttribute("aria-hidden", "true");
    rating.append(stars, create("strong", "review-card__score", ratingValue + " из 5"));
    top.append(create("span", "review-card__source", reviewSourceLabel(item)), rating);`,
);
reviewsJs = reviewsJs.replace(
  /elements\.rating\.textContent = totalWeight \? \(weightedRating \/ totalWeight\)\.toFixed\(1\) : "—";/,
  'elements.rating.textContent = totalWeight ? (weightedRating / totalWeight).toFixed(1) + " из 5" : "—";',
);
writeAtomic(reviewsJsPath, reviewsJs);

let reviewsPage = fs.readFileSync(reviewsPagePath, "utf8");
reviewsPage = reviewsPage.replace(
  /\/assets\/js\/reviews-hub\.js(?:\?[^"']*)?/g,
  "/assets/js/reviews-hub.js?v=20260912-readable1",
);
if (!reviewsPage.includes("/assets/css/reviews-readable-v1.css")) {
  reviewsPage = reviewsPage.replace(
    "</head>",
    '  <link rel="stylesheet" href="/assets/css/reviews-readable-v1.css?v=20260912-1">\n</head>',
  );
}
writeAtomic(reviewsPagePath, reviewsPage);

let globalCss = fs.readFileSync(globalCssPath, "utf8");
if (!globalCss.includes(glowMarker)) {
  globalCss += `\n\n/* ${glowMarker}: let branded button shadows fade into the page gutter. */\n`;
  globalCss += `html body:has(main.service-page) main.service-page { overflow-x: visible !important; }\n`;
  globalCss += `html body:has(main.service-page) main.service-page .service-constructor-shell { overflow: visible !important; }\n`;
  writeAtomic(globalCssPath, globalCss);
}

const skippedDirectories = new Set([".git", "node_modules", "admin", "apps", "data", "backups"]);
const htmlFiles = [];

function collectHtml(directory, depth = 0) {
  if (depth > 4) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) collectHtml(path.join(directory, entry.name), depth + 1);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(path.join(directory, entry.name));
  }
}

collectHtml(appDir);
const changedHtml = [];

for (const filePath of htmlFiles) {
  let html = fs.readFileSync(filePath, "utf8");
  if (!/<main[^>]*\bservice-page\b/i.test(html) || !html.includes("gptishka-global-dark.css")) continue;
  const original = html;
  html = html.replace(
    /\/assets\/css\/gptishka-global-dark\.css(?:\?[^"']*)?/g,
    `/assets/css/gptishka-global-dark.css?v=${cacheVersion}`,
  );
  if (path.resolve(filePath) === path.resolve(chatgptPath)) {
    html = html.replace(/\s*<link[^>]+href=["']\/__preview\/chatgpt-onboarding-step1\.css[^>]*>\s*/g, "\n");
    html = html.replace(/\s*<script[^>]+src=["']\/__preview\/chatgpt-onboarding-step1\.js[^>]*><\/script>\s*/g, "\n");
    if (!html.includes("/assets/css/chatgpt-onboarding-v1.css")) {
      html = html.replace("</head>", `  <link rel="stylesheet" href="/assets/css/chatgpt-onboarding-v1.css?v=20260912-1" />\n</head>`);
    }
    if (!html.includes("/assets/js/chatgpt-onboarding-v1.js")) {
      html = html.replace("</body>", `  <script src="/assets/js/chatgpt-onboarding-v1.js?v=20260912-1" defer></script>\n</body>`);
    }
  }
  if (path.resolve(filePath) === path.resolve(claudePath)) {
    if (!html.includes("/assets/css/chatgpt-onboarding-v1.css")) {
      html = html.replace("</head>", `  <link rel="stylesheet" href="/assets/css/chatgpt-onboarding-v1.css?v=20260912-3" />\n</head>`);
    } else {
      html = html.replace(/\/assets\/css\/chatgpt-onboarding-v1\.css(?:\?[^"']*)?/g, "/assets/css/chatgpt-onboarding-v1.css?v=20260912-3");
    }
    if (!html.includes("/assets/js/claude-onboarding-v1.js")) {
      html = html.replace("</body>", `  <script src="/assets/js/claude-onboarding-v1.js?v=20260912-2" defer></script>\n</body>`);
    } else {
      html = html.replace(/\/assets\/js\/claude-onboarding-v1\.js(?:\?[^"']*)?/g, "/assets/js/claude-onboarding-v1.js?v=20260912-2");
    }
  }
  if (html === original) continue;
  backupFile(filePath);
  writeAtomic(filePath, html);
  changedHtml.push(path.relative(appDir, filePath));
}

const finalChatgpt = fs.readFileSync(chatgptPath, "utf8");
const finalClaude = fs.readFileSync(claudePath, "utf8");
if (
  !finalChatgpt.includes("/assets/css/chatgpt-onboarding-v1.css") ||
  !finalChatgpt.includes("/assets/js/chatgpt-onboarding-v1.js") ||
  !finalChatgpt.includes(`/assets/css/gptishka-global-dark.css?v=${cacheVersion}`)
) {
  throw new Error("chatgpt.html is missing part of the static UI release");
}

if (
  !finalClaude.includes("/assets/css/chatgpt-onboarding-v1.css?v=20260912-3") ||
  !finalClaude.includes("/assets/js/claude-onboarding-v1.js?v=20260912-2")
) {
  throw new Error("claude.html is missing part of the onboarding release");
}

console.log(JSON.stringify({ backupDir, changedHtml, assets: [onboardingCssTarget, onboardingJsTarget, claudeOnboardingJsTarget] }, null, 2));
