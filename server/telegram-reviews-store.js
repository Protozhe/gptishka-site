"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SOURCE_ID = "telegram-otziviaii";
const DEFAULT_SOURCE_LABEL = "Отзывы GPTishka";
const MAX_STORED_REVIEWS = 500;

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function normalizeChatId(value) {
  const normalized = String(value ?? "").trim();
  return /^-?\d+$/.test(normalized) ? normalized : "";
}

function extractTelegramReview(update, options = {}) {
  const message = update?.message || update?.channel_post || update?.edited_message || update?.edited_channel_post;
  if (!message || !message.chat || !Number.isInteger(Number(message.message_id))) return null;

  const chatType = String(message.chat.type || "").toLowerCase();
  if (!new Set(["group", "supergroup", "channel"]).has(chatType)) return null;

  const expectedUsername = normalizeUsername(options.groupUsername || "otziviaii");
  const expectedChatId = normalizeChatId(options.groupChatId);
  const actualUsername = normalizeUsername(message.chat.username);
  const actualChatId = normalizeChatId(message.chat.id);
  const matchesGroup =
    (expectedChatId && actualChatId === expectedChatId) ||
    (expectedUsername && actualUsername === expectedUsername);
  if (!matchesGroup) return null;

  const text = String(message.text || message.caption || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text || /^\/[a-z0-9_]+(?:@[a-z0-9_]+)?(?:\s|$)/i.test(text)) return null;

  const authorSource = message.from || message.sender_chat || {};
  const firstName = String(authorSource.first_name || authorSource.title || "").trim();
  const lastName = String(authorSource.last_name || "").trim();
  const maskedLastName = lastName ? `${lastName.slice(0, 1).toUpperCase()}.` : "";
  const isTechnicalGroupAuthor = !message.from || message.sender_chat || /^group$/i.test(firstName);
  const author = isTechnicalGroupAuthor
    ? "Покупатель Telegram"
    : [firstName, maskedLastName].filter(Boolean).join(" ") || "Покупатель Telegram";
  const messageId = Number(message.message_id);
  const channel = actualUsername || expectedUsername;
  const sourceId = String(options.sourceId || DEFAULT_SOURCE_ID);

  return {
    id: `${sourceId}-${messageId}`,
    sourceId,
    sourceType: "telegram",
    sourceLabel: String(options.sourceLabel || DEFAULT_SOURCE_LABEL),
    sourceHidden: false,
    author,
    text,
    detail: "Отзыв из Telegram",
    date: Number(message.date) > 0 ? new Date(Number(message.date) * 1000).toISOString() : new Date().toISOString(),
    dateLabel: "",
    rating: 5,
    url: channel ? `https://t.me/${channel}/${messageId}` : "",
    sortOrder: messageId,
  };
}

function normalizeRuntimePayload(payload) {
  const items = Array.isArray(payload?.items)
    ? payload.items.filter(item => item && item.id && item.text).slice(0, MAX_STORED_REVIEWS)
    : [];
  return {
    version: 1,
    updatedAt: String(payload?.updatedAt || ""),
    items,
  };
}

async function readRuntimeReviews(filePath) {
  try {
    const payload = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    return normalizeRuntimePayload(payload);
  } catch (error) {
    if (error?.code === "ENOENT") return normalizeRuntimePayload(null);
    throw error;
  }
}

async function writeRuntimeReviews(filePath, payload) {
  const normalized = normalizeRuntimePayload(payload);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.promises.rename(temporaryPath, filePath);
  return normalized;
}

async function upsertRuntimeReview(filePath, review) {
  const payload = await readRuntimeReviews(filePath);
  const comparableText = String(review.text || "").trim().toLowerCase();
  const items = payload.items.filter(item => {
    if (item.id === review.id) return false;
    return String(item.text || "").trim().toLowerCase() !== comparableText;
  });
  items.unshift(review);
  items.sort((a, b) => Number(b.sortOrder || 0) - Number(a.sortOrder || 0));
  return writeRuntimeReviews(filePath, {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: items.slice(0, MAX_STORED_REVIEWS),
  });
}

function mergeRuntimeReviews(publicPayload, runtimePayload, options = {}) {
  const payload = publicPayload && typeof publicPayload === "object" ? publicPayload : {};
  const sourceId = String(options.sourceId || DEFAULT_SOURCE_ID);
  const sourceLabel = String(options.sourceLabel || DEFAULT_SOURCE_LABEL);
  const runtimeItems = normalizeRuntimePayload(runtimePayload).items.map(item => ({
    ...item,
    sourceId,
    sourceType: "telegram",
    sourceLabel,
  }));
  const baseItems = Array.isArray(payload.items)
    ? payload.items.filter(item => item?.sourceId !== sourceId)
    : [];
  const sources = Array.isArray(payload.sources) ? payload.sources.map(source => ({ ...source })) : [];
  const existingSource = sources.find(source => source.id === sourceId);
  const previousTelegramTotal = Number(existingSource?.total || 0);
  const nextSource = {
    ...(existingSource || {}),
    id: sourceId,
    type: "telegram",
    channel: normalizeUsername(options.groupUsername || existingSource?.channel || "otziviaii"),
    label: sourceLabel,
    url: `https://t.me/${normalizeUsername(options.groupUsername || existingSource?.channel || "otziviaii")}`,
    total: runtimeItems.length,
    rating: runtimeItems.length ? 5 : null,
    available: runtimeItems.length > 0,
    status: runtimeItems.length ? "ok" : "awaiting-bot-messages",
    visibleItems: runtimeItems.length,
  };
  const sourceIndex = sources.findIndex(source => source.id === sourceId);
  if (sourceIndex >= 0) sources[sourceIndex] = nextSource;
  else sources.push(nextSource);

  return {
    ...payload,
    fetchedAt: runtimePayload?.updatedAt || payload.fetchedAt,
    totalReviews: Math.max(0, Number(payload.totalReviews || 0) - previousTelegramTotal + runtimeItems.length),
    sources,
    items: [...runtimeItems, ...baseItems],
  };
}

module.exports = {
  extractTelegramReview,
  mergeRuntimeReviews,
  readRuntimeReviews,
  upsertRuntimeReview,
};

