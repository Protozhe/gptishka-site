const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const PORT = Number(process.env.PORT || 4000);
const HOST = String(process.env.HOST || process.env.BIND_HOST || "127.0.0.1").trim() || "127.0.0.1";
const ONLINE_TTL_SECONDS = Number(process.env.ONLINE_TTL_SECONDS || 45);
const ONLINE_TTL_MS = ONLINE_TTL_SECONDS * 1000;
const ADMIN_BACKEND_URL = String(process.env.ADMIN_BACKEND_URL || "http://localhost:4100").replace(/\/$/, "");
const ADMIN_BACKEND_FALLBACK_URLS = String(
  process.env.ADMIN_BACKEND_FALLBACK_URLS || "http://127.0.0.1:4100,http://localhost:4100"
)
  .split(",")
  .map(value => String(value || "").trim().replace(/\/$/, ""))
  .filter(Boolean);
const ADMIN_BACKEND_URLS = [...new Set([ADMIN_BACKEND_URL, ...ADMIN_BACKEND_FALLBACK_URLS])];
const ENABLE_SYSTEM_ACTIVATIONS =
  String(process.env.ENABLE_SYSTEM_ACTIVATIONS || "false").toLowerCase() === "true";
const SYSTEM_ACTIVATIONS_PER_DAY = Math.max(
  0,
  Number(process.env.SYSTEM_ACTIVATIONS_PER_DAY || 15)
);
const INCLUDE_LEGACY_PURCHASES =
  String(process.env.INCLUDE_LEGACY_PURCHASES || "false").toLowerCase() === "true";
const ALLOW_LEGACY_PURCHASE_EVENTS =
  String(process.env.ALLOW_LEGACY_PURCHASE_EVENTS || "false").toLowerCase() === "true";
const TICKER_EVENT_LIMIT = 12;
const SEED_DEMO_STATS = String(
  process.env.SEED_DEMO_STATS || "false"
).toLowerCase() === "true";
const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const STRICT_BACKEND_STATS = String(
  process.env.STRICT_BACKEND_STATS || (IS_PRODUCTION ? "true" : "false")
).toLowerCase() === "true";
const TELEGRAM_REVIEWS_CHANNEL_RAW = String(process.env.TELEGRAM_REVIEWS_CHANNEL || "otzivigptishkashop").trim();
const TELEGRAM_REVIEWS_CHANNEL = /^[a-zA-Z0-9_]{5,64}$/.test(TELEGRAM_REVIEWS_CHANNEL_RAW)
  ? TELEGRAM_REVIEWS_CHANNEL_RAW
  : "otzivigptishkashop";
const TELEGRAM_REVIEWS_CACHE_MS = Number(process.env.TELEGRAM_REVIEWS_CACHE_MS || 600000);
const TELEGRAM_REVIEWS_MAX_LIMIT = 30;
const TELEGRAM_REVIEWS_SCAN_MAX_ID = Number(process.env.TELEGRAM_REVIEWS_SCAN_MAX_ID || 600);
const TELEGRAM_REVIEWS_HINT_WINDOW = Number(process.env.TELEGRAM_REVIEWS_HINT_WINDOW || 30);
const TELEGRAM_REVIEWS_TOP_STEP = Number(process.env.TELEGRAM_REVIEWS_TOP_STEP || 20);
const TELEGRAM_REVIEWS_FETCH_TIMEOUT_MS = Number(process.env.TELEGRAM_REVIEWS_FETCH_TIMEOUT_MS || 2500);
const TELEGRAM_REVIEWS_REFRESH_TIMEOUT_MS = Number(process.env.TELEGRAM_REVIEWS_REFRESH_TIMEOUT_MS || 9000);
const STATS_CACHE_TTL_MS = Math.max(500, Number(process.env.STATS_CACHE_TTL_MS || 2200));
const HEARTBEAT_MIN_WRITE_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.HEARTBEAT_MIN_WRITE_INTERVAL_MS || 6000)
);
const TELEGRAM_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
const NOINDEX_PUBLIC_PATHS = new Set([
  "/cart.html",
  "/payment.html",
  "/success.html",
  "/fail.html",
  "/redeem-start.html",
  "/en/cart.html",
  "/en/payment.html",
  "/en/success.html",
  "/en/fail.html",
  "/en/redeem-start.html",
]);

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "stats.sqlite");
const LEGACY_PRODUCT_MODAL_BACKUP_PATH = path.join(__dirname, "_tmp_products_ru.json");

let telegramReviewsCache = {
  channel: TELEGRAM_REVIEWS_CHANNEL,
  fetchedAt: 0,
  latestPostId: 0,
  items: [],
};
let telegramReviewsRefreshPromise = null;
let legacyProductModalBackupMap = new Map();

function normalizeLegacyLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeLegacyMultiline(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function loadLegacyProductModalBackup() {
  const nextMap = new Map();

  if (!fs.existsSync(LEGACY_PRODUCT_MODAL_BACKUP_PATH)) {
    legacyProductModalBackupMap = nextMap;
    return;
  }

  try {
    const raw = fs.readFileSync(LEGACY_PRODUCT_MODAL_BACKUP_PATH, "utf-8");
    const payload = JSON.parse(String(raw || "").replace(/^\uFEFF/, ""));
    const items = Array.isArray(payload?.items) ? payload.items : [];
    items.forEach((item) => {
      const modalDescription = normalizeLegacyMultiline(item?.modalDescription);
      if (!modalDescription) return;
      const keys = [
        normalizeLegacyLookupKey(item?.id),
        normalizeLegacyLookupKey(item?.product),
        normalizeLegacyLookupKey(item?.slug),
        normalizeLegacyLookupKey(item?.title),
      ].filter(Boolean);
      keys.forEach((key) => nextMap.set(key, modalDescription));
    });
    legacyProductModalBackupMap = nextMap;
    if (nextMap.size) {
      logInfo(`Loaded legacy modal backup entries: ${nextMap.size}`);
    }
  } catch (error) {
    legacyProductModalBackupMap = new Map();
    logError("Failed to load legacy modal backup", error);
  }
}

function resolveLegacyModalDescription(item) {
  if (!item || !legacyProductModalBackupMap.size) return "";
  const keys = [
    normalizeLegacyLookupKey(item.id),
    normalizeLegacyLookupKey(item.product),
    normalizeLegacyLookupKey(item.slug),
    normalizeLegacyLookupKey(item.title),
  ].filter(Boolean);
  for (const key of keys) {
    const value = legacyProductModalBackupMap.get(key);
    if (value) return value;
  }
  return "";
}

function withLegacyModalFallback(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const items = Array.isArray(payload.items) ? payload.items : null;
  if (!items || !items.length || !legacyProductModalBackupMap.size) return payload;

  const nextItems = items.map((item) => {
    const fallbackModal = resolveLegacyModalDescription(item);
    if (!fallbackModal) return item;

    const currentModal = normalizeLegacyMultiline(item?.modalDescription);
    const shouldRestore = !currentModal;
    if (!shouldRestore) return item;

    return {
      ...item,
      modalDescription: fallbackModal,
    };
  });

  return {
    ...payload,
    items: nextItems,
  };
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

loadLegacyProductModalBackup();

let db;

function createDb() {
  return new sqlite3.Database(dbPath);
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function createSeededRandom(seedValue) {
  let state = 2166136261;
  for (const char of String(seedValue || "")) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function buildSystemEmail(dayKey, index) {
  const rng = createSeededRandom(`${dayKey}:${index}`);
  const names = [
    "alex",
    "maria",
    "roman",
    "anna",
    "nikita",
    "sofia",
    "pavel",
    "mila",
    "daniil",
    "liza",
    "sergey",
    "irina",
    "maksim",
    "alina",
    "egor",
  ];
  const suffixes = ["dev", "plus", "user", "pro", "vip", "acc", "buy", "tok"];
  const providers = ["gmail", "mail", "yandex", "outlook", "proton", "inbox"];
  const zones = ["ru", "com", "net", "org"];

  const name = names[Math.floor(rng() * names.length)];
  const suffix = suffixes[Math.floor(rng() * suffixes.length)];
  const number = String(100 + Math.floor(rng() * 900));
  const provider = providers[Math.floor(rng() * providers.length)];
  const zone = zones[Math.floor(rng() * zones.length)];
  return `${name}.${suffix}${number}@${provider}.${zone}`;
}

function maskEmail(email) {
  const safe = String(email || "").trim().toLowerCase();
  const atIndex = safe.indexOf("@");
  if (atIndex < 1) return "***@*****";

  const localRaw = safe.slice(0, atIndex).replace(/[^a-z0-9._+-]/gi, "");
  const local = localRaw || "user";
  const domainRaw = safe.slice(atIndex + 1);
  const domainParts = domainRaw.split(".").filter(Boolean);
  const topLevel = domainParts.length > 1 ? domainParts[domainParts.length - 1] : "";

  const visiblePrefixLimit = Math.min(
    local.length > 2 ? (Math.random() < 0.5 ? 1 : 2) : 1,
    Math.max(1, local.length - 1)
  );
  const visiblePrefix = local.slice(0, visiblePrefixLimit);
  const tailChar = local.slice(-1);
  const localMask = `${visiblePrefix}${"*".repeat(2 + Math.floor(Math.random() * 2))}${tailChar}`;
  const providerMaskLength = Math.max(5, Math.min(10, (domainParts[0] || "").length || 5));
  const providerMask = "*".repeat(providerMaskLength);
  return topLevel ? `${localMask}@${providerMask}.${topLevel}` : `${localMask}@${providerMask}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function logInfo(message) {
  process.stdout.write(`[storefront] ${message}\n`);
}

function logError(message, error) {
  const suffix = error && error.message ? `: ${error.message}` : "";
  process.stderr.write(`[storefront] ${message}${suffix}\n`);
}

async function fetchAdminWithFallback(targetPath, fetchOptions = {}, options = {}) {
  const safePath = String(targetPath || "").startsWith("/") ? String(targetPath || "") : `/${String(targetPath || "")}`;
  const retryStatuses = new Set(
    Array.isArray(options.retryStatuses) && options.retryStatuses.length
      ? options.retryStatuses
      : [502, 503, 504]
  );
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 12000));
  const candidates = ADMIN_BACKEND_URLS.length ? ADMIN_BACKEND_URLS : [ADMIN_BACKEND_URL];
  let lastResponse = null;
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    const isLastCandidate = index === candidates.length - 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${safePath}`, {
        ...fetchOptions,
        signal: controller.signal,
      });
      const shouldRetry = !isLastCandidate && retryStatuses.has(response.status);
      if (!shouldRetry) {
        return { response, baseUrl };
      }
      lastResponse = response;
    } catch (error) {
      lastError = error;
      if (isLastCandidate) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastResponse) {
    return { response: lastResponse, baseUrl: candidates[candidates.length - 1] };
  }

  throw lastError || new Error("Admin API unavailable");
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizeText(input) {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTelegramEmbedPost(html, channel, postId) {
  const content = String(html || "");
  const postPath = `${channel}/${postId}`;
  const exists = content.includes(`data-post="${postPath}"`) && !/tgme_widget_message_error/i.test(content);
  if (!exists) {
    return null;
  }

  const datetimeMatch = content.match(/<time[^>]+datetime="([^"]+)"/i);
  const textMatch = content.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const viewsMatch = content.match(/<span class="tgme_widget_message_views">([\s\S]*?)<\/span>/i);
  const authorMatch = content.match(/<span dir="auto">([^<]+)<\/span><\/a>&nbsp;in&nbsp;<a class="tgme_widget_message_owner_name"/i);
  const authorPhotoMatch = content.match(/<i class="tgme_widget_message_user_photo[^"]*"[^>]*>\s*<img src="([^"]+)"/i);
  const bubbleStart = content.indexOf('class="tgme_widget_message_bubble"');
  const bubbleContent = bubbleStart >= 0 ? content.slice(bubbleStart) : "";
  const mediaImageMatch =
    bubbleContent.match(/class="tgme_widget_message_(?!user_photo)[^"]*(?:photo|image|media|video)[^"]*"[\s\S]*?<img src="([^"]+)"/i) ||
    bubbleContent.match(/class="tgme_widget_message_(?!user_photo)[^"]*(?:photo|image|media|video)[^"]*"[^>]*style="[^"]*background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);

  const textRaw = textMatch ? textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "") : "";
  const text = normalizeText(decodeHtmlEntities(textRaw));
  const views = normalizeText(decodeHtmlEntities(viewsMatch ? viewsMatch[1].replace(/<[^>]*>/g, "") : ""));
  const author = normalizeText(decodeHtmlEntities(authorMatch ? authorMatch[1] : ""));
  const authorPhotoUrl = normalizeText(String(authorPhotoMatch ? authorPhotoMatch[1] : ""));
  const imageUrl = normalizeText(String(mediaImageMatch ? mediaImageMatch[1] : ""));

  return {
    id: postId,
    postId,
    url: `https://t.me/${postPath}`,
    date: datetimeMatch ? String(datetimeMatch[1]) : "",
    text,
    views,
    author: author || "Telegram",
    authorPhotoUrl,
    imageUrl,
  };
}

async function fetchTelegramEmbedPost(channel, postId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(800, TELEGRAM_REVIEWS_FETCH_TIMEOUT_MS));
  try {
    const response = await fetch(`https://t.me/${channel}/${postId}?embed=1`, {
      headers: TELEGRAM_FETCH_HEADERS,
      signal: controller.signal,
    });
    const html = await response.text();
    return parseTelegramEmbedPost(html, channel, postId);
  } finally {
    clearTimeout(timeout);
  }
}

