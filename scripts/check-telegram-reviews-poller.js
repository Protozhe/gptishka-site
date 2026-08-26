"use strict";

const assert = require("assert");
const { createTelegramReviewsPoller } = require("../server/telegram-reviews-poller");

async function main() {
  const calls = [];
  const handled = [];
  let poller;
  const fetchImpl = async (url, request) => {
    const method = String(url).split("/").pop();
    const body = JSON.parse(request.body);
    calls.push({ method, body });
    if (method === "deleteWebhook") {
      return { ok: true, json: async () => ({ ok: true, result: true }) };
    }
    const result = calls.filter(call => call.method === "getUpdates").length === 1
      ? [{ update_id: 10, message: { message_id: 1 } }]
      : [];
    if (!result.length) poller.stop();
    return { ok: true, json: async () => ({ ok: true, result }) };
  };

  poller = createTelegramReviewsPoller({
    token: "test-token",
    fetchImpl,
    logger: { info() {}, error() {} },
    handleUpdate: async update => handled.push(update.update_id),
  });
  await poller.run();

  assert.strictEqual(calls[0].method, "deleteWebhook");
  assert.strictEqual(calls[0].body.drop_pending_updates, false);
  assert.deepStrictEqual(handled, [10]);
  assert.strictEqual(calls[2].body.offset, 11);
  console.log("[telegram-reviews-poller-check] ok");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
