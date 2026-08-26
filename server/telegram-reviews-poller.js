"use strict";

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 3000;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createTelegramReviewsPoller(options = {}) {
  const token = String(options.token || "").trim();
  const handleUpdate = options.handleUpdate;
  const fetchImpl = options.fetchImpl || global.fetch;
  const logger = options.logger || console;
  let stopped = false;
  let activeController = null;
  let offset = 0;

  if (!token) throw new Error("Telegram reviews bot token is required");
  if (typeof handleUpdate !== "function") throw new Error("Telegram reviews update handler is required");
  if (typeof fetchImpl !== "function") throw new Error("Fetch implementation is required");

  async function call(method, body) {
    activeController = new AbortController();
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: activeController.signal,
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) {
        throw new Error(`Telegram ${method} failed: ${payload?.description || response.status}`);
      }
      return payload.result;
    } finally {
      activeController = null;
    }
  }

  async function run() {
    try {
      await call("deleteWebhook", { drop_pending_updates: false });
      logger.info?.("[telegram-reviews] Polling enabled; pending updates preserved");
    } catch (error) {
      logger.error?.("[telegram-reviews] Could not disable webhook before polling", error);
    }

    while (!stopped) {
      try {
        const updates = await call("getUpdates", {
          offset,
          limit: 100,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"],
        });
        for (const update of Array.isArray(updates) ? updates : []) {
          if (stopped) break;
          await handleUpdate(update);
          offset = Math.max(offset, Number(update?.update_id || 0) + 1);
        }
      } catch (error) {
        if (stopped || error?.name === "AbortError") break;
        logger.error?.("[telegram-reviews] Polling request failed", error);
        await wait(RETRY_DELAY_MS);
      }
    }
  }

  return {
    run,
    stop() {
      stopped = true;
      activeController?.abort();
    },
  };
}

module.exports = { createTelegramReviewsPoller };
