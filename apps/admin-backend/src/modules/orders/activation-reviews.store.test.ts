import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("new activation reviews stay hidden until an administrator approves them", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "gptishka-review-moderation-"));
  process.env.GPTISHKA_RUNTIME_DIR = runtimeDir;
  process.env.TELEGRAM_BOT_TOKEN = "test-review-moderation-token";
  process.env.APP_URL = "http://127.0.0.1:4000";
  process.env.ADMIN_UI_URL = "http://127.0.0.1:5173";
  process.env.DATABASE_URL = "file:./test.db";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-long-enough";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-long-enough";

  const { activationReviewsStore } = await import("./activation-reviews.store");
  const { buildActivationReviewModerationCallback, parseActivationReviewModerationCallback } = await import(
    "./activation-review-moderation"
  );

  const created = await activationReviewsStore.upsert({
    orderId: "order-review-test",
    productTitle: "ChatGPT Plus",
    rating: 5,
    text: "Всё подключили быстро",
  });
  assert.equal(created.moderationStatus, "pending");
  assert.equal(created.isNew, true);
  assert.deepEqual(await activationReviewsStore.listPublic(), []);

  const callback = buildActivationReviewModerationCallback(created.publicId, "approved");
  assert.deepEqual(parseActivationReviewModerationCallback(callback), {
    publicId: created.publicId,
    decision: "approved",
  });
  const replacement = callback.endsWith("0") ? "1" : "0";
  assert.equal(parseActivationReviewModerationCallback(`${callback.slice(0, -1)}${replacement}`), null);

  const approved = await activationReviewsStore.moderate(created.publicId, "approved", "admin-test");
  assert.equal(approved?.changed, true);
  assert.equal(approved?.review.moderationStatus, "approved");
  assert.equal((await activationReviewsStore.listPublic()).length, 1);

  const repeated = await activationReviewsStore.moderate(created.publicId, "rejected", "admin-test");
  assert.equal(repeated?.changed, false);
  assert.equal(repeated?.review.moderationStatus, "approved");

  fs.rmSync(runtimeDir, { recursive: true, force: true });
});
