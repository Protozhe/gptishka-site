"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  extractTelegramReview,
  mergeRuntimeReviews,
  readRuntimeReviews,
  upsertRuntimeReview,
} = require("../server/telegram-reviews-store");

async function main() {
  const update = {
    message: {
      message_id: 42,
      date: 1787688000,
      chat: { id: -100123, type: "supergroup", username: "otziviaii" },
      from: { first_name: "Иван", last_name: "Иванов" },
      text: "Всё отлично!",
    },
  };
  const review = extractTelegramReview(update, { groupUsername: "@otziviaii" });
  assert.ok(review);
  assert.strictEqual(review.author, "Иван И.");
  assert.strictEqual(review.url, "https://t.me/otziviaii/42");
  assert.strictEqual(extractTelegramReview(update, { groupUsername: "another_group" }), null);
  assert.strictEqual(
    extractTelegramReview(
      { message: { ...update.message, text: "/start@gptishkamyadminiibot reviews" } },
      { groupUsername: "otziviaii" }
    ),
    null
  );

  const temporaryDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gptishka-reviews-"));
  const runtimePath = path.join(temporaryDir, "telegram-reviews.json");
  await upsertRuntimeReview(runtimePath, review);
  await upsertRuntimeReview(runtimePath, { ...review, text: "Обновлённый отзыв" });
  await upsertRuntimeReview(runtimePath, { ...review, id: "duplicate-id", text: "Обновлённый отзыв" });
  const stored = await readRuntimeReviews(runtimePath);
  assert.strictEqual(stored.items.length, 1);
  assert.strictEqual(stored.items[0].id, "duplicate-id");
  assert.strictEqual(stored.items[0].text, "Обновлённый отзыв");

  const merged = mergeRuntimeReviews(
    {
      totalReviews: 10,
      sources: [{ id: "telegram-otziviaii", type: "telegram", total: 0 }],
      items: [{ id: "funpay-1", sourceId: "funpay", text: "Отзыв FunPay" }],
    },
    stored,
    { groupUsername: "otziviaii" }
  );
  assert.strictEqual(merged.totalReviews, 11);
  assert.strictEqual(merged.sources[0].status, "ok");
  assert.strictEqual(merged.items[0].text, "Обновлённый отзыв");

  await fs.promises.rm(temporaryDir, { recursive: true, force: true });
  console.log("[telegram-reviews-store-check] ok");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