async function findLatestTelegramPostId(channel, hint = 0, deadlineTs = 0) {
  const maxId = Math.max(1, TELEGRAM_REVIEWS_SCAN_MAX_ID);
  const safeHint = Number.isFinite(hint) ? Math.max(0, Math.min(maxId, hint)) : 0;
  const hintWindow = Math.max(10, TELEGRAM_REVIEWS_HINT_WINDOW);
  if (safeHint > 0) {
    const from = Math.min(maxId, safeHint + Math.floor(hintWindow / 2));
    const to = Math.max(1, safeHint - hintWindow);
    for (let postId = from; postId >= to; postId -= 1) {
      if (deadlineTs > 0 && Date.now() > deadlineTs) return 0;
      // eslint-disable-next-line no-await-in-loop
      const post = await fetchTelegramEmbedPost(channel, postId);
      if (post) return postId;
    }
  }

  const step = Math.max(5, TELEGRAM_REVIEWS_TOP_STEP);
  const offsets = [...new Set([0, Math.floor(step / 4), Math.floor(step / 2), Math.floor((step * 3) / 4)])]
    .map(value => Math.max(0, Math.min(step - 1, value)));
  let candidate = 0;

  for (const offset of offsets) {
    const startFrom = maxId - offset;
    for (let postId = startFrom; postId >= 1; postId -= step) {
      if (deadlineTs > 0 && Date.now() > deadlineTs) return candidate;
      // eslint-disable-next-line no-await-in-loop
      const post = await fetchTelegramEmbedPost(channel, postId);
      if (post) {
        candidate = postId;
        break;
      }
    }
    if (candidate) break;
  }

  if (!candidate) {
    return 0;
  }

  const upperBound = Math.min(maxId, candidate + step - 1);
  for (let postId = upperBound; postId > candidate; postId -= 1) {
    if (deadlineTs > 0 && Date.now() > deadlineTs) break;
    // eslint-disable-next-line no-await-in-loop
    const post = await fetchTelegramEmbedPost(channel, postId);
    if (post) {
      return postId;
    }
  }

  return candidate;
}

async function collectTelegramReviews(channel, limit, deadlineTs = 0) {
  const hint = telegramReviewsCache.channel === channel ? telegramReviewsCache.latestPostId : 0;
  const latestId = await findLatestTelegramPostId(channel, hint, deadlineTs);
  if (!latestId) {
    return { latestId: 0, items: [] };
  }

  const items = [];
  let currentId = latestId;
  let misses = 0;
  const maxMisses = Math.max(limit * 2, 20);

  while (currentId > 0 && items.length < limit && misses < maxMisses) {
    if (deadlineTs > 0 && Date.now() > deadlineTs) break;
    // eslint-disable-next-line no-await-in-loop
    const post = await fetchTelegramEmbedPost(channel, currentId);
    if (post && post.text) {
      items.push(post);
      misses = 0;
    } else {
      misses += 1;
    }
    currentId -= 1;
  }

  return { latestId, items };
}

