const fs = require("fs");
const path = require("path");
const { fetchTelegramPublicFeed } = require("./telegram-public-feed");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "public-news.json");
const CHANNEL_RAW = String(process.env.TELEGRAM_NEWS_CHANNEL || "aimarket_gpt").trim();
const CHANNEL = /^[a-zA-Z0-9_]{5,64}$/.test(CHANNEL_RAW) ? CHANNEL_RAW : "aimarket_gpt";
const LIMIT = Math.max(1, Math.min(30, Number(process.env.TELEGRAM_NEWS_LIMIT || 24)));

async function main() {
  const payload = await fetchTelegramPublicFeed(CHANNEL, {
    timeoutMs: Number(process.env.TELEGRAM_NEWS_FETCH_TIMEOUT_MS || 12000),
  });
  payload.items = payload.items.slice(0, LIMIT);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, OUTPUT_PATH);

  process.stdout.write(
    `Saved ${payload.items.length} Telegram posts to ${path.relative(ROOT, OUTPUT_PATH)}\n`
  );
}

main().catch(error => {
  process.stderr.write(`Unable to refresh Telegram news: ${error.message}\n`);
  process.exitCode = 1;
});
