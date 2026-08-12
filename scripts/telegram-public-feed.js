const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 GPTishkaNews/1.0";

function decodeHtml(input) {
  return String(input || "")
    .replace(/&#(\d+);/g, (match, value) => {
      const code = Number.parseInt(value, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, value) => {
      const code = Number.parseInt(value, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function plainText(input) {
  return decodeHtml(
    String(input || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeTelegramMediaUrl(input) {
  const decoded = decodeHtml(String(input || "")).replace(/\\\//g, "/").trim();
  if (!/^https:\/\/(?:cdn\d*\.telegram-cdn\.org|cdn\d*\.telesco\.pe|telegram\.org)\//i.test(decoded)) {
    return "";
  }
  return decoded;
}

function stableId(...parts) {
  return crypto
    .createHash("sha1")
    .update(parts.map(String).join("|"))
    .digest("hex")
    .slice(0, 18);
}

function parseTelegramPublicFeed(html, channel) {
  const safeChannel = String(channel || "").trim();
  const content = String(html || "");
  const title =
    plainText(
      content.match(
        /<div class="tgme_channel_info_header_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      )?.[1] || ""
    ) || "GPTishka";
  const chunks = content
    .split(/<div class="tgme_widget_message_wrap[^"]*"/i)
    .slice(1);
  const items = [];

  for (const chunk of chunks) {
    const postPath = chunk.match(/data-post="([^"]+)"/i)?.[1] || "";
    const normalizedPath = decodeHtml(postPath).replace(/^@/, "");
    const postChannel = normalizedPath.split("/")[0] || "";
    if (postChannel.toLowerCase() !== safeChannel.toLowerCase()) continue;

    const postId = Number.parseInt(normalizedPath.split("/").pop(), 10) || 0;
    if (!postId) continue;

    const text = plainText(
      chunk.match(
        /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      )?.[1] || ""
    );
    const date = decodeHtml(chunk.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] || "");
    const views = plainText(
      chunk.match(/<span class="tgme_widget_message_views">([\s\S]*?)<\/span>/i)?.[1] ||
        ""
    );
    const photo =
      chunk.match(
        /class="tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i
      )?.[1] ||
      chunk.match(
        /class="tgme_widget_message_video_thumb"[^>]*style="[^"]*background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i
      )?.[1] ||
      chunk.match(/<video[^>]+poster="([^"]+)"/i)?.[1] ||
      "";
    const imageUrl = safeTelegramMediaUrl(photo);
    const hasVideo =
      /tgme_widget_message_video|<video\b|tgme_widget_message_roundvideo/i.test(chunk);

    if (!text && !imageUrl) continue;

    items.push({
      id: stableId(safeChannel, postId),
      postId,
      text,
      date,
      views,
      imageUrl,
      hasVideo,
      url: `https://t.me/${safeChannel}/${postId}`,
    });
  }

  items.sort((left, right) => Number(right.postId || 0) - Number(left.postId || 0));

  return {
    channel: safeChannel,
    channelUrl: `https://t.me/${safeChannel}`,
    title,
    fetchedAt: new Date().toISOString(),
    items,
  };
}

async function fetchTelegramPublicFeed(channel, options = {}) {
  const safeChannel = String(channel || "").trim();
  if (!/^[a-zA-Z0-9_]{5,64}$/.test(safeChannel)) {
    throw new Error("Invalid Telegram channel");
  }

  const timeoutMs = Math.max(1500, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://t.me/s/${safeChannel}`, {
      headers: {
        "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Telegram returned HTTP ${response.status}`);
    }

    const payload = parseTelegramPublicFeed(await response.text(), safeChannel);
    if (!payload.items.length) {
      throw new Error("Telegram public feed contains no readable posts");
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheTelegramFeedMedia(payload, options = {}) {
  const requestedImageDirectory = String(options.imageDirectory || "").trim();
  if (!requestedImageDirectory) return payload;

  const imageDirectory = path.resolve(requestedImageDirectory);
  const publicBasePath = String(options.publicBasePath || "/assets/img/news").replace(/\/$/, "");
  const timeoutMs = Math.max(1500, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const extensionByType = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ]);

  if (!items.some(item => item?.imageUrl)) return payload;
  await fs.promises.mkdir(imageDirectory, { recursive: true });
  const existingFiles = await fs.promises.readdir(imageDirectory);

  await Promise.all(items.map(async item => {
    const remoteUrl = safeTelegramMediaUrl(item?.imageUrl);
    const postId = Number.parseInt(String(item?.postId || ""), 10);
    if (!remoteUrl || !postId) return;

    const filenamePrefix = `${String(payload?.channel || "telegram").replace(/[^a-z0-9_-]/gi, "-")}-${postId}`;
    const existingName = existingFiles.find(name => name.startsWith(`${filenamePrefix}.`));
    if (existingName) {
      item.imageUrl = `${publicBasePath}/${existingName}`;
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(remoteUrl, {
        headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Telegram media returned HTTP ${response.status}`);

      const contentType = String(response.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const extension = extensionByType.get(contentType);
      if (!extension) throw new Error(`Unsupported Telegram media type: ${contentType || "unknown"}`);

      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
        throw new Error("Telegram media size is invalid");
      }

      const filename = `${filenamePrefix}.${extension}`;
      const destination = path.join(imageDirectory, filename);
      const temporary = `${destination}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporary, bytes);
      await fs.promises.rename(temporary, destination);
      item.imageUrl = `${publicBasePath}/${filename}`;
    } catch (_) {
      // Keep the current remote URL when Telegram media cannot be cached yet.
    } finally {
      clearTimeout(timeout);
    }
  }));

  return payload;
}

module.exports = {
  cacheTelegramFeedMedia,
  fetchTelegramPublicFeed,
  parseTelegramPublicFeed,
  plainText,
};
