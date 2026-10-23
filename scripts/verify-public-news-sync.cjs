const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync("scripts/telegram-public-feed.js", "utf8");
const post = (id, text, extraClass = "", channel = "aimarket_gpt") =>
  `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message ${extraClass}" data-post="${channel}/${id}"><div class="tgme_widget_message_text">${text}</div><time datetime="2026-10-19T02:55:33+00:00"></time></div></div>`;
const html = post(38, "Announcement") + post(40, "Results<br>Winners &amp; prizes") +
  post(41, "Channel pinned the results", "service_message") + post(42, "Unrelated", "", "another_channel");
const agents = [];
const calls = [];
const env = { TELEGRAM_NEWS_PROXY_URL: "http://127.0.0.1:18082" };
let mode = "feed";
class ProxyAgent {
  constructor(url) { this.url = url; this.destroyed = false; agents.push(this); }
  async destroy() { this.destroyed = true; }
}
const context = vm.createContext({
  module: { exports: {} }, process: { env }, Buffer, AbortController, setTimeout, clearTimeout,
  require(name) { return name === "undici" ? { ProxyAgent } : require(name); },
  async fetch(url, options) {
    calls.push({ url, options });
    if (mode === "network-error") throw new Error("network unavailable");
    if (mode === "http-error") return { ok: false, status: 503 };
    if (mode === "media") return {
      ok: true, headers: { get: () => "image/png" },
      arrayBuffer: async () => Buffer.from("fixture-image"),
    };
    return { ok: true, text: async () => mode === "empty" ? post(41, "Pinned", "service_message") : html };
  },
});
vm.runInContext(source, context);
const { fetchTelegramPublicFeed, cacheTelegramFeedMedia } = context.module.exports;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "gptishka-news-test-"));

(async () => {
  try {
    const feed = await fetchTelegramPublicFeed("aimarket_gpt");
    assert.deepEqual(Array.from(feed.items, x => x.postId), [40, 38], "Only channel articles should appear, newest first");
    assert.equal(feed.items[0].text, "Results\nWinners & prizes");
    assert.equal(calls.at(-1).url, "https://t.me/s/aimarket_gpt");
    assert.equal(calls.at(-1).options.dispatcher.url, env.TELEGRAM_NEWS_PROXY_URL);
    assert.equal(agents.at(-1).destroyed, true);
    assert.equal(calls.at(-1).options.signal.aborted, false);

    for (const failure of ["network-error", "http-error", "empty"]) {
      mode = failure;
      await assert.rejects(fetchTelegramPublicFeed("aimarket_gpt"));
      assert.equal(agents.at(-1).destroyed, true, "Failed refresh must release its transport");
    }
    mode = "feed";
    await fetchTelegramPublicFeed("aimarket_gpt", { proxyUrl: "" });
    assert.equal("dispatcher" in calls.at(-1).options, false, "Explicit direct mode must remain available");
    delete env.TELEGRAM_NEWS_PROXY_URL;
    env.TELEGRAM_PROXY_URL = "http://127.0.0.1:18083";
    await fetchTelegramPublicFeed("aimarket_gpt");
    assert.equal(calls.at(-1).options.dispatcher.url, env.TELEGRAM_PROXY_URL);
    delete env.TELEGRAM_PROXY_URL;
    await fetchTelegramPublicFeed("aimarket_gpt");
    assert.equal("dispatcher" in calls.at(-1).options, false, "Development must work without a proxy");

    env.TELEGRAM_NEWS_PROXY_URL = "http://127.0.0.1:18082";
    mode = "media";
    const remote = "https://cdn1.telegram-cdn.org/fixture.jpg";
    const media = { channel: "aimarket_gpt", items: [{ postId: 40, imageUrl: remote }] };
    await cacheTelegramFeedMedia(media, { imageDirectory: temporary, publicBasePath: "/news-media" });
    assert.equal(calls.at(-1).options.dispatcher.url, env.TELEGRAM_NEWS_PROXY_URL, "Images must use the same working route as text");
    assert.equal(media.items[0].imageUrl, "/news-media/aimarket_gpt-40.png");
    assert.equal(fs.readFileSync(path.join(temporary, "aimarket_gpt-40.png"), "utf8"), "fixture-image");
    assert.equal(agents.at(-1).destroyed, true);
    const count = calls.length;
    const reused = { channel: "aimarket_gpt", items: [{ postId: 40, imageUrl: remote }, {postId: 43, imageUrl: "https://untrusted.example/image.png"}] };
    await cacheTelegramFeedMedia(reused, { imageDirectory: temporary, publicBasePath: "/news-media" });
    assert.equal(calls.length, count, "Cached media must be reused and foreign media hosts ignored");
    assert.equal(reused.items[0].imageUrl, media.items[0].imageUrl);
    mode = "network-error";
    const failedMedia = { channel: "aimarket_gpt", items: [{ postId: 44, imageUrl: remote }] };
    await cacheTelegramFeedMedia(failedMedia, { imageDirectory: temporary });
    assert.equal(failedMedia.items[0].imageUrl, remote, "A media outage must preserve the original article image URL");
    assert.equal(agents.at(-1).destroyed, true);
    await assert.rejects(fetchTelegramPublicFeed("invalid/channel"), /Invalid Telegram channel/);

    const production = { module: { exports: {} }, process: { env: {} } };
    vm.runInNewContext(fs.readFileSync("ecosystem.config.js", "utf8"), production);
    assert.equal(production.module.exports.apps.find(x => x.name === "gptishka-storefront").env.TELEGRAM_NEWS_PROXY_URL,
      "http://127.0.0.1:18082");
    console.log("Public news uses the configured route for text and images, preserves cached content on errors, and excludes service events.");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
