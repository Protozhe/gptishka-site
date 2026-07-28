const fs = require("fs");
const path = require("path");
const { fetchTelegramPublicFeed } = require("./telegram-public-feed");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "public-news.json");
const MEDIA_DIR = path.join(ROOT, "assets", "img", "news");
const CHANNEL_RAW = String(process.env.TELEGRAM_NEWS_CHANNEL || "aimarket_gpt").trim();
const CHANNEL = /^[a-zA-Z0-9_]{5,64}$/.test(CHANNEL_RAW) ? CHANNEL_RAW : "aimarket_gpt";
const LIMIT = Math.max(1, Math.min(30, Number(process.env.TELEGRAM_NEWS_LIMIT || 24)));
const MEDIA_EXTENSION_BY_TYPE = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

async function cacheMedia(item) {
  if (!item.imageUrl || !Number(item.postId)) return false;

  const response = await fetch(item.imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 GPTishkaNews/1.0",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`media for post ${item.postId}: HTTP ${response.status}`);

  const contentType = String(response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const extension = MEDIA_EXTENSION_BY_TYPE.get(contentType);
  if (!extension) throw new Error(`media for post ${item.postId}: unsupported ${contentType}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw new Error(`media for post ${item.postId}: invalid size ${buffer.length}`);
  }

  const fileName = `${CHANNEL}-${item.postId}.${extension}`;
  const outputPath = path.join(MEDIA_DIR, fileName);
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, buffer);
  fs.renameSync(temporaryPath, outputPath);
  item.imageUrl = `/assets/img/news/${fileName}`;
  return true;
}

async function main() {
  const payload = await fetchTelegramPublicFeed(CHANNEL, {
    timeoutMs: Number(process.env.TELEGRAM_NEWS_FETCH_TIMEOUT_MS || 12000),
  });
  payload.items = payload.items.slice(0, LIMIT);

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const mediaResults = await Promise.allSettled(payload.items.map(cacheMedia));
  const savedMedia = mediaResults.filter(result => result.status === "fulfilled" && result.value).length;
  for (const result of mediaResults) {
    if (result.status === "rejected") {
      process.stderr.write(`WARN: ${result.reason?.message || result.reason}\n`);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, OUTPUT_PATH);

  process.stdout.write(
    `Saved ${payload.items.length} Telegram posts and ${savedMedia} media files\n`
  );
}

main().catch(error => {
  process.stderr.write(`Unable to refresh Telegram news: ${error.message}\n`);
  process.exitCode = 1;
});
