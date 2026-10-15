"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const { createTelegramReviewsPoller } = require("./telegram-reviews-poller");

test("Telegram polling tunnels through the configured HTTP proxy without direct fallback", async () => {
  const connections = [];
  const proxy = http.createServer();
  proxy.on("connect", (request, socket) => {
    connections.push(request.url);
    socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  let poller;
  let pollingErrors = 0;
  poller = createTelegramReviewsPoller({
    token: "test-token",
    proxyUrl: `http://127.0.0.1:${proxy.address().port}`,
    handleUpdate: async () => { throw new Error("Unexpected update"); },
    logger: { info() {}, error(message) {
      if (message.includes("Polling request failed")) {
        pollingErrors++;
        poller.stop();
      }
    } },
  });
  try {
    await poller.run();
    assert.equal(pollingErrors, 1);
    assert.equal(connections.length, 2);
    assert.ok(connections.every(destination => destination === "api.telegram.org:443"));
  } finally {
    poller.stop();
    await new Promise(resolve => proxy.close(resolve));
  }
});

test("Direct polling remains available when the proxy is explicitly disabled", async () => {
  let poller;
  const methods = [];
  poller = createTelegramReviewsPoller({
    token: "test-token",
    proxyUrl: "",
    logger: { info() {}, error() {} },
    handleUpdate: async () => {},
    fetchImpl: async (url, options) => {
      assert.equal(options.dispatcher, undefined);
      const method = url.split("/").pop();
      methods.push(method);
      if (method === "getUpdates") poller.stop();
      return { ok: true, json: async () => ({ ok: true, result: method === "getUpdates" ? [] : true }) };
    },
  });
  await poller.run();
  assert.deepEqual(methods, ["deleteWebhook", "getUpdates"]);
});
