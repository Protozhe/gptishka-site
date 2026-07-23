"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const html = read(path.join("app", "index.html"));
const css = read(path.join("assets", "css", "reviews-hub.css"));
const client = read(path.join("assets", "js", "reviews-hub.js"));
const server = read("server.js");
const data = JSON.parse(read(path.join("data", "public-reviews.json")));

assert.match(html, /<body class="reviews-hub-body">/);
assert.match(html, /href="\/app\/" aria-current="page">Отзывы<\/a>/);
assert.match(html, /id="reviewsSources"/);
assert.match(html, /id="reviewsGrid"/);
assert.match(html, /assets\/js\/reviews-hub\.js/);
assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(client, /textContent\s*=/);
assert.doesNotMatch(client, /\.innerHTML\s*=/);
assert.match(server, /app\.get\(\["\/app", "\/app\/"\], sendDirectoryIndex\("app"\)\)/);

assert.strictEqual(data.version, 1);
assert.strictEqual(data.refreshIntervalHours, 8);
assert.ok(data.totalReviews >= 121);
assert.ok(data.items.length >= 20);
assert.ok(data.sources.some(source => source.id === "funpay-19372031" && source.status === "ok"));
assert.ok(data.sources.some(source => source.id === "funpay-162964" && source.status === "ok"));
assert.ok(data.sources.some(source => source.id === "telegram-otziviaii"));
assert.ok(data.items.every(item => item.id && item.text && item.url));
assert.strictEqual(new Set(data.items.map(item => item.id)).size, data.items.length);

console.log(
  `[reviews-check] ${data.items.length} visible reviews, ${data.totalReviews} total, ` +
    `${data.sources.length} sources`
);
