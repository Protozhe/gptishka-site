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
const newsReadableCssSource = path.join(uploadDir, "news-readable-v1.css");
const newsReadableCssTarget = path.join(appDir, "assets/css/news-readable-v1.css");
const newsJsPath = path.join(appDir, "assets/js/news-hub.js");
const newsPagePath = path.join(appDir, "news/index.html");

for (const required of [onboardingCssSource, onboardingJsSource, claudeOnboardingJsSource, reviewsReadableCssSource, newsReadableCssSource, globalCssPath, chatgptPath, claudePath, reviewsJsPath, reviewsPagePath, newsJsPath, newsPagePath]) {
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
backupFile(newsJsPath);
backupFile(newsPagePath);
fs.mkdirSync(path.dirname(onboardingCssTarget), { recursive: true });
fs.mkdirSync(path.dirname(onboardingJsTarget), { recursive: true });
fs.copyFileSync(onboardingCssSource, onboardingCssTarget);
fs.copyFileSync(onboardingJsSource, onboardingJsTarget);
fs.copyFileSync(claudeOnboardingJsSource, claudeOnboardingJsTarget);
fs.copyFileSync(reviewsReadableCssSource, reviewsReadableCssTarget);
fs.copyFileSync(newsReadableCssSource, newsReadableCssTarget);

let reviewsJs = fs.readFileSync(reviewsJsPath, "utf8");
reviewsJs = reviewsJs.replace(
  /  function reviewNickname\(item\) \{[\s\S]*?\n  \}\n\n  function reviewSourceLabel\(item\) \{[\s\S]*?\n  \}\n\n  function renderReview/,
  `  function isSitePresentedReview(item) {
    if (item.sourceType === "site" || item.sourceType === "playerok") return true;
    var sourceLabel = String(item.sourceLabel || "").trim();
    var author = String(item.author || "").trim();
    return Boolean(item.sourceHidden) && sourceLabel === "Покупатель" && author === "Покупатель";
  }

  function reviewNickname(item) {
    if (isSitePresentedReview(item)) return "Отзыв на сайте";
    var explicitNickname = String(item.nickname || "").trim();
    if (explicitNickname) return explicitNickname;
    var author = String(item.author || "").trim();
    return author || "Покупатель";
  }

  function reviewSourceLabel(item) {
    if (isSitePresentedReview(item)) return "Отзыв на сайте";
    return item.sourceLabel || "Открытый источник";
  }

  function renderReview`,
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
reviewsJs = reviewsJs.replace(
  /  function reviewQualityScore\(item\) \{[\s\S]*?\n  \}\n\n(?=  function renderReviews)/,
  "",
);
reviewsJs = reviewsJs.replace(
  /  function renderReviews\(data\) \{[\s\S]*?\n  \}\n\n  function showError/,
  `  function reviewQualityScore(item) {
    var text = String(item.text || "").trim().toLowerCase();
    var score = Math.max(1, Math.min(5, Number(item.rating) || 5)) * 12;
    var length = text.length;

    if (length >= 55 && length <= 240) score += 28;
    else if (length >= 35 && length <= 320) score += 16;
    else if (length < 24) score -= 24;
    else if (length > 360) score -= 12;

    ["быстро", "оператив", "без входа", "официаль", "безопас", "помог", "понят", "рекоменд", "подписка работает"].forEach(function (word) {
      if (text.includes(word)) score += 6;
    });
    ["не первый раз", "вторая покупка", "снова", "продлеваю", "вернусь", "ещё обращаться"].forEach(function (word) {
      if (text.includes(word)) score += 12;
    });
    ["ужасно", "жуликов", "забан", "ждал долго", "долго отвечал", "невнимательно", "3 часа", "кот наплакал", "напрягся", "не работал"].forEach(function (word) {
      if (text.includes(word)) score -= 30;
    });

    if (!item.sourceHidden) score += 5;
    if (item.sourceType === "site" || item.sourceType === "playerok") score += 4;
    return score;
  }

  function rankReviews(items) {
    return items.slice().sort(function (a, b) {
      var scoreDifference = reviewQualityScore(b) - reviewQualityScore(a);
      if (scoreDifference) return scoreDifference;
      return (Date.parse(b.date || "") || 0) - (Date.parse(a.date || "") || 0);
    });
  }

  function renderReviews(data) {
    var items = rankReviews(filteredItems(data));
    elements.filters.hidden = true;
    var title = document.getElementById("reviewsFeedTitle");
    if (title) title.textContent = "Что пишут покупатели";
    var visible = items.slice(0, state.visible);
    elements.grid.replaceChildren();
    visible.forEach(function (item) {
      elements.grid.append(renderReview(item));
    });
    elements.grid.setAttribute("aria-busy", "false");
    elements.empty.hidden = items.length > 0;
    elements.grid.hidden = items.length === 0;
    elements.more.hidden = visible.length >= items.length;
  }

  function showError`,
);
writeAtomic(reviewsJsPath, reviewsJs);

let reviewsPage = fs.readFileSync(reviewsPagePath, "utf8");
reviewsPage = reviewsPage.replace(
  /\/assets\/js\/reviews-hub\.js(?:\?[^"']*)?/g,
  "/assets/js/reviews-hub.js?v=20260912-trustfeed1",
);
if (!reviewsPage.includes("/assets/css/reviews-readable-v1.css")) {
  reviewsPage = reviewsPage.replace(
    "</head>",
    '  <link rel="stylesheet" href="/assets/css/reviews-readable-v1.css?v=20260912-6">\n</head>',
  );
} else {
  reviewsPage = reviewsPage.replace(
    /\/assets\/css\/reviews-readable-v1\.css(?:\?[^"']*)?/g,
    "/assets/css/reviews-readable-v1.css?v=20260912-6",
  );
}
writeAtomic(reviewsPagePath, reviewsPage);

let newsJs = fs.readFileSync(newsJsPath, "utf8");
newsJs = newsJs.replace(
  /  function renderCard\(item\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  function render\(/,
  `  function renderCard(item) {
    const article = document.createElement("article");
    article.className = \`news-card \${item.imageUrl ? "news-card--with-media" : "news-card--text-only"}\`;

    if (item.imageUrl) {
      const media = document.createElement("div");
      media.className = "news-card__media";

      const image = document.createElement("img");
      image.dataset.src = \`/api/public/news/\${encodeURIComponent(item.postId)}/image\`;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.fetchPriority = "low";
      image.width = 640;
      image.height = 480;
      image.referrerPolicy = "no-referrer";
      media.appendChild(image);
      if (mediaObserver) mediaObserver.observe(image);
      else image.src = item.imageUrl;

      if (item.hasVideo) {
        const badge = textNode("span", "news-card__video", labels.video);
        badge.setAttribute("aria-hidden", "true");
        media.appendChild(badge);
      }
      article.appendChild(media);
    }

    const body = document.createElement("div");
    body.className = "news-card__body";

    const meta = document.createElement("div");
    meta.className = "news-card__meta";
    meta.appendChild(textNode("span", "news-card__source", language === "en" ? "News" : "Новости"));
    const details = [safeDate(item.date), item.views ? \`◉ \${item.views}\` : ""].filter(Boolean);
    meta.appendChild(textNode("span", "", details.join(" · ")));
    body.appendChild(meta);

    const rawText = String(item.text || "").trim();
    const lines = rawText.split(/\\n+/).map(line => line.trim()).filter(Boolean);
    const firstLine = lines[0] || "";
    const hasHeadline = firstLine.length >= 8 && firstLine.length <= 150 && lines.length > 1;
    if (hasHeadline) body.appendChild(textNode("h2", "news-card__title", firstLine));

    const readableText = hasHeadline ? lines.slice(1).join("\\n\\n") : rawText;
    const copy = textNode("p", "news-card__text", readableText);
    copy.id = \`news-copy-\${String(item.postId || Math.random()).replace(/[^a-z0-9_-]/gi, "-")}\`;
    body.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "news-card__actions";

    if (readableText.length > 420) {
      const expand = textNode("button", "news-card__expand", language === "en" ? "Read full article" : "Читать полностью");
      expand.type = "button";
      expand.setAttribute("aria-expanded", "false");
      expand.setAttribute("aria-controls", copy.id);
      expand.addEventListener("click", () => {
        const expanded = article.classList.toggle("is-expanded");
        expand.setAttribute("aria-expanded", String(expanded));
        expand.textContent = expanded
          ? (language === "en" ? "Collapse" : "Свернуть")
          : (language === "en" ? "Read full article" : "Читать полностью");
      });
      actions.appendChild(expand);
    }

    if (item.url) {
      const link = document.createElement("a");
      link.className = "news-card__link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.appendChild(document.createTextNode(language === "en" ? "Original on Telegram" : "Оригинал в Telegram"));
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      link.appendChild(arrow);
      actions.appendChild(link);
    }
    body.appendChild(actions);

    article.appendChild(body);
    return article;
  }

  function render(`,
);
writeAtomic(newsJsPath, newsJs);

let newsPage = fs.readFileSync(newsPagePath, "utf8");
newsPage = newsPage.replace(
  "Обновления сервиса, новые тарифы и важные объявления.",
  "Главное о сервисе, тарифах и технологиях — полностью и понятным языком прямо на сайте.",
);
newsPage = newsPage.replace("Открыть Telegram", "Наш Telegram");
newsPage = newsPage.replace(
  /\/assets\/js\/news-hub\.js(?:\?[^"']*)?/g,
  "/assets/js/news-hub.js?v=20260912-readable1",
);
if (!newsPage.includes("/assets/css/news-readable-v1.css")) {
  newsPage = newsPage.replace(
    "</head>",
    '  <link rel="stylesheet" href="/assets/css/news-readable-v1.css?v=20260912-1">\n</head>',
  );
} else {
  newsPage = newsPage.replace(
    /\/assets\/css\/news-readable-v1\.css(?:\?[^"']*)?/g,
    "/assets/css/news-readable-v1.css?v=20260912-1",
  );
}
writeAtomic(newsPagePath, newsPage);

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
