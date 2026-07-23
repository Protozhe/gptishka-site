"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "public-reviews.json");
const FETCH_TIMEOUT_MS = Math.max(3000, Number(process.env.REVIEWS_FETCH_TIMEOUT_MS || 15000));
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 GPTishkaReviews/1.0";

const SOURCES = [
  {
    id: "funpay-19372031",
    type: "funpay",
    profileId: "19372031",
    label: "Reznikshop",
    url: "https://funpay.com/users/19372031/#reviews",
  },
  {
    id: "funpay-162964",
    type: "funpay",
    profileId: "162964",
    label: "Adelka999",
    url: "https://funpay.com/users/162964/#reviews",
  },
  {
    id: "telegram-otziviaii",
    type: "telegram",
    channel: "otziviaii",
    label: "Отзывы GPTishka",
    url: "https://t.me/otziviaii",
  },
];

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
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stableId(...parts) {
  return crypto.createHash("sha1").update(parts.map(String).join("|")).digest("hex").slice(0, 18);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseFunPayRating(html, reviewRatings) {
  const direct = String(html).match(/rating-value[\s\S]*?<span class="big">\s*([0-5](?:[.,]\d+)?)\s*<\/span>/i);
  if (direct && direct[1] !== "?") {
    return Number.parseFloat(direct[1].replace(",", "."));
  }
  if (reviewRatings.length) {
    return reviewRatings.reduce((sum, value) => sum + value, 0) / reviewRatings.length;
  }
  return null;
}

function parseFunPayProfile(html, source) {
  const content = String(html || "");
  const profileNameRaw = plainText(content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const profileName = profileNameRaw.replace(/\s+Онлайн\s*$/i, "").trim() || source.label;
  const totalRaw = content.match(/Всего\s*([\d\s]+)<br>/i)?.[1] || "0";
  const total = Number.parseInt(totalRaw.replace(/\s+/g, ""), 10) || 0;
  const chunks = content.split(/<div class="review-container">/i).slice(1);
  const items = [];
  const reviewRatings = [];

  for (const chunk of chunks) {
    const text = plainText(chunk.match(/<div class="review-item-text">([\s\S]*?)<\/div>/i)?.[1] || "");
    if (!text) continue;
    const dateLabel = plainText(chunk.match(/<div class="review-item-date">([\s\S]*?)<\/div>/i)?.[1] || "");
    const detail = plainText(chunk.match(/<div class="review-item-detail">([\s\S]*?)<\/div>/i)?.[1] || "");
    const ratingRaw = chunk.match(/class="rating([1-5])"/i)?.[1] || "";
    const rating = Number.parseInt(ratingRaw, 10) || 5;
    reviewRatings.push(rating);
    items.push({
      id: stableId(source.id, text, detail, dateLabel),
      sourceId: source.id,
      sourceType: source.type,
      sourceLabel: profileName,
      author: "Покупатель FunPay",
      text,
      detail,
      date: "",
      dateLabel: dateLabel || "Публичный отзыв",
      rating,
      url: source.url,
    });
  }

  return {
    source: {
      ...source,
      label: profileName,
      total,
      rating: parseFunPayRating(content, reviewRatings),
      available: true,
      status: "ok",
      visibleItems: items.length,
    },
    items,
  };
}

function parseTelegramPublicFeed(html, source) {
  const content = String(html || "");
  const title = plainText(content.match(/<div class="tgme_channel_info_header_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const chunks = content.split(/<div class="tgme_widget_message_wrap[^"]*"/i).slice(1);
  const items = [];

  for (const chunk of chunks) {
    const postPath = chunk.match(/data-post="([^"]+)"/i)?.[1] || "";
    const text = plainText(chunk.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    if (!postPath || !text) continue;
    const date = chunk.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] || "";
    const postId = Number.parseInt(postPath.split("/").pop(), 10) || 0;
    items.push({
      id: stableId(source.id, postPath, text),
      sourceId: source.id,
      sourceType: source.type,
      sourceLabel: title || source.label,
      author: title || "Telegram",
      text,
      detail: "Отзыв из Telegram",
      date,
      dateLabel: date ? "" : "Публичный пост",
      rating: 5,
      url: `https://t.me/${postPath}`,
      sortOrder: postId,
    });
  }

  items.sort((a, b) => Number(b.sortOrder || 0) - Number(a.sortOrder || 0));
  return {
    source: {
      ...source,
      label: title || source.label,
      total: items.length,
      rating: items.length ? 5 : null,
      available: items.length > 0,
      status: items.length ? "ok" : "feed-not-public",
      visibleItems: items.length,
    },
    items,
  };
}

function loadPrevious() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  } catch (_) {
    return { sources: [], items: [] };
  }
}

function previousForSource(previous, sourceId) {
  return {
    source: Array.isArray(previous?.sources)
      ? previous.sources.find(item => item?.id === sourceId)
      : null,
    items: Array.isArray(previous?.items)
      ? previous.items.filter(item => item?.sourceId === sourceId)
      : [],
  };
}

async function collectSource(source, previous) {
  try {
    if (source.type === "funpay") {
      const html = await fetchText(`https://funpay.com/users/${source.profileId}/`);
      return parseFunPayProfile(html, source);
    }
    if (source.type === "telegram") {
      const html = await fetchText(`https://t.me/s/${source.channel}`);
      return parseTelegramPublicFeed(html, source);
    }
    throw new Error(`Unsupported source type: ${source.type}`);
  } catch (error) {
    const cached = previousForSource(previous, source.id);
    return {
      source: {
        ...source,
        ...(cached.source || {}),
        available: cached.items.length > 0,
        status: cached.items.length ? "stale" : "unavailable",
        error: String(error?.message || error),
      },
      items: cached.items,
    };
  }
}

function deduplicate(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = plainText(item?.text).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const previous = loadPrevious();
  const results = [];

  for (const source of SOURCES) {
    // Keep the requests sequential and light: these are public pages, not APIs.
    // eslint-disable-next-line no-await-in-loop
    results.push(await collectSource(source, previous));
  }

  const sources = results.map(result => result.source);
  const items = deduplicate(results.flatMap(result => result.items)).slice(0, 60);
  const payload = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    refreshIntervalHours: 8,
    totalReviews: sources
      .filter(source => source.type === "funpay")
      .reduce((sum, source) => sum + Number(source.total || 0), 0),
    sources,
    items,
  };

  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, OUTPUT_PATH);
  console.log(
    `[reviews] ${payload.fetchedAt}: ${items.length} public items, ` +
      `${payload.totalReviews} source reviews total`
  );
}

main().catch(error => {
  console.error("[reviews] refresh failed", error);
  process.exitCode = 1;
});
