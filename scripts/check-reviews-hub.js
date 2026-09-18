"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const html = read(path.join("app", "index.html"));
const css = read(path.join("assets", "css", "reviews-hub.css"));
const client = read(path.join("assets", "js", "reviews-hub.js"));
const refresh = read(path.join("scripts", "refresh-public-reviews.js"));
const server = read("server.js");
const data = JSON.parse(read(path.join("data", "public-reviews.json")));

assert.match(html, /<body class="reviews-hub-body">/);
assert.match(html, /href="\/app\/" aria-current="page">Отзывы<\/a>/);
assert.match(html, /id="reviewsSources"/);
assert.match(html, /отзывов на всех площадках/);
assert.doesNotMatch(html, /отзывов в источниках/);
assert.doesNotMatch(html, /последняя проверка/);
assert.doesNotMatch(html, /id="reviewsUpdated"/);
assert.match(client, /elements\.total\.textContent = "2000\+"/);
assert.match(client, /item\.sourceType !== "playerok"/);
assert.doesNotMatch(client, /function prepareReviewDates/);
assert.match(client, /item\.dateLabel \|\| "Дата не указана площадкой"/);
assert.match(client, /function rankReviews/);
assert.match(client, /item\.sourceType === "site" \|\| item\.sourceType === "playerok"/);
assert.match(client, /if \(isSitePresentedReview\(item\)\) return "Отзыв на сайте"/);
assert.doesNotMatch(client, /return "Отзыв оставлен на сайте"/);
assert.match(html, /reviews-hub\.js\?v=20260918-source-dates1/);
assert.match(refresh, /sourceLabel: "Отзыв покупателя",[\s\S]{0,100}sourceHidden: true/);
assert.match(refresh, /rating: Number\(node\?\.rating\) \|\| 5,[\s\S]{0,100}url: ""/);
assert.match(server, /fetchedAt: payload\.fetchedAt/);
assert.doesNotMatch(server, /fetchedAt: activationItems\[0\]\?\.date/);
assert.doesNotMatch(server, /fetchedAt: telegramMergedPayload\.fetchedAt/);
assert.match(server, /IS_PRODUCTION[\s\S]*?\/var\/lib\/gptishka-runtime\/public-reviews\.json/);
assert.match(refresh, /IS_PRODUCTION[\s\S]*?\/var\/lib\/gptishka-runtime\/public-reviews\.json/);
assert.match(html, /id="reviewsGrid"/);
assert.match(html, /assets\/js\/reviews-hub\.js/);
assert.ok(html.indexOf('class="reviews-feed"') < html.indexOf('class="reviews-sources"'));
assert.ok(html.indexOf('class="reviews-sources"') < html.indexOf('class="reviews-hero reviews-hero--summary"'));
assert.doesNotMatch(html, /Отзывы без редактирования/);
assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(280px,\s*1fr\)\)/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(client, /textContent\s*=/);
assert.match(client, /fetch\("\/api\/public\/reviews/);
assert.match(client, /Бот подключён, ожидает новые отзывы/);
assert.doesNotMatch(client, /\.innerHTML\s*=/);
assert.match(server, /app\.get\("\/api\/public\/reviews"/);
assert.match(server, /app\.post\("\/api\/reviews\/telegram\/webhook"/);
assert.match(server, /mergeRuntimeReviews/);
assert.match(server, /createTelegramReviewsPoller/);
assert.match(server, /startPublicReviewsRefreshSchedule/);
assert.match(server, /refresh-public-reviews\.js/);
assert.match(refresh, /cached\.items\.map/);
assert.doesNotMatch(refresh, /sourceLabel: "Проверенный отзыв"/);
assert.match(server, /app\.get\(\["\/app", "\/app\/"\], sendDirectoryIndex\("app"\)\)/);

assert.strictEqual(data.version, 1);
assert.strictEqual(data.refreshIntervalHours, 8);
assert.ok(data.totalReviews >= 121);
assert.ok(data.items.length >= 20);
assert.ok(data.sources.some(source => source.id === "funpay-19372031" && source.status === "ok"));
assert.ok(data.sources.some(source => source.id === "funpay-162964" && source.status === "ok"));
assert.ok(data.sources.some(source => source.id === "funpay-162964" && source.hidden === true));
assert.ok(data.sources.some(source => source.id === "telegram-otziviaii"));
assert.ok(
  data.sources.some(
    source =>
      source.id === "playerok-vivaseller" &&
      ["ok", "stale"].includes(source.status) &&
      source.total >= 3 &&
      source.visibleItems >= 2 &&
      source.visibleItems <= source.total
  )
);
assert.ok(data.items.some(item => item.sourceId === "playerok-vivaseller" && item.text));
assert.ok(
  data.sources.some(
    source =>
      source.id === "playerok-vivaseller" &&
      source.hidden === true &&
      source.label === "Публичные отзывы"
  )
);
assert.ok(
  data.items
    .filter(item => item.sourceId === "playerok-vivaseller")
    .every(
      item =>
        ["Проверенный отзыв", "Отзыв покупателя"].includes(item.sourceLabel) &&
        !/playerok/i.test(String(item.detail || ""))
    )
);
assert.ok(data.items.every(item => item.id && item.text));
assert.ok(
  !data.items.some(
    item =>
      item.text === "Все честно и быстро)" &&
      String(item.detail || "").startsWith("ArcheAge (RU), 700")
  )
);
assert.ok(
  data.items
    .filter(item => item.sourceId === "funpay-162964")
    .every(item => item.sourceHidden === true && item.sourceLabel === "Покупатель" && !item.url)
);
assert.strictEqual(new Set(data.items.map(item => item.id)).size, data.items.length);
assert.doesNotMatch(JSON.stringify(data), /Adelka999/);
assert.doesNotMatch(JSON.stringify(data), /Отзывы GPTishka/);
assert.doesNotMatch(read(path.join("server", "telegram-reviews-store.js")), /Отзывы GPTishka/);

console.log(
  `[reviews-check] ${data.items.length} visible reviews, ${data.totalReviews} total, ` +
    `${data.sources.length} sources`
);