async function refreshTelegramReviewsCache(deadlineTs = 0) {
  const result = await collectTelegramReviews(
    TELEGRAM_REVIEWS_CHANNEL,
    TELEGRAM_REVIEWS_MAX_LIMIT,
    deadlineTs
  );
  const items = Array.isArray(result?.items) ? result.items : [];
  const now = Date.now();
  telegramReviewsCache = {
    channel: TELEGRAM_REVIEWS_CHANNEL,
    fetchedAt: now,
    latestPostId: Number(result?.latestId || 0),
    items,
  };
  return telegramReviewsCache;
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'real',
      order_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS online_sessions (
      session_id TEXT PRIMARY KEY,
      path TEXT,
      last_seen INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_purchases_created_at
    ON purchases (created_at DESC)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_activation_events_created_at
    ON activation_events (created_at DESC)
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_activation_events_source_created_at
    ON activation_events (source, created_at DESC)
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_activation_events_order_id
    ON activation_events (order_id)
    WHERE order_id IS NOT NULL
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_online_last_seen
    ON online_sessions (last_seen)
  `);
}

async function ensureSystemActivationEvents() {
  if (!ENABLE_SYSTEM_ACTIVATIONS || SYSTEM_ACTIVATIONS_PER_DAY <= 0) return;
  try {
    const now = new Date();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const minutesSinceStart = now.getHours() * 60 + now.getMinutes();
    const spanMinutes = Math.max(10, minutesSinceStart);

    const existingRows = await all(
      `
      SELECT order_id
      FROM activation_events
      WHERE source = 'system'
        AND date(created_at, 'localtime') = date('now', 'localtime')
      `
    );
    const existingOrderIds = new Set(
      existingRows
        .map(row => String(row?.order_id || "").trim())
        .filter(Boolean)
    );

    for (let i = 1; i <= SYSTEM_ACTIVATIONS_PER_DAY; i += 1) {
      const orderId = `system-${todayKey}-${String(i).padStart(2, "0")}`;
      if (existingOrderIds.has(orderId)) continue;

      const email = buildSystemEmail(todayKey, i);
      const offsetMinutes = Math.floor((spanMinutes * i) / (SYSTEM_ACTIVATIONS_PER_DAY + 1));
      await run(
        `
        INSERT INTO activation_events (email, source, order_id, created_at)
        VALUES (?, 'system', ?, datetime('now', 'localtime', ?))
        `,
        [email, orderId, `-${offsetMinutes} minutes`]
      );
    }
  } catch (error) {
    logError("System activation generation skipped", error);
  }
}

async function seedDemoDataIfEmpty() {
  const demoEmails = [
    "alexz@gmail.com",
    "markov@mail.ru",
    "danik@yandex.ru",
    "natalia.petrova@gmail.com",
    "ivank@outlook.com",
    "sergey1989@mail.ru",
    "lisa.dev@gmail.com",
    "michael.jackson@mail.com",
    "olga@proton.me",
    "dmitryk@yandex.ru",
    "anna.z@example.com",
    "romanv@mail.ru",
    "kate.williams@gmail.com",
    "pavel.sidorov@mail.ru",
    "denis.kim@yandex.ru",
    "sofia.lee@outlook.com",
    "egor.petrov@gmail.com",
    "maria.novikova@mail.ru",
  ];

  const minDemoSales = 30;
  const minDemoOnline = 12;

  const salesRow = await get("SELECT COUNT(*) AS count FROM activation_events");
  const salesCount = Number(salesRow?.count || 0);
  const missingSales = Math.max(0, minDemoSales - salesCount);

  for (let i = 0; i < missingSales; i += 1) {
    const email = demoEmails[(salesCount + i) % demoEmails.length];
    await run(
      `
      INSERT INTO activation_events (email, source, order_id, created_at)
      VALUES (?, 'system', ?, datetime('now', ?))
      `,
      [email, `seed-system-${String(i + 1).padStart(3, "0")}`, `-${(i + 1) * 7} minutes`]
    );
  }

  const cutoff = Date.now() - ONLINE_TTL_MS;
  await run("DELETE FROM online_sessions WHERE last_seen < ?", [cutoff]);

  const onlineRow = await get("SELECT COUNT(*) AS count FROM online_sessions");
  const onlineCount = Number(onlineRow?.count || 0);
  const missingOnline = Math.max(0, minDemoOnline - onlineCount);

  const now = Date.now();
  for (let i = 1; i <= missingOnline; i += 1) {
    await run(
      "INSERT OR REPLACE INTO online_sessions (session_id, path, last_seen) VALUES (?, ?, ?)",
      [`demo-online-${i}`, "/en/index.html", now - i * 3000]
    );
  }
}

function createApp() {
  const app = express();
  const notFoundPagePath = path.join(__dirname, "404.html");
  const errorPagePath = path.join(__dirname, "500.html");
  const hasNotFoundPage = fs.existsSync(notFoundPagePath);
  const hasErrorPage = fs.existsSync(errorPagePath);
  const faviconCandidates = [
    path.join(__dirname, "favicon.ico"),
    path.join(__dirname, "assets", "img", "favicon.ico"),
  ];
  const faviconPath = faviconCandidates.find(candidate => fs.existsSync(candidate)) || "";

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  if (IS_PRODUCTION) {
    app.use((req, res, next) => {
      const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
      const host = String(req.headers.host || "");
      if (host && forwardedProto && forwardedProto !== "https") {
        return res.redirect(301, `https://${host}${req.originalUrl}`);
      }
      return next();
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(compression());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      skip: req => {
        const apiPath = String(req.path || "").toLowerCase();
        return apiPath === "/stats" || apiPath === "/heartbeat";
      },
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.get("/favicon.ico", (_req, res) => {
    if (!faviconPath) {
      return res.status(404).end();
    }

    return res.sendFile(faviconPath);
  });

  app.get("/robots.txt", (_req, res) => {
    return res.sendFile(path.join(__dirname, "robots.txt"));
  });

  app.get("/sitemap.xml", (_req, res) => {
    res.type("application/xml");
    return res.sendFile(path.join(__dirname, "sitemap.xml"));
  });

  app.use((req, res, next) => {
    const currentPath = String(req.path || "").toLowerCase();
    if (NOINDEX_PUBLIC_PATHS.has(currentPath)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    return next();
  });

  app.use(
    express.static(__dirname, {
      dotfiles: "ignore",
      index: false,
      etag: true,
      maxAge: IS_PRODUCTION ? "30d" : 0,
      setHeaders: (res, filePath) => {
        if (/\.(html?)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    })
  );

  function buildForwardedFor(req) {
    const existing = String(req.headers["x-forwarded-for"] || "").trim();
    const ip = String(req.headers["x-real-ip"] || req.ip || req.socket?.remoteAddress || "")
      .replace("::ffff:", "")
      .trim();

    if (!existing) return ip;
    if (!ip) return existing;

    const parts = existing.split(",").map(part => part.trim()).filter(Boolean);
    if (parts.includes(ip)) return existing;
    return `${existing}, ${ip}`;
  }

  function buildAdminProxyHeaders(req, options = {}) {
    const method = String(options.method || req.method || "GET").toUpperCase();
    const headers = {
      Accept: req.headers.accept || "application/json",
    };

    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }
    if (req.headers["x-telegram-bot-api-secret-token"]) {
      headers["X-Telegram-Bot-Api-Secret-Token"] = String(
        req.headers["x-telegram-bot-api-secret-token"]
      );
    }

    const forwardedFor = buildForwardedFor(req);
    if (forwardedFor) {
      headers["X-Forwarded-For"] = forwardedFor;
    }
    const realIp = String(req.headers["x-real-ip"] || req.ip || "").replace("::ffff:", "").trim();
    if (realIp) {
      headers["X-Real-IP"] = realIp;
    }
    const forwardedProto = String(req.headers["x-forwarded-proto"] || req.protocol || "").trim();
    if (forwardedProto) {
      headers["X-Forwarded-Proto"] = forwardedProto;
    }
    const forwardedHost = String(req.headers.host || "").trim();
    if (forwardedHost) {
      headers["X-Forwarded-Host"] = forwardedHost;
    }

    if (options.forceJson || (method !== "GET" && method !== "HEAD")) {
      headers["Content-Type"] = "application/json";
    } else if (req.headers["content-type"]) {
      headers["Content-Type"] = req.headers["content-type"];
    }

    return headers;
  }

  function extractQuerySuffix(req) {
    const rawUrl = String(req.url || "");
    const queryIndex = rawUrl.indexOf("?");
    return queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
  }

  async function fetchAdminText(req, targetPath, options = {}) {
    const method = String(options.method || req.method || "GET").toUpperCase();
    const forceJson = Boolean(options.forceJson) || (method !== "GET" && method !== "HEAD");
    const includeBody = method !== "GET" && method !== "HEAD";
    const bodyPayload =
      options.body !== undefined ? options.body : req.body || {};
    const { response } = await fetchAdminWithFallback(
      targetPath,
      {
        method,
        headers: buildAdminProxyHeaders(req, { method, forceJson }),
        body: includeBody ? JSON.stringify(bodyPayload) : undefined,
      },
      {
        timeoutMs: Number(options.timeoutMs || 12000),
        retryStatuses: Array.isArray(options.retryStatuses) && options.retryStatuses.length
          ? options.retryStatuses
          : [502, 503, 504],
      }
    );

    return { response, body: await response.text() };
  }

  async function proxyToAdminBackend(req, res, targetPath) {
    try {
      const method = String(req.method || "GET").toUpperCase();
      const headers = buildAdminProxyHeaders(req, { method });
      const { response } = await fetchAdminWithFallback(
        targetPath,
        {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(req.body || {}),
        },
        {
          timeoutMs: 15000,
          // If ADMIN_BACKEND_URL points to the wrong service, fallback to localhost candidates.
          retryStatuses: [404, 502, 503, 504],
        }
      );
      const body = await response.text();

      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }

      const locationHeader = response.headers.get("location");
      if (locationHeader) {
        res.setHeader("Location", locationHeader);
      }

      const setCookies =
        typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : (() => {
              const single = response.headers.get("set-cookie");
              return single ? [single] : [];
            })();
      if (Array.isArray(setCookies) && setCookies.length) {
        res.setHeader("set-cookie", setCookies);
      }

      return res.status(response.status).send(body);
    } catch (_) {
      return res.status(502).json({ error: "Admin API unavailable" });
    }
  }

  let statsPayloadCache = null;
  let statsPayloadCacheTs = 0;
  let statsPayloadPendingPromise = null;
  let lastOnlineCleanupTs = 0;
  const heartbeatWriteTracker = new Map();

  app.use("/api/admin", async (req, res) => {
    const query = extractQuerySuffix(req);
    const basePath = `/api/admin${req.path}`;
    return proxyToAdminBackend(req, res, `${basePath}${query}`);
  });

  app.use("/api/account", async (req, res) => {
    const query = extractQuerySuffix(req);
    const basePath = `/api/account${req.path}`;
    return proxyToAdminBackend(req, res, `${basePath}${query}`);
  });

  app.use("/api/telegram", async (req, res) => {
    const query = extractQuerySuffix(req);
    const basePath = `/api/telegram${req.path}`;
    return proxyToAdminBackend(req, res, `${basePath}${query}`);
  });

  app.post("/api/heartbeat", async (req, res) => {
    const sessionId = String(req.body?.sessionId || "").trim();
    const currentPath = String(req.body?.path || "").trim().slice(0, 200);

    if (!sessionId || sessionId.length > 120) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const now = Date.now();
    const lastWriteTs = Number(heartbeatWriteTracker.get(sessionId) || 0);
    if (now - lastWriteTs < HEARTBEAT_MIN_WRITE_INTERVAL_MS) {
      return res.json({ ok: true, throttled: true });
    }

    try {
      await run(
        `
        INSERT INTO online_sessions (session_id, path, last_seen)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id)
        DO UPDATE SET path = excluded.path, last_seen = excluded.last_seen
        `,
        [sessionId, currentPath, now]
      );
      heartbeatWriteTracker.set(sessionId, now);
      if (heartbeatWriteTracker.size > 20000) {
        const staleBefore = now - ONLINE_TTL_MS * 2;
        for (const [key, ts] of heartbeatWriteTracker.entries()) {
          if (Number(ts || 0) < staleBefore) heartbeatWriteTracker.delete(key);
        }
      }
      statsPayloadCache = null;
      statsPayloadCacheTs = 0;
      res.json({ ok: true });
    } catch (_error) {
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  app.post("/api/purchases", async (req, res) => {
    if (!ALLOW_LEGACY_PURCHASE_EVENTS) {
      return res.json({ ok: true, ignored: true, reason: "legacy_purchases_disabled" });
    }

    const email = String(req.body?.email || "").trim().toLowerCase();
    const orderId = String(req.body?.orderId || req.body?.order_id || "")
      .trim()
      .slice(0, 160);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!orderId || !/^[a-zA-Z0-9._:-]{4,160}$/.test(orderId)) {
      return res.status(400).json({ error: "Invalid orderId" });
    }

    try {
      await run(
        `
        INSERT INTO activation_events (email, source, order_id, created_at)
        VALUES (?, 'real', ?, datetime('now'))
        ON CONFLICT(order_id)
        DO UPDATE SET
          email = excluded.email,
          source = 'real',
          created_at = datetime('now')
        `,
        [email, orderId]
      );
      const row = await get(
        "SELECT id FROM activation_events WHERE order_id = ? LIMIT 1",
        [orderId]
      );
      const id = Number(row?.id || 0) || null;

      res.status(201).json({
        id,
        email: maskEmail(email),
        source: "real",
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to create purchase" });
    }
  });


  app.get("/api/public/products", async (req, res) => {
    const lang = String(req.query?.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";

    try {
      const { response } = await fetchAdminWithFallback(
        `/api/public/products?lang=${lang}`,
        {
          headers: buildAdminProxyHeaders(req, { method: "GET" }),
        },
        {
          timeoutMs: 8000,
          retryStatuses: [404, 502, 503, 504],
        }
      );

      if (!response.ok) {
        return res.status(502).json({ error: "Failed to load products from admin backend" });
      }

      const payload = await response.json();
      return res.json(withLegacyModalFallback(payload));
    } catch (_) {
      return res.status(502).json({ error: "Products API unavailable" });
    }
  });

  app.post("/api/public/create-order", async (req, res) => {
    try {
      const targetPaths = ["/api/public/create-order", "/api/public/orders/create"];
      let fallbackStatus = 502;
      let fallbackBody = "";

      for (const targetPath of targetPaths) {
        const { response, body } = await fetchAdminText(req, targetPath, {
          method: "POST",
          forceJson: true,
          timeoutMs: 12000,
          retryStatuses: [404, 502, 503, 504],
        });
        fallbackStatus = response.status;
        fallbackBody = body;

        if ((response.status === 404 || response.status === 405) && targetPath === "/api/public/create-order") {
          continue;
        }
        if (!response.ok) {
          return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order create failed" }));
        }
        return res.status(response.status).type("application/json").send(body);
      }

      return res.status(fallbackStatus).type("application/json").send(fallbackBody || JSON.stringify({ error: "Order create failed" }));
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/create-order", async (req, res) => {
    return res.redirect(307, "/api/public/create-order");
  });

  app.post("/api/orders/create", async (req, res) => {
    try {
      const targetPaths = ["/api/public/orders/create", "/api/public/create-order"];
      let fallbackStatus = 502;
      let fallbackBody = "";

      for (const targetPath of targetPaths) {
        const { response, body } = await fetchAdminText(req, targetPath, {
          method: "POST",
          forceJson: true,
          timeoutMs: 12000,
          retryStatuses: [404, 502, 503, 504],
        });
        fallbackStatus = response.status;
        fallbackBody = body;

        if ((response.status === 404 || response.status === 405) && targetPath === "/api/public/orders/create") {
          continue;
        }
        if (!response.ok) {
          return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order create failed" }));
        }
        return res.status(response.status).type("application/json").send(body);
      }

      return res.status(fallbackStatus).type("application/json").send(fallbackBody || JSON.stringify({ error: "Order create failed" }));
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/promo/validate", async (req, res) => {
    try {
      const targetPaths = ["/api/promo/validate", "/api/public/promo/validate"];
      let fallbackStatus = 502;
      let fallbackBody = "";

      for (const targetPath of targetPaths) {
        const { response } = await fetchAdminWithFallback(
          targetPath,
          {
            method: "POST",
            headers: buildAdminProxyHeaders(req, { method: "POST", forceJson: true }),
            body: JSON.stringify(req.body || {}),
          },
          {
            timeoutMs: 12000,
            retryStatuses: [404, 502, 503, 504],
          }
        );

        const body = await response.text();
        fallbackStatus = response.status;
        fallbackBody = body;

        // Compatibility fallback between route versions.
        if ((response.status === 404 || response.status === 405) && targetPath === "/api/promo/validate") {
          continue;
        }

        if (!response.ok) {
          return res
            .status(response.status)
            .type("application/json")
            .send(body || JSON.stringify({ error: "Promo validate failed" }));
        }

        return res.status(response.status).type("application/json").send(body);
      }

      return res
        .status(fallbackStatus)
        .type("application/json")
        .send(fallbackBody || JSON.stringify({ error: "Promo validate failed" }));
    } catch (_) {
      return res.status(502).json({ error: "Promo API unavailable" });
    }
  });

  function normalizePublicPaymentProvider(raw) {
    const provider = String(raw || "").trim().toLowerCase();
    if (provider === "enot.io") return "enot";
    if (provider === "gateway") return "enot";
    return provider;
  }

  function pickFirstString(values, fallback = "") {
    for (const value of values) {
      if (value == null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return fallback;
  }

  function normalizeCheckoutCreatePayload(payload, provider) {
    const source = payload && typeof payload === "object" ? payload : {};
    const planId = pickFirstString([
      source.plan_id,
      source.planId,
      source.product_id,
      source.productId,
      source.id,
      source.product,
    ]);
    const promoCode = pickFirstString(
      [source.promo_code, source.promoCode, source.promocode, source.promo, source.code],
      ""
    );
    const qtyRaw = Number(source.qty ?? source.quantity ?? 1);
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

    return {
      email: pickFirstString([source.email, source.customer_email, source.customerEmail, source.mail], "").toLowerCase(),
      plan_id: planId,
      qty: Math.max(1, qty),
      promo_code: promoCode || undefined,
      payment_method: normalizePublicPaymentProvider(
        pickFirstString([source.payment_method, source.paymentMethod, source.method, provider], provider)
      ),
    };
  }

  app.post("/api/payments/:provider/create", async (req, res) => {
    try {
      const provider = normalizePublicPaymentProvider(req.params.provider);
      if (!/^[a-z0-9_-]{2,20}$/.test(provider)) {
        return res.status(400).json({ error: "Invalid payment provider" });
      }

      const normalizedPayload = normalizeCheckoutCreatePayload(req.body || {}, provider);
      const { response, body } = await fetchAdminText(
        req,
        `/api/payments/${encodeURIComponent(provider)}/create`,
        {
          method: "POST",
          body: normalizedPayload,
          forceJson: true,
          timeoutMs: 12000,
          retryStatuses: [404, 502, 503, 504],
        }
      );

      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Payment create failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Payment API unavailable" });
    }
  });

  app.get("/api/orders/:orderId", async (req, res) => {
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const { response, body } = await fetchAdminText(req, `/api/orders/${orderId}`, {
        method: "GET",
        timeoutMs: 12000,
        retryStatuses: [404, 502, 503, 504],
      });
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order status failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.get("/api/orders/:orderId/reconcile", async (req, res) => {
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const { response, body } = await fetchAdminText(req, `/api/orders/${orderId}/reconcile`, {
        method: "GET",
        timeoutMs: 12000,
        retryStatuses: [404, 502, 503, 504],
      });
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Order reconcile failed" }));
      }

      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.get("/api/orders/:orderId/activation", async (req, res) => {
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const suffix = extractQuerySuffix(req);
      const { response, body } = await fetchAdminText(req, `/api/orders/${orderId}/activation${suffix}`, {
        method: "GET",
        timeoutMs: 12000,
        retryStatuses: [404, 502, 503, 504],
      });
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation fetch failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/orders/:orderId/activation/validate-token", async (req, res) => {
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const suffix = extractQuerySuffix(req);
      const { response, body } = await fetchAdminText(
        req,
        `/api/orders/${orderId}/activation/validate-token${suffix}`,
        {
          method: "POST",
          forceJson: true,
          timeoutMs: 12000,
          retryStatuses: [404, 502, 503, 504],
        }
      );
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation validate failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/orders/:orderId/activation/start", async (req, res) => {
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const suffix = extractQuerySuffix(req);
      const { response, body } = await fetchAdminText(
        req,
        `/api/orders/${orderId}/activation/start${suffix}`,
        {
          method: "POST",
          forceJson: true,
          timeoutMs: 20000,
          retryStatuses: [404, 502, 503, 504],
        }
      );
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation start failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.post("/api/orders/:orderId/activation/restart-with-new-key", async (req, res) => {
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const suffix = extractQuerySuffix(req);
      const { response, body } = await fetchAdminText(
        req,
        `/api/orders/${orderId}/activation/restart-with-new-key${suffix}`,
        {
          method: "POST",
          forceJson: true,
          timeoutMs: 20000,
          retryStatuses: [404, 502, 503, 504],
        }
      );
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation restart failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.get("/api/orders/:orderId/activation/task/:taskId", async (req, res) => {
    try {
      const orderId = encodeURIComponent(String(req.params.orderId || "").trim());
      const taskId = encodeURIComponent(String(req.params.taskId || "").trim());
      const suffix = extractQuerySuffix(req);
      const { response, body } = await fetchAdminText(
        req,
        `/api/orders/${orderId}/activation/task/${taskId}${suffix}`,
        {
          method: "GET",
          timeoutMs: 12000,
          retryStatuses: [404, 502, 503, 504],
        }
      );
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "Activation task fetch failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "Order API unavailable" });
    }
  });

  app.get("/api/vpn/me", async (req, res) => {
    try {
      const suffix = extractQuerySuffix(req);
      const { response, body } = await fetchAdminText(req, `/api/vpn/me${suffix}`, {
        method: "GET",
        timeoutMs: 12000,
        retryStatuses: [404, 502, 503, 504],
      });
      if (!response.ok) {
        return res.status(response.status).type("application/json").send(body || JSON.stringify({ error: "VPN fetch failed" }));
      }
      return res.status(response.status).type("application/json").send(body);
    } catch (_) {
      return res.status(502).json({ error: "VPN API unavailable" });
    }
  });


  app.get("/vpn/me", (req, res) => {
    const qs = String(req.url || "").includes("?") ? String(req.url || "").split("?")[1] : "";
    return res.redirect(307, qs ? `/api/vpn/me?${qs}` : "/api/vpn/me");
  });

  app.get("/api/public/storefront-stats", (req, res) => {
    const suffix = extractQuerySuffix(req);
    return res.redirect(307, suffix ? `/api/stats${suffix}` : "/api/stats");
  });

  async function fetchStorefrontStatsFromAdmin(req) {
    try {
      const { response } = await fetchAdminWithFallback(
        "/api/public/storefront-stats",
        {
          method: "GET",
          headers: buildAdminProxyHeaders(req, { method: "GET" }),
        },
        {
          timeoutMs: 6000,
          retryStatuses: [404, 502, 503, 504],
        }
      );
      if (!response.ok) return null;
      const payload = await response.json();
      const sales = Number(payload?.sales || 0);
      const tickerEntries = Array.isArray(payload?.tickerEntries)
        ? payload.tickerEntries
            .map(entry => ({
              email: String(entry?.email || "").trim(),
              source: "real",
            }))
            .filter(entry => entry.email)
        : [];
      return {
        sales: Number.isFinite(sales) && sales >= 0 ? sales : 0,
        tickerEntries,
      };
    } catch (_) {
      return null;
    }
  }

  function buildDegradedStatsPayload(online = 0) {
    const safeOnline = Number.isFinite(Number(online)) ? Math.max(0, Number(online)) : 0;
    return {
      sales: 0,
      realSales: 0,
      systemSales: 0,
      online: safeOnline,
      lastBuyers: [],
      tickerEntries: [],
      degraded: true,
    };
  }

  app.get("/api/stats", async (req, res) => {
    const now = Date.now();
    if (statsPayloadCache && now - statsPayloadCacheTs < STATS_CACHE_TTL_MS) {
      return res.json(statsPayloadCache);
    }

    if (statsPayloadPendingPromise) {
      try {
        const payload = await statsPayloadPendingPromise;
        return res.json(payload);
      } catch (_) {
        return res.json(statsPayloadCache || buildDegradedStatsPayload(0));
      }
    }

    statsPayloadPendingPromise = (async () => {
      const currentTs = Date.now();
      if (currentTs - lastOnlineCleanupTs > ONLINE_TTL_MS) {
        const cutoff = currentTs - ONLINE_TTL_MS;
        await run("DELETE FROM online_sessions WHERE last_seen < ?", [cutoff]);
        lastOnlineCleanupTs = currentTs;
      }

      const onlineRow = await get("SELECT COUNT(*) AS online FROM online_sessions");
      const online = Number(onlineRow?.online || 0);
      const adminStats = await fetchStorefrontStatsFromAdmin(req);
      if (adminStats) {
        return {
          sales: adminStats.sales,
          realSales: adminStats.sales,
          systemSales: 0,
          online,
          lastBuyers: adminStats.tickerEntries.map(item => item.email),
          tickerEntries: adminStats.tickerEntries,
        };
      }

      if (STRICT_BACKEND_STATS) {
        return buildDegradedStatsPayload(online);
      }

      if (ENABLE_SYSTEM_ACTIVATIONS) {
        await ensureSystemActivationEvents();
      }
      const realRow = await get(
        "SELECT COUNT(*) AS count FROM activation_events WHERE source = 'real'"
      );
      const systemRow = ENABLE_SYSTEM_ACTIVATIONS
        ? await get("SELECT COUNT(*) AS count FROM activation_events WHERE source = 'system'")
        : { count: 0 };
      const legacyRealSales = INCLUDE_LEGACY_PURCHASES
        ? Number((await get("SELECT COUNT(*) AS count FROM purchases"))?.count || 0)
        : 0;
      const realSales = Number(realRow?.count || 0) + legacyRealSales;
      const systemSales = ENABLE_SYSTEM_ACTIVATIONS ? Number(systemRow?.count || 0) : 0;
      let buyerRows;

      if (INCLUDE_LEGACY_PURCHASES) {
        const activationSourceFilter = ENABLE_SYSTEM_ACTIVATIONS ? "" : "WHERE source = 'real'";
        buyerRows = await all(
          `
          SELECT email, source, created_at
          FROM (
            SELECT email, source, created_at
            FROM activation_events
            ${activationSourceFilter}
            UNION ALL
            SELECT email, 'real' AS source, created_at
            FROM purchases
          )
          ORDER BY datetime(created_at) DESC
          LIMIT ${TICKER_EVENT_LIMIT}
          `
        );
      } else {
        const sourceFilter = ENABLE_SYSTEM_ACTIVATIONS ? "" : "WHERE source = 'real'";
        buyerRows = await all(
          `
          SELECT email, source, created_at
          FROM activation_events
          ${sourceFilter}
          ORDER BY datetime(created_at) DESC
          LIMIT ${TICKER_EVENT_LIMIT}
          `
        );
      }

      const tickerEntries = buyerRows.map(row => {
        const source = String(row?.source || "real").toLowerCase() === "system" ? "system" : "real";
        return {
          source,
          email: maskEmail(String(row?.email || "")),
        };
      });

      return {
        sales: realSales + systemSales,
        realSales,
        systemSales,
        online,
        lastBuyers: tickerEntries.map(item => item.email),
        tickerEntries,
      };
    })();

    try {
      const payload = await statsPayloadPendingPromise;
      statsPayloadCache = payload;
      statsPayloadCacheTs = Date.now();
      return res.json(payload);
    } catch (_) {
      return res.json(statsPayloadCache || buildDegradedStatsPayload(0));
    } finally {
      statsPayloadPendingPromise = null;
    }
  });

  app.get("/api/reviews/telegram", async (req, res) => {
    const requestedLimit = Number.parseInt(String(req.query?.limit || "12"), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 20))
      : 12;

    const referer = String(req.headers.referer || "").toLowerCase();
    const isEn = referer.includes("/en/");
    const contactUrl = isEn
      ? "https://gptishka.shop/en/contact.html"
      : "https://gptishka.shop/contact.html";

    const internalReviews = isEn
      ? [
          {
            id: 1,
            date: "2026-03-06T12:40:00.000Z",
            author: "Alex M.",
            text: "Activation was completed quickly. Support explained each step clearly and safely.",
            views: "",
            url: contactUrl,
          },
          {
            id: 2,
            date: "2026-03-04T16:10:00.000Z",
            author: "Olivia R.",
            text: "Renewal was processed the same day. Public reviews now keep personal contacts hidden.",
            views: "",
            url: contactUrl,
          },
          {
            id: 3,
            date: "2026-03-02T09:25:00.000Z",
            author: "Daniel K.",
            text: "The process is smooth and transparent. Helpful support and fast activation.",
            views: "",
            url: contactUrl,
          },
        ]
      : [
          {
            id: 1,
            date: "2026-03-06T12:40:00.000Z",
            author: "Андрей К.",
            text: "Активация прошла быстро. Поддержка помогла по шагам и ответила без задержек.",
            views: "",
            url: contactUrl,
          },
          {
            id: 2,
            date: "2026-03-04T16:10:00.000Z",
            author: "Мария П.",
            text: "Продление выполнили в тот же день. Хорошо, что личные контакты в отзывах скрыты.",
            views: "",
            url: contactUrl,
          },
          {
            id: 3,
            date: "2026-03-02T09:25:00.000Z",
            author: "Даниил С.",
            text: "Процесс понятный и аккуратный. Быстрый ответ поддержки и корректная активация.",
            views: "",
            url: contactUrl,
          },
        ];

    return res.json({
      source: "internal-reviews",
      fetchedAt: new Date().toISOString(),
      cached: true,
      items: internalReviews.slice(0, limit),
    });
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.get("/en", (_req, res) => {
    res.sendFile(path.join(__dirname, "en", "index.html"));
  });

  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(__dirname, "admin", "index.html"));
  });

  app.get("/admin/*", (req, res, next) => {
    if (path.extname(req.path)) {
      return next();
    }
    return res.sendFile(path.join(__dirname, "admin", "index.html"));
  });

  app.get("/store/vpn", (_req, res) => {
    res.sendFile(path.join(__dirname, "store", "vpn", "index.html"));
  });

  app.get("/store/vpn/", (_req, res) => {
    res.sendFile(path.join(__dirname, "store", "vpn", "index.html"));
  });

  const sendVpnActivationPage = (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    res.sendFile(path.join(__dirname, "store", "vpn", "activate", "index.html"));
  };

  app.get("/store/vpn/activate", sendVpnActivationPage);

  app.get("/store/vpn/activate/", sendVpnActivationPage);

  app.get("/vpn", (_req, res) => {
    res.sendFile(path.join(__dirname, "vpn", "index.html"));
  });

  app.get("/vpn/", (_req, res) => {
    res.sendFile(path.join(__dirname, "vpn", "index.html"));
  });

  // Backward-compatible asset aliases used by older cached pages.
  app.get("/style.css", (_req, res) => {
    return res.sendFile(path.join(__dirname, "assets", "css", "theme.min.css"));
  });

  app.get("/main.js", (_req, res) => {
    return res.sendFile(path.join(__dirname, "assets", "js", "app.min.js"));
  });

  // SPA-style fallback for routes without file extension.
  // Important: do NOT serve index.html for asset/API paths.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    if (path.extname(req.path)) return next();
    return res.sendFile(path.join(__dirname, "index.html"));
  });

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "Not found" });
    }

    if (hasNotFoundPage) {
      return res.status(404).sendFile(notFoundPagePath);
    }

    return res.status(404).send("Not found");
  });

  app.use((error, req, res, _next) => {
    logError(`Unhandled error on ${req.method} ${req.originalUrl}`, error);

    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: "Internal server error" });
    }

    if (hasErrorPage) {
      return res.status(500).sendFile(errorPagePath);
    }

    return res.status(500).send("Internal server error");
  });

  return app;
}

async function startServer(port = PORT) {
  db = createDb();
  await initDb();
  if (SEED_DEMO_STATS) {
    await seedDemoDataIfEmpty();
  }
  await ensureSystemActivationEvents();
  const app = createApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST, () => resolve(server));
    server.once("error", reject);
  });
}

if (require.main === module) {
  startServer()
    .then(() => {
      logInfo(`Server started on http://${HOST}:${PORT}`);
    })
    .catch(error => {
      logError("Failed to start server", error);
      process.exit(1);
    });
}

module.exports = { startServer };




