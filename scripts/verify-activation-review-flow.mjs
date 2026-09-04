import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("redeem-start.html", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const routes = fs.readFileSync("apps/admin-backend/src/modules/orders/public-orders.routes.ts", "utf8");
const service = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const store = fs.readFileSync("apps/admin-backend/src/modules/orders/activation-reviews.store.ts", "utf8");

assert.match(page, /id="activationReviewStars"/);
assert.match(page, /id="activationReviewText"/);
assert.match(page, /id="updatesChannelBtn"[^>]+href="https:\/\/t\.me\/aimarket_gpt"/);
assert.match(page, /Новости GPTишка в Telegram/);
assert.match(page, /отзыв сразу появится на странице «Отзывы»/);
assert.match(page, /activation\/review/);
assert.match(page, /document\.body\.appendChild\(reviewRewardBox\)/);
assert.match(page, /function syncReceiptBotLink\(\)/);
assert.match(page, /\?start=receipt_\$\{encodeURIComponent\(safeToken\)\}/);
assert.match(page, /\^\[A-Za-z0-9_-\]\{16,56\}\$/);
assert.match(routes, /post\("\/orders\/:orderId\/activation\/review"/);
assert.match(routes, /get\("\/activation-reviews"/);
assert.match(service, /activationSucceeded/);
assert.match(service, /\["activation", "support", "support_claude"\]/);
assert.match(store, /activation-reviews\.json/);
assert.match(server, /gptishka-activation/);

console.log("Automatic activation review flow verified.");
