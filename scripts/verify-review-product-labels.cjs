const assert = require("node:assert/strict");
const { reviewProductLabel: label } = require("../server/review-product-labels");
assert.equal(label("🧠 CODEX POINTS 💎 250 КРЕДИТОВ"), "Codex — 250 кредитов");
assert.equal(label("CODEX POINTS 500 КРЕДИТОВ/КРЕДИТЫ"), "Codex — 500 кредитов");
assert.equal(label("Верификация аккаунта Claude"), "Верификация Claude");
assert.equal(label("Claude KYC verification"), "Верификация Claude — KYC");
assert.equal(label("ChatGPT, 2000 ₽"), "Подписка ChatGPT");
assert.equal(label("ChatGPT, 20000 ₽"), "Подписка ChatGPT");
assert.equal(label("ChatGPT, 200 ₽"), "Подписка ChatGPT");
assert.equal(label("ChatGPT Plus - 1 месяц"), "ChatGPT Plus — 1 месяц");
assert.equal(label("ChatGPT Pro 20x"), "ChatGPT Pro 20x");
assert.equal(label("Цифровая подписка"), "Цифровая подписка");
assert.equal(label("Отзыв из Telegram"), "Отзыв из Telegram");
console.log("Review product names use explicit source evidence; prices never imply plans.");

const { presentReview } = require("../server/review-product-labels");
const advert = "🧠 📱【CHATGPT PLUS】📱 🧠 🔒 ГОТОВЫЙ ИЛИ ВАШ АККАУНТ 🔒 ✅ 30 ДНЕЙ ✅ 🛡️ АВТОПОДКЛЮЧЕНИЕ";
const legacy = { id: "legacy", text: advert, detail: "Подписка ChatGPT", rating: 5, displayDate: "2026-10-13", author: "Покупатель" };
assert.deepEqual(presentReview(legacy), { ...legacy, text: "", detail: "ChatGPT Plus" });
assert.equal(legacy.text, advert, "stored data must not be mutated");
for (const text of ["Всё отлично! ChatGPT Plus работает", advert + " Подключили быстро, спасибо!", "Не удалось подключить подписку", "", "★★★★★"]) {
  const review = { text, rating: 3 };
  assert.equal(presentReview(review), review, "real comments and rating-only reviews remain unchanged");
}
assert.deepEqual(presentReview(presentReview(legacy)), presentReview(legacy));
console.log("Legacy advert-only text is presented as a rating without inventing customer feedback.");
