import fs from "fs";
import path from "path";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";
import { ordersService } from "../orders/orders.service";
import { parseSiteOrderStartPayload } from "../orders/telegram-order-linking";
import { TelegramBotType, telegramOrdersService } from "../orders/telegram-orders.service";
import { telegramBotEventsService } from "./telegram-bot-events.service";
import { sendTelegramNotification } from "../notifications/notifications.service";
import { buildTelegramLinkedOrderText, buildTelegramOrderDetailsText } from "../telegram/telegram-order-messages";

type TelegramUpdate = { update_id: number; message?: any; callback_query?: any };
type BotConfig = { botType: TelegramBotType; serviceName: string; token: string };
type OrderUserContext = { botType: TelegramBotType; chatId: string; telegramUserId: string; telegramUsername?: string | null; chatType?: string | null };
type TelegramUserSession = { pendingPromoInput?: boolean; promoCode?: string | null; updatedAt?: string };

const BOT_POLL_TIMEOUT_SECONDS = 25;
const BOT_RETRY_DELAY_MS = 2500;
const SUPPORT_LINK = String(env.ACTIVATION_SUPPORT_BASE_URL || "https://gptishka.shop/contact.html").trim();
const REVIEW_LINK = "https://t.me/askarsupport";
const APP_BASE_URL = String(env.APP_BASE_URL || "https://gptishka.shop").trim().replace(/\/+$/, "");
const CLAUDE_ID_HELP_IMAGE_URL = `${APP_BASE_URL}/assets/img/claude-org-id-example.png`;

function resolveRuntimeDir() {
  const fromEnv = String(process.env.GPTISHKA_RUNTIME_DIR || process.env.RUNTIME_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  const linuxDefault = "/var/lib/gptishka-runtime";
  if (process.platform === "linux" && fs.existsSync(linuxDefault)) return linuxDefault;
  return path.resolve(process.cwd(), "data");
}

const runtimeDir = resolveRuntimeDir();
const botOffsetsPath = path.join(runtimeDir, "telegram-bot-offsets.json");
const botSessionsPath = path.join(runtimeDir, "telegram-bot-sessions.json");
const claudeOfferPath = path.join(__dirname, "legal", "claude-public-offer.ru.txt");
const claudePrivacyPath = path.join(__dirname, "legal", "claude-privacy-policy.ru.txt");
const claudeRefundPath = path.join(__dirname, "legal", "claude-refund-policy.ru.txt");

function ensureOffsetsFile() {
  fs.mkdirSync(runtimeDir, { recursive: true });
  if (!fs.existsSync(botOffsetsPath)) fs.writeFileSync(botOffsetsPath, JSON.stringify({ offsets: {} }, null, 2), "utf8");
}
function getStoredOffset(botType: TelegramBotType) {
  ensureOffsetsFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(botOffsetsPath, "utf8")) as { offsets?: Record<string, number> };
    const value = Number(parsed?.offsets?.[botType] || 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}
function setStoredOffset(botType: TelegramBotType, updateId: number) {
  ensureOffsetsFile();
  const parsed = JSON.parse(fs.readFileSync(botOffsetsPath, "utf8")) as { offsets?: Record<string, number> };
  const offsets = parsed?.offsets && typeof parsed.offsets === "object" ? parsed.offsets : {};
  offsets[botType] = Number(updateId);
  fs.writeFileSync(botOffsetsPath, JSON.stringify({ offsets }, null, 2), "utf8");
}

function ensureSessionsFile() {
  fs.mkdirSync(runtimeDir, { recursive: true });
  if (!fs.existsSync(botSessionsPath)) fs.writeFileSync(botSessionsPath, JSON.stringify({ sessions: {} }, null, 2), "utf8");
}
function readSessions() {
  ensureSessionsFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(botSessionsPath, "utf8")) as { sessions?: Record<string, TelegramUserSession> };
    return parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {};
  } catch {
    return {};
  }
}
function writeSessions(sessions: Record<string, TelegramUserSession>) {
  ensureSessionsFile();
  fs.writeFileSync(botSessionsPath, JSON.stringify({ sessions }, null, 2), "utf8");
}
function sessionKey(ctx: Pick<OrderUserContext, "botType" | "telegramUserId">) {
  return `${ctx.botType}:${ctx.telegramUserId}`;
}
function getUserSession(ctx: Pick<OrderUserContext, "botType" | "telegramUserId">) {
  return readSessions()[sessionKey(ctx)] || {};
}
function updateUserSession(ctx: Pick<OrderUserContext, "botType" | "telegramUserId">, patch: TelegramUserSession) {
  const sessions = readSessions();
  const key = sessionKey(ctx);
  sessions[key] = {
    ...(sessions[key] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeSessions(sessions);
  return sessions[key];
}
function normalizePromoCodeInput(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
function normalizeTelegramId(value: unknown) {
  return String(value || "").trim().replace(/[^\d-]/g, "");
}
function normalizeTelegramUsername(value: unknown) {
  return String(value || "").trim().replace(/^@+/, "") || null;
}
function normalizeTelegramChatType(value: unknown) {
  return String(value || "").trim().toLowerCase() || null;
}
function isPrivateOrderChat(ctx: OrderUserContext) {
  return ctx.chatType === "private";
}
function sendPrivateChatRequired(client: TelegramApiClient, ctx: OrderUserContext) {
  return client.sendMessage(ctx.chatId, "Для безопасности откройте бота в личном чате и повторите команду.");
}
function parseStartPayload(text: string) {
  const raw = String(text || "").trim();
  const payload = raw.replace(/^\/start(?:@\w+)?\s*/i, "").trim();
  if (!payload) return { payload: "", attribution: null as Record<string, string> | null };

  const result: Record<string, string> = {};
  if (payload.includes("=") || payload.includes("&")) {
    const qs = payload.startsWith("?") ? payload.slice(1) : payload;
    const sp = new URLSearchParams(qs);
    for (const [k, v] of sp.entries()) {
      const key = String(k || "").trim().toLowerCase();
      const value = String(v || "").trim();
      if (!key || !value) continue;
      if (["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "src", "ref", "adset", "creative"].includes(key)) {
        result[key] = value;
      }
    }
  } else {
    const chunks = payload.split(/[_|:]/g).map((x) => x.trim()).filter(Boolean);
    if (chunks.length) {
      result.src = chunks[0] || "";
      if (chunks[1]) result.utm_campaign = chunks.slice(1).join("_");
    }
  }

  return { payload, attribution: Object.keys(result).length ? result : null };
}
async function notifyAdmin(eventTitle: string, lines: string[]) {
  const text = [eventTitle, ...lines].filter(Boolean).join("\n");
  await sendTelegramNotification(text).catch(() => undefined);
}
function detectMessageAction(text: string) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return "message";
  if (/^\/start/.test(value)) return "start";
  if (/^\/buy/.test(value)) return "buy_cmd";
  if (/^\/orders|^\/myorders|^\/purchases/.test(value)) return "my_orders_cmd";
  if (/^\/reviews/.test(value)) return "reviews_cmd";
  if (/^\/faq/.test(value)) return "faq_cmd";
  if (/^\/terms|^\/docs/.test(value)) return "docs_cmd";
  if (/^\/language|^\/lang/.test(value)) return "language_cmd";
  if (/^\/support/.test(value)) return "support_cmd";
  if (/^\/promo/.test(value)) return "promo_cmd";
  if (/^\/token/.test(value)) return "token_cmd";
  if (/^\/check/.test(value)) return "check_cmd";
  return "message";
}
function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: String(currency || "RUB").toUpperCase() }).format(amount);
  } catch {
    return `${Number(amount || 0).toFixed(2)} ${String(currency || "RUB").toUpperCase()}`;
  }
}
function mapOrderStatus(status: string) {
  if (status === "PAID") return "РћРїР»Р°С‡РµРЅ";
  if (status === "FAILED") return "РћС€РёР±РєР° РѕРїР»Р°С‚С‹";
  if (status === "REFUNDED") return "Р’РѕР·РІСЂР°С‚";
  return "РћР¶РёРґР°РµС‚ РѕРїР»Р°С‚Сѓ";
}
function mapActivationStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "success") return "СѓСЃРїРµС€РЅРѕ";
  if (s === "processing") return "РІ РїСЂРѕС†РµСЃСЃРµ";
  if (s === "failed") return "РѕС€РёР±РєР°";
  if (s === "issued") return "РєР»СЋС‡ РІС‹РґР°РЅ";
  return "РЅРµ Р·Р°РїСѓС‰РµРЅР°";
}
function keyboardMain() {
  return {
    inline_keyboard: [
      [{ text: "РљСѓРїРёС‚СЊ", callback_data: "buy" }],
      [{ text: "РњРѕРё РїРѕРєСѓРїРєРё", callback_data: "my_orders" }],
      [{ text: "РћС‚Р·С‹РІС‹", callback_data: "reviews" }],
      [{ text: "FAQ", callback_data: "faq" }],
      [{ text: "РџРѕРґРґРµСЂР¶РєР°", callback_data: "support" }],
      [{ text: "Р”РѕРєСѓРјРµРЅС‚Р°С†РёСЏ", callback_data: "docs" }],
      [{ text: "РЇР·С‹Рє", callback_data: "language" }],
    ],
  };
}
function keyboardDocs() {
  return {
    inline_keyboard: [
      [{ text: "рџ“„ РџСѓР±Р»РёС‡РЅР°СЏ РѕС„РµСЂС‚Р°", callback_data: "offer" }],
      [{ text: "рџ”ђ РџРѕР»РёС‚РёРєР° РєРѕРЅС„РёРґРµРЅС†РёР°Р»СЊРЅРѕСЃС‚Рё", callback_data: "privacy" }],
      [{ text: "в†©пёЏ РџРѕР»РёС‚РёРєР° РІРѕР·РІСЂР°С‚Р° СЃСЂРµРґСЃС‚РІ", callback_data: "refund_policy" }],
      [{ text: "РќР°Р·Р°Рґ", callback_data: "back_main" }],
    ],
  };
}
function keyboardBuyAgreement(promoCode?: string | null) {
  const promo = String(promoCode || "").trim();
  return {
    inline_keyboard: [
      [{ text: "вњ… РЎРѕРіР»Р°СЃРµРЅ Рё РїРµСЂРµС…РѕР¶Сѓ Рє РѕРїР»Р°С‚Рµ", callback_data: "agree_buy" }],
      [{ text: promo ? `Промокод: ${promo}` : "Ввести промокод", callback_data: "promo_prompt" }],
      ...(promo ? [[{ text: "Убрать промокод", callback_data: "promo_clear" }]] : []),
      [{ text: "рџ“„ РџСѓР±Р»РёС‡РЅР°СЏ РѕС„РµСЂС‚Р°", callback_data: "offer" }],
      [{ text: "РќР°Р·Р°Рґ", callback_data: "back_main" }],
    ],
  };
}
function keyboardPromoInput() {
  return {
    inline_keyboard: [
      [{ text: "Назад к оплате", callback_data: "buy" }],
      [{ text: "Главное меню", callback_data: "back_main" }],
    ],
  };
}
function keyboardPay(orderId: string, checkoutUrl: string) {
  return { inline_keyboard: [[{ text: "РћРїР»Р°С‚РёС‚СЊ", url: checkoutUrl }], [{ text: "РџСЂРѕРІРµСЂРёС‚СЊ РѕРїР»Р°С‚Сѓ", callback_data: `check_payment:${orderId}` }], [{ text: "РњРѕРё Р·Р°РєР°Р·С‹", callback_data: "my_orders" }]] };
}
function keyboardActivation(orderId: string) {
  return { inline_keyboard: [[{ text: "РџСЂРѕРІРµСЂРёС‚СЊ Р°РєС‚РёРІР°С†РёСЋ", callback_data: `check_activation:${orderId}` }], [{ text: "РџРѕРґРґРµСЂР¶РєР°", callback_data: "support" }]] };
}
function keyboardPurchases() {
  return {
    inline_keyboard: [
      [{ text: "🛍 Купить", callback_data: "buy" }],
      [{ text: "🔄 Обновить", callback_data: "my_orders" }],
      [{ text: "◀️ Назад в меню", callback_data: "back_main" }],
    ],
  };
}
function fmtDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dt);
  } catch {
    return dt.toISOString();
  }
}
async function sendChatgptTokenInstructions(client: TelegramApiClient, ctx: OrderUserContext, orderId: string) {
  return client.sendMessage(
    ctx.chatId,
    [
      "Для активации ChatGPT Plus отправьте токен аккаунта.",
      "",
      "1) Откройте ссылку: https://chatgpt.com/api/auth/session",
      "2) Скопируйте всё содержимое страницы (JSON целиком).",
      "3) Отправьте в бота командой:",
      `/token ${orderId} <token_or_json>`,
      "",
      "Бот сам извлечет нужный токен из JSON и запустит активацию.",
    ].join("\n"),
    keyboardActivation(orderId)
  );
}
async function logEvent(eventType: string, ctx: Partial<OrderUserContext> & { orderId?: string; callbackData?: string; messageText?: string; meta?: Record<string, unknown> | null }) {
  if (!ctx.botType) return;
  await telegramBotEventsService.log({
    botType: ctx.botType,
    eventType,
    orderId: ctx.orderId || null,
    telegramUserId: ctx.telegramUserId || null,
    telegramUsername: ctx.telegramUsername || null,
    telegramChatId: ctx.chatId || null,
    messageText: ctx.messageText || null,
    callbackData: ctx.callbackData || null,
    meta: ctx.meta || null,
  });
}

class TelegramApiClient {
  constructor(private readonly token: string, private readonly botType: TelegramBotType) {}
  private apiUrl(method: string) { return `https://api.telegram.org/bot${this.token}/${method}`; }
  private async request<T>(method: string, payload?: Record<string, unknown>) {
    const response = await fetch(this.apiUrl(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : "{}" });
    const json = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!response.ok || !json?.ok) throw new Error(`[telegram:${this.botType}] ${method} failed: ${String(json?.description || `HTTP_${response.status}`)}`);
    return json.result as T;
  }
  getMe() { return this.request<{ id: number; username?: string }>("getMe"); }
  deleteWebhook() { return this.request("deleteWebhook", { drop_pending_updates: false }); }
  getUpdates(offset: number) { return this.request<TelegramUpdate[]>("getUpdates", { timeout: BOT_POLL_TIMEOUT_SECONDS, allowed_updates: ["message", "callback_query"], offset }); }
  sendMessage(chatId: string, text: string, replyMarkup?: Record<string, unknown>) {
    return this.request("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  }
  sendPhoto(chatId: string, photo: string, caption?: string, replyMarkup?: Record<string, unknown>) {
    return this.request("sendPhoto", { chat_id: chatId, photo, ...(caption ? { caption } : {}), ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  }
  answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.request("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
  }
}

function readLegalDocument(filePath: string, fallback: string) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return fallback;
  }
}
async function sendLongMessage(client: TelegramApiClient, chatId: string, text: string, replyMarkup?: Record<string, unknown>) {
  const maxLen = 3500;
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    const slice = rest.slice(0, maxLen);
    const cut = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const idx = cut > 1000 ? cut : maxLen;
    chunks.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx).trimStart();
  }
  if (rest) chunks.push(rest);
  for (let i = 0; i < chunks.length; i += 1) {
    await client.sendMessage(chatId, chunks[i], i === chunks.length - 1 ? replyMarkup : undefined);
  }
}

async function sendStart(client: TelegramApiClient, config: BotConfig, ctx: OrderUserContext) {
  const offer = await telegramOrdersService.getBotOffer(config.botType);
  await logEvent("start", ctx);
  await client.sendMessage(ctx.chatId, [`РџСЂРёРІРµС‚! Р­С‚Рѕ Р±РѕС‚ В«${config.serviceName}В».`, `РЎРµСЂРІРёСЃ: ${offer.title}`, `Р¦РµРЅР°: ${formatMoney(offer.price, offer.currency)}`, "", "Р’С‹Р±РµСЂРёС‚Рµ РґРµР№СЃС‚РІРёРµ:"].join("\n"), keyboardMain());
}
async function sendOrders(client: TelegramApiClient, ctx: OrderUserContext) {
  if (!isPrivateOrderChat(ctx)) return sendPrivateChatRequired(client, ctx);
  await logEvent("my_orders", ctx);
  const rows = await telegramOrdersService.listOrders({ botType: ctx.botType, telegramUserId: ctx.telegramUserId, telegramChatId: ctx.chatId, telegramUsername: ctx.telegramUsername }, 8);
  const pending = rows.filter((row) => String(row.status || "").toUpperCase() === "PENDING");
  const paid = rows.filter((row) => String(row.status || "").toUpperCase() === "PAID");

  const pendingBlock = pending.length
    ? pending
        .slice(0, 5)
        .map((order, i) =>
          [
            `${i + 1}. ${order.productTitle || "Товар"}`,
            `🧾 Заказ: ${order.id.slice(0, 10)}...`,
            `💰 Сумма: ${formatMoney(order.amount, String(order.currency || "RUB"))}`,
            order.promoCode ? `🎟 Промокод: ${order.promoCode}` : "",
            `⏰ Создан: ${fmtDateTime(order.createdAt)}`,
            `📌 Статус: ожидает оплату`,
          ].filter(Boolean).join("\n")
        )
        .join("\n\n")
    : "Пусто";

  const paidBlock = paid.length
    ? paid
        .slice(0, 8)
        .map((order, i) =>
          [
            `${i + 1}. ${order.productTitle || "Товар"}`,
            `🧾 Заказ: ${order.id.slice(0, 10)}...`,
            `💰 Сумма: ${formatMoney(order.amount, String(order.currency || "RUB"))}`,
            order.promoCode ? `🎟 Промокод: ${order.promoCode}` : "",
            `✅ Оплачен: ${fmtDateTime(order.paidAt || order.createdAt)}`,
            `⚙️ Активация: ${mapActivationStatus(order.activationStatus)}`,
          ].filter(Boolean).join("\n")
        )
        .join("\n\n")
    : "Пока нет оплаченных покупок";

  const text = [
    "🛒 Мои покупки",
    "",
    "⌛ Ожидают оплату:",
    pendingBlock,
    "",
    "✅ Оплаченные:",
    paidBlock,
  ].join("\n");

  return client.sendMessage(ctx.chatId, text, keyboardPurchases());
}
async function handleSiteOrderStartPayload(client: TelegramApiClient, ctx: OrderUserContext, payload: string) {
  const parsed = parseSiteOrderStartPayload(payload);
  if (!parsed) return false;
  if (!isPrivateOrderChat(ctx)) {
    await sendPrivateChatRequired(client, ctx);
    return true;
  }
  const linked = await telegramOrdersService.linkSiteOrderToTelegram({
    botType: ctx.botType,
    telegramUserId: ctx.telegramUserId,
    telegramChatId: ctx.chatId,
    telegramUsername: ctx.telegramUsername,
    startPayload: parsed,
  });
  await client.sendMessage(ctx.chatId, buildTelegramLinkedOrderText(linked));
  if (String(linked.status || "").toUpperCase() === "PAID") {
    const activation = await ordersService.getActivationForTelegram(linked.id, ctx.telegramUserId).catch((error) => ({
      deliveryMode: linked.deliveryType,
      status: "pending",
      message: error instanceof Error ? error.message : "Данные заказа пока готовятся.",
    }));
    await sendLongMessage(client, ctx.chatId, buildTelegramOrderDetailsText({ order: linked, activation }), keyboardActivation(linked.id));
  }
  return true;
}
async function sendSupport(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("support", ctx);
  return client.sendMessage(ctx.chatId, `РџРѕРґРґРµСЂР¶РєР° GPTishka:\n1) https://gptishka.shop/contact.html\n2) ${SUPPORT_LINK}`, keyboardMain());
}
async function sendReviews(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("reviews", ctx);
  return client.sendMessage(ctx.chatId, "РћС‚Р·С‹РІС‹ РєР»РёРµРЅС‚РѕРІ: https://gptishka.shop/reviews.html", keyboardMain());
}
async function sendFaq(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("faq", ctx);
  return client.sendMessage(
    ctx.chatId,
    [
      "FAQ:",
      "1) РџРѕСЃР»Рµ РѕРїР»Р°С‚С‹ РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊ РѕРїР»Р°С‚СѓВ».",
      "2) Р•СЃР»Рё С‚СЂРµР±СѓРµС‚СЃСЏ С‚РѕРєРµРЅ, Р±РѕС‚ РїРѕРґСЃРєР°Р¶РµС‚ РєРѕРјР°РЅРґСѓ /token.",
      "3) РЎС‚Р°С‚СѓСЃ Р°РєС‚РёРІР°С†РёРё: РєРЅРѕРїРєР° В«РџСЂРѕРІРµСЂРёС‚СЊ Р°РєС‚РёРІР°С†РёСЋВ».",
    ].join("\n"),
    keyboardMain()
  );
}
async function sendTerms(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("terms", ctx);
  return client.sendMessage(ctx.chatId, "РЈСЃР»РѕРІРёСЏ РїРѕРєСѓРїРєРё: https://gptishka.shop/oferta.html", keyboardMain());
}
async function sendDocs(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("docs", ctx);
  return client.sendMessage(ctx.chatId, "Р”РѕРєСѓРјРµРЅС‚Р°С†РёСЏ:", keyboardDocs());
}
async function sendOffer(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("offer", ctx);
  return sendLongMessage(client, ctx.chatId, readLegalDocument(claudeOfferPath, "РџСѓР±Р»РёС‡РЅР°СЏ РѕС„РµСЂС‚Р° РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРЅР°. РћР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ."), keyboardDocs());
}
async function sendPrivacyPolicy(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("privacy", ctx);
  return sendLongMessage(client, ctx.chatId, readLegalDocument(claudePrivacyPath, "РџРѕР»РёС‚РёРєР° РєРѕРЅС„РёРґРµРЅС†РёР°Р»СЊРЅРѕСЃС‚Рё РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРЅР°. РћР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ."), keyboardDocs());
}
async function sendRefundPolicy(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("refund_policy", ctx);
  return sendLongMessage(client, ctx.chatId, readLegalDocument(claudeRefundPath, "РџРѕР»РёС‚РёРєР° РІРѕР·РІСЂР°С‚Р° РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРЅР°. РћР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ."), keyboardDocs());
}
async function sendPrePaymentAgreement(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("prepayment_agreement", ctx);
  updateUserSession(ctx, { pendingPromoInput: false });
  const session = getUserSession(ctx);
  let promoCode = normalizePromoCodeInput(session.promoCode || "");
  let promoLine = "";
  if (promoCode) {
    const validation = await telegramOrdersService.validatePromoCodeForBot({ botType: ctx.botType, promoCode }).catch(() => null);
    if (validation?.valid) {
      promoLine = [
        "",
        `Промокод ${promoCode} применен.`,
        `Скидка: ${formatMoney(Number(validation.discountAmount || 0), "RUB")}`,
        `К оплате: ${formatMoney(Number(validation.finalPrice || 0), "RUB")}`,
      ].join("\n");
    } else {
      updateUserSession(ctx, { promoCode: null, pendingPromoInput: false });
      promoCode = "";
      promoLine = "\nСохраненный промокод больше не действует. Введите новый, если он есть.";
    }
  }
  return client.sendMessage(
    ctx.chatId,
    "РџРµСЂРµРґ РѕРїР»Р°С‚РѕР№ РІС‹ РїРѕРґС‚РІРµСЂР¶РґР°РµС‚Рµ, С‡С‚Рѕ РѕР·РЅР°РєРѕРјРёР»РёСЃСЊ СЃ СѓСЃР»РѕРІРёСЏРјРё РїРѕРєСѓРїРєРё, РїСѓР±Р»РёС‡РЅРѕР№ РѕС„РµСЂС‚РѕР№ СЃРµСЂРІРёСЃР° В«Claude РѕС„РёС†РёР°Р»СЊРЅР°СЏ РїРѕРґРїРёСЃРєР°В» Рё РїРѕРЅРёРјР°РµС‚Рµ, С‡С‚Рѕ С‚РѕРІР°СЂ СЏРІР»СЏРµС‚СЃСЏ С†РёС„СЂРѕРІС‹Рј." + promoLine,
    keyboardBuyAgreement(promoCode)
  );
}
async function sendPromoPrompt(client: TelegramApiClient, ctx: OrderUserContext) {
  updateUserSession(ctx, { pendingPromoInput: true });
  await logEvent("promo_prompt", ctx);
  return client.sendMessage(
    ctx.chatId,
    "Отправьте промокод одним сообщением.\n\nЕсли промокода нет, нажмите «Назад к оплате».",
    keyboardPromoInput()
  );
}
async function handlePromoInput(client: TelegramApiClient, ctx: OrderUserContext, rawCode: string) {
  const promoCode = normalizePromoCodeInput(rawCode);
  if (!promoCode || promoCode.length < 2) {
    await logEvent("promo_rejected", { ...ctx, meta: { reason: "empty_or_short" } });
    return client.sendMessage(ctx.chatId, "Промокод слишком короткий. Отправьте код ещё раз или вернитесь назад.", keyboardPromoInput());
  }

  const validation = await telegramOrdersService.validatePromoCodeForBot({ botType: ctx.botType, promoCode });
  if (!validation.valid) {
    updateUserSession(ctx, { pendingPromoInput: true, promoCode: null });
    await logEvent("promo_rejected", { ...ctx, meta: { promoCode } });
    await notifyAdmin("Промокод не применен", [
      `Бот: ${ctx.botType}`,
      `Пользователь: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
      `Промокод: ${promoCode}`,
    ]);
    return client.sendMessage(ctx.chatId, "Промокод не найден, истёк или уже исчерпан. Проверьте код и отправьте ещё раз.", keyboardPromoInput());
  }

  updateUserSession(ctx, { pendingPromoInput: false, promoCode });
  await logEvent("promo_applied", {
    ...ctx,
    meta: {
      promoCode,
      basePrice: validation.basePrice,
      discountAmount: validation.discountAmount,
      finalPrice: validation.finalPrice,
    },
  });
  await notifyAdmin("Промокод применен", [
    `Бот: ${ctx.botType}`,
    `Пользователь: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
    `Промокод: ${promoCode}`,
    `Скидка: ${formatMoney(Number(validation.discountAmount || 0), "RUB")}`,
    `К оплате: ${formatMoney(Number(validation.finalPrice || 0), "RUB")}`,
  ]);
  await client.sendMessage(
    ctx.chatId,
    [
      `Промокод ${promoCode} применен.`,
      `Скидка: ${formatMoney(Number(validation.discountAmount || 0), "RUB")}`,
      `К оплате: ${formatMoney(Number(validation.finalPrice || 0), "RUB")}`,
    ].join("\n")
  );
  return sendPrePaymentAgreement(client, ctx);
}
async function sendLanguage(client: TelegramApiClient, ctx: OrderUserContext) {
  await logEvent("language", ctx);
  return client.sendMessage(ctx.chatId, "РЇР·С‹Рє РёРЅС‚РµСЂС„РµР№СЃР°: Р СѓСЃСЃРєРёР№ (EN СЃРєРѕСЂРѕ Р±СѓРґРµС‚ РґРѕСЃС‚СѓРїРµРЅ).", keyboardMain());
}
function parseTokenCommand(text: string) {
  const m = String(text || "").match(/^\/token(?:@\w+)?\s+([a-zA-Z0-9]+)\s+([\s\S]+)$/i);
  if (!m) return null;
  return { orderId: String(m[1] || "").trim(), token: String(m[2] || "").trim() };
}
function parsePromoCommand(text: string) {
  const m = String(text || "").match(/^\/promo(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (!m) return null;
  return normalizePromoCodeInput(m[1] || "");
}
function parseCheckCommand(text: string) {
  const m = String(text || "").match(/^\/check(?:@\w+)?\s+([a-zA-Z0-9]+)$/i);
  if (!m) return null;
  return String(m[1] || "").trim();
}
function maskSensitiveMessage(text: string) {
  const value = String(text || "");
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(value)) {
    const parsed = parseStartPayload(value);
    if (parseSiteOrderStartPayload(parsed.payload)) return "/start <site_order_link>";
  }
  if (!/^\/token(?:@|\s|$)/i.test(value)) return value;
  const parsed = parseTokenCommand(value);
  if (!parsed) return "/token <order_id> <masked>";
  return "/token " + parsed.orderId + " <masked>";
}
function keyboardActivationSuccess() {
  return {
    inline_keyboard: [
      [{ text: "Leave review", url: REVIEW_LINK }],
      [{ text: "My purchases", callback_data: "my_orders" }],
      [{ text: "Menu", callback_data: "back_main" }],
    ],
  };
}
async function sendClaudeIdInstructions(client: TelegramApiClient, ctx: OrderUserContext, orderId: string) {
  await client.sendPhoto(ctx.chatId, CLAUDE_ID_HELP_IMAGE_URL, "Example: where to find Organization ID in Claude.").catch(() => undefined);
  return client.sendMessage(
    ctx.chatId,
    [
      "To activate Claude Pro, send your Organization ID.",
      "",
      "1. Go to claude.com and sign in.",
      "2. Open Settings -> Account.",
      "3. Find Organization ID and copy the full UUID.",
      "4. Paste it into the command and send it to the bot.",
      "",
      "/token " + orderId + " xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    ].join("\n"),
    keyboardActivation(orderId)
  );
}
async function sendPaymentState(client: TelegramApiClient, ctx: OrderUserContext, orderId: string) {
  if (!isPrivateOrderChat(ctx)) return sendPrivateChatRequired(client, ctx);
  await logEvent("check_payment", { ...ctx, orderId });
  const status = await telegramOrdersService.getOrderStatus({ botType: ctx.botType, telegramUserId: ctx.telegramUserId, telegramChatId: ctx.chatId, telegramUsername: ctx.telegramUsername, orderId });
  if (status.status !== "PAID") {
    const msg = ["Order: " + status.id, "Payment status: " + mapOrderStatus(String(status.status || "")), status.checkoutUrl ? "Pay using the button below." : "Payment is not confirmed yet."].join("\n");
    return client.sendMessage(ctx.chatId, msg, status.checkoutUrl ? keyboardPay(status.id, status.checkoutUrl) : keyboardMain());
  }
  await telegramOrdersService.clearOrderError(status.id);
  await logEvent("payment_confirmed", { ...ctx, orderId: status.id });
  await notifyAdmin("рџ’і РћРїР»Р°С‚Р° РїРѕРґС‚РІРµСЂР¶РґРµРЅР°", [
    `Р‘РѕС‚: ${ctx.botType}`,
    `Order: ${status.id}`,
    `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
  ]);
  if (ctx.botType === "claude") {
    await client.sendMessage(ctx.chatId, "Payment received.\nPrepare your Organization ID to start Claude Pro activation.");
    return sendClaudeIdInstructions(client, ctx, status.id);
  }
  if (ctx.botType === "chatgpt") {
    await client.sendMessage(ctx.chatId, "Payment received.\nSend account token to start ChatGPT Plus activation.");
    return sendChatgptTokenInstructions(client, ctx, status.id);
  }
  return client.sendMessage(ctx.chatId, "Payment received.\nActivation started.\nUsually takes a few minutes.", keyboardActivation(status.id));
}
async function sendActivationState(client: TelegramApiClient, ctx: OrderUserContext, orderId: string) {
  if (!isPrivateOrderChat(ctx)) return sendPrivateChatRequired(client, ctx);
  await logEvent("check_activation", { ...ctx, orderId });
  const status = await telegramOrdersService.getOrderStatus({ botType: ctx.botType, telegramUserId: ctx.telegramUserId, telegramChatId: ctx.chatId, telegramUsername: ctx.telegramUsername, orderId });
  if (status.status !== "PAID") return client.sendMessage(ctx.chatId, "Р—Р°РєР°Р· РµС‰С‘ РЅРµ РѕРїР»Р°С‡РµРЅ. РЎРЅР°С‡Р°Р»Р° РїРѕРґС‚РІРµСЂРґРёС‚Рµ РѕРїР»Р°С‚Сѓ.", keyboardMain());
  const activationInfo = await ordersService.getActivationForTelegram(status.id, ctx.telegramUserId).catch(() => null);
  if (activationInfo && String(activationInfo.deliveryMode || "").toLowerCase() === "vpn") {
    await sendLongMessage(client, ctx.chatId, buildTelegramOrderDetailsText({ order: status, activation: activationInfo }), keyboardActivation(status.id));
    return;
  }
  const proof = (await ordersService.getActivationProof(status.id, { forceCheck: true })) as any;
  const activationStatus = String(proof?.activation?.status || "");
  const providerMessage = String(proof?.activation?.lastProviderMessage || "").trim();
  if (activationStatus === "success") {
    await telegramOrdersService.clearOrderError(status.id);
    await logEvent("activation_success", { ...ctx, orderId: status.id, meta: { providerMessage } });
    await notifyAdmin("вњ… РђРєС‚РёРІР°С†РёСЏ СѓСЃРїРµС€РЅР°", [
      `Р‘РѕС‚: ${ctx.botType}`,
      `Order: ${status.id}`,
      `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
      providerMessage ? `Р РµР·СѓР»СЊС‚Р°С‚: ${providerMessage}` : "",
    ]);
    return client.sendMessage(
      ctx.chatId,
      ["Claude Pro activated successfully ?", "Check your Claude account.", "Do not forget to leave a review ??", providerMessage ? "Result: " + providerMessage : ""].filter(Boolean).join("\n"),
      keyboardActivationSuccess()
    );
  }
  if (activationStatus === "failed") {
    const errorText = providerMessage || "РџСЂРѕРІР°Р№РґРµСЂ РІРµСЂРЅСѓР» РѕС€РёР±РєСѓ Р°РєС‚РёРІР°С†РёРё.";
    await telegramOrdersService.setOrderError({ orderId: status.id, error: errorText });
    await logEvent("activation_failed", { ...ctx, orderId: status.id, meta: { error: errorText } });    await notifyAdmin("❌ Ошибка активации", [
      `Бот: ${ctx.botType}`,
      `Order: ${status.id}`,
      `Пользователь: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
      `Ошибка: ${errorText}`,
    ]);
    return client.sendMessage(ctx.chatId, [`РђРєС‚РёРІР°С†РёСЏ Р·Р°РІРµСЂС€РёР»Р°СЃСЊ РѕС€РёР±РєРѕР№.`, `РџСЂРёС‡РёРЅР°: ${errorText}`, `/token ${status.id} <РІР°С€_С‚РѕРєРµРЅ_РёР»Рё_id>`].join("\n"), keyboardActivation(status.id));
  }
  if (activationStatus === "processing") return client.sendMessage(ctx.chatId, "РђРєС‚РёРІР°С†РёСЏ РІ РїСЂРѕС†РµСЃСЃРµ. РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕР·Р¶Рµ.", keyboardActivation(status.id));
  return client.sendMessage(ctx.chatId, `РђРєС‚РёРІР°С†РёСЏ РµС‰С‘ РЅРµ Р·Р°РїСѓС‰РµРЅР°.\n/token ${status.id} <РІР°С€_С‚РѕРєРµРЅ_РёР»Рё_id>`, keyboardActivation(status.id));
}
async function handleToken(client: TelegramApiClient, ctx: OrderUserContext, text: string) {
  const parsed = parseTokenCommand(text);
  if (!parsed) return client.sendMessage(ctx.chatId, "Р¤РѕСЂРјР°С‚ РєРѕРјР°РЅРґС‹: /token <order_id> <С‚РѕРєРµРЅ_РёР»Рё_id>");
  if (!isPrivateOrderChat(ctx)) return sendPrivateChatRequired(client, ctx);
  let verifiedOrderId: string | null = null;
  await logEvent("token_submitted", { ...ctx, orderId: parsed.orderId });
  try {
    const order = await telegramOrdersService.getOrderStatus({ botType: ctx.botType, telegramUserId: ctx.telegramUserId, telegramChatId: ctx.chatId, telegramUsername: ctx.telegramUsername, orderId: parsed.orderId });
    verifiedOrderId = order.id;
    if (order.status !== "PAID") return client.sendMessage(ctx.chatId, "Р—Р°РєР°Р· РµС‰С‘ РЅРµ РѕРїР»Р°С‡РµРЅ. РЎРЅР°С‡Р°Р»Р° РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊ РѕРїР»Р°С‚СѓВ».");
    const validation = await ordersService.validateActivationTokenForTelegram(order.id, parsed.token, ctx.telegramUserId);
    if (!validation.ok) {
      const reason = (validation.reasons || []).join("; ") || "РўРѕРєРµРЅ РЅРµ РїСЂРѕС€С‘Р» РїСЂРѕРІРµСЂРєСѓ";
      await telegramOrdersService.setOrderError({ orderId: order.id, error: reason });
      await logEvent("token_rejected", { ...ctx, orderId: order.id, meta: { reason } });
      return client.sendMessage(ctx.chatId, `РўРѕРєРµРЅ РЅРµ РїСЂРёРЅСЏС‚: ${reason}`);
    }
    const result = await ordersService.startActivationForTelegram(order.id, parsed.token, ctx.telegramUserId);
    await telegramOrdersService.clearOrderError(order.id);
    await logEvent("activation_started", { ...ctx, orderId: order.id, meta: { taskId: result?.taskId || null } });
    return client.sendMessage(ctx.chatId, ["РўРѕРєРµРЅ РїСЂРёРЅСЏС‚.", "РђРєС‚РёРІР°С†РёСЏ Р·Р°РїСѓС‰РµРЅР°.", result?.taskId ? `Task ID: ${String(result.taskId)}` : ""].filter(Boolean).join("\n"), keyboardActivation(order.id));
  } catch (error) {
    const publicMessage = error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500 ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ Р°РєС‚РёРІР°С†РёСЋ. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР° РёР»Рё РѕР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ.";
    if (verifiedOrderId) {
      await telegramOrdersService.setOrderError({ orderId: verifiedOrderId, error: publicMessage });
      await logEvent("activation_start_failed", { ...ctx, orderId: verifiedOrderId, meta: { error: publicMessage } });
      await notifyAdmin("⚠️ Ошибка запуска активации", [
        `Бот: ${ctx.botType}`,
        `Order: ${verifiedOrderId}`,
        `Пользователь: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
        `Ошибка: ${publicMessage}`,
      ]);
    }
    return client.sendMessage(ctx.chatId, publicMessage);
  }
}
async function handleBuy(client: TelegramApiClient, config: BotConfig, ctx: OrderUserContext) {
  const session = getUserSession(ctx);
  const promoCode = normalizePromoCodeInput(session.promoCode || "") || undefined;
  updateUserSession(ctx, { pendingPromoInput: false });
  const created = await telegramOrdersService.createOrderFromTelegram({ botType: config.botType, telegramUserId: ctx.telegramUserId, telegramChatId: ctx.chatId, telegramUsername: ctx.telegramUsername, promoCode });
  await logEvent("order_created", { ...ctx, orderId: created.orderId, meta: { reused: created.reused, amount: Number(created.amount || 0), currency: created.currency, promoCode: created.promoCode || null, discountAmount: Number(created.discountAmount || 0) } });
  await notifyAdmin("рџ§ѕ РќРѕРІС‹Р№ Р·Р°РєР°Р· РёР· Telegram", [
    `Р‘РѕС‚: ${config.botType}`,
    `Order: ${created.orderId}`,
    `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
    `РЎСѓРјРјР°: ${formatMoney(Number(created.amount || 0), String(created.currency || "RUB"))}`,
    created.promoCode ? `Промокод: ${created.promoCode}` : "",
    Number(created.discountAmount || 0) > 0 ? `Скидка: ${formatMoney(Number(created.discountAmount || 0), String(created.currency || "RUB"))}` : "",
  ]);
  return client.sendMessage(
    ctx.chatId,
    [
      "Р—Р°РєР°Р· СЃРѕР·РґР°РЅ.",
      "РћРїР»Р°С‚РёС‚Рµ РїРѕ РєРЅРѕРїРєРµ РЅРёР¶Рµ.",
      "",
      `Order ID: ${created.orderId}`,
      created.promoCode ? `Промокод: ${created.promoCode}` : "",
      Number(created.discountAmount || 0) > 0 ? `Скидка: ${formatMoney(Number(created.discountAmount || 0), String(created.currency || "RUB"))}` : "",
      `РЎСѓРјРјР°: ${formatMoney(Number(created.amount || 0), String(created.currency || "RUB"))}`,
    ].filter(Boolean).join("\n"),
    keyboardPay(created.orderId, created.checkoutUrl)
  );
}

function userCtx(config: BotConfig, messageOrQuery: any, chatOverride?: unknown): OrderUserContext | null {
  const chatId = normalizeTelegramId(chatOverride ?? messageOrQuery?.chat?.id ?? messageOrQuery?.message?.chat?.id ?? messageOrQuery?.from?.id);
  const telegramUserId = normalizeTelegramId(messageOrQuery?.from?.id);
  const chatType = normalizeTelegramChatType(messageOrQuery?.chat?.type ?? messageOrQuery?.message?.chat?.type);
  if (!chatId || !telegramUserId) return null;
  return { botType: config.botType, chatId, telegramUserId, telegramUsername: normalizeTelegramUsername(messageOrQuery?.from?.username), chatType };
}

async function processUpdate(client: TelegramApiClient, config: BotConfig, update: TelegramUpdate) {
  if (update.message) {
    const text = String(update.message?.text || "").trim();
    if (!text) return;
    const ctx = userCtx(config, update.message);
    if (!ctx) return;
    const maskedMessageText = maskSensitiveMessage(text);
    await logEvent("message", { ...ctx, messageText: maskedMessageText });
    await notifyAdmin("👆 Действие в боте", [
      `Бот: ${config.botType}`,
      `Пользователь: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
      `Событие: ${detectMessageAction(text)}`,
      `Текст: ${maskedMessageText.slice(0, 160)}`,
    ]);
    if (/^\/start/i.test(text)) {
      const parsed = parseStartPayload(text);
      const isSiteOrderStart = Boolean(parseSiteOrderStartPayload(parsed.payload));
      if (isSiteOrderStart && !isPrivateOrderChat(ctx)) return handleSiteOrderStartPayload(client, ctx, parsed.payload);
      updateUserSession(ctx, { pendingPromoInput: false });
      await logEvent("lead_captured", {
        ...ctx,
        messageText: maskedMessageText,
        meta: {
          startPayload: isSiteOrderStart ? "<site_order_link>" : parsed.payload || null,
          attribution: parsed.attribution || null,
        },
      });
      await notifyAdmin("рџ‘¤ РќРѕРІС‹Р№ Р»РёРґ РІ Telegram Р±РѕС‚Рµ", [
        `Р‘РѕС‚: ${config.botType}`,
        `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
        parsed.attribution?.utm_source ? `РСЃС‚РѕС‡РЅРёРє: ${parsed.attribution.utm_source}` : "",
        parsed.attribution?.utm_campaign ? `РљР°РјРїР°РЅРёСЏ: ${parsed.attribution.utm_campaign}` : "",
        parsed.attribution?.src ? `SRC: ${parsed.attribution.src}` : "",
      ]);
      if (await handleSiteOrderStartPayload(client, ctx, parsed.payload)) return;
      return sendStart(client, config, ctx);
    }
    if (/^\/buy/i.test(text)) return sendPrePaymentAgreement(client, ctx);
    if (/^\/orders/i.test(text) || /^\/myorders/i.test(text) || /^\/purchases/i.test(text)) return sendOrders(client, ctx);
    if (/^\/faq/i.test(text)) return sendFaq(client, ctx);
    if (/^\/reviews/i.test(text)) return sendReviews(client, ctx);
    if (/^\/terms/i.test(text) || /^\/docs/i.test(text)) return sendDocs(client, ctx);
    if (/^\/language/i.test(text) || /^\/lang/i.test(text)) return sendLanguage(client, ctx);
    if (/^\/support/i.test(text)) return sendSupport(client, ctx);
    if (/^\/promo(?:@|\s|$)/i.test(text)) {
      const promoCode = parsePromoCommand(text);
      if (!promoCode) return sendPromoPrompt(client, ctx);
      return handlePromoInput(client, ctx, promoCode);
    }
    if (/^\/token(?:@|\s|$)/i.test(text)) return handleToken(client, ctx, text);
    if (/^\/check(?:@|\s|$)/i.test(text)) {
      const orderId = parseCheckCommand(text);
      if (!orderId) return client.sendMessage(ctx.chatId, "Р¤РѕСЂРјР°С‚ РєРѕРјР°РЅРґС‹: /check <order_id>");
      return sendActivationState(client, ctx, orderId);
    }
    if (getUserSession(ctx).pendingPromoInput) return handlePromoInput(client, ctx, text);
    return client.sendMessage(
      ctx.chatId,
      "/start\n/buy\n/orders\n/promo <code>\n/reviews\n/faq\n/docs\n/language\n/support\n/token <order_id> <token>\n/check <order_id>",
      keyboardMain()
    );
  }
  if (update.callback_query) {
    const query = update.callback_query;
    const callbackId = String(query.id || "").trim();
    const data = String(query.data || "").trim();
    const ctx = userCtx(config, query, query?.message?.chat?.id);
    if (!ctx) return;
    await logEvent("callback", { ...ctx, callbackData: data });
    await notifyAdmin("🖱 Клик по кнопке", [
      `Бот: ${config.botType}`,
      `Пользователь: ${ctx.telegramUsername ? `@${ctx.telegramUsername}` : ctx.telegramUserId}`,
      `Callback: ${data || "-"}`,
    ]);
    try {
      const [action, payload = ""] = data.split(":", 2);
      if (action === "buy") await sendPrePaymentAgreement(client, ctx);
      else if (action === "agree_buy") await handleBuy(client, config, ctx);
      else if (action === "promo_prompt") await sendPromoPrompt(client, ctx);
      else if (action === "promo_clear") {
        updateUserSession(ctx, { pendingPromoInput: false, promoCode: null });
        await logEvent("promo_cleared", ctx);
        await sendPrePaymentAgreement(client, ctx);
      }
      else if (action === "my_orders") await sendOrders(client, ctx);
      else if (action === "reviews") await sendReviews(client, ctx);
      else if (action === "faq") await sendFaq(client, ctx);
      else if (action === "support") await sendSupport(client, ctx);
      else if (action === "terms") await sendTerms(client, ctx);
      else if (action === "docs") await sendDocs(client, ctx);
      else if (action === "offer") await sendOffer(client, ctx);
      else if (action === "privacy") await sendPrivacyPolicy(client, ctx);
      else if (action === "refund_policy") await sendRefundPolicy(client, ctx);
      else if (action === "back_main") await sendStart(client, config, ctx);
      else if (action === "language") await sendLanguage(client, ctx);
      else if (action === "check_payment" && payload) await sendPaymentState(client, ctx, payload);
      else if (action === "check_activation" && payload) await sendActivationState(client, ctx, payload);
      else await client.sendMessage(ctx.chatId, "РљРѕРјР°РЅРґР° РЅРµ СЂР°СЃРїРѕР·РЅР°РЅР°.", keyboardMain());
      if (callbackId) await client.answerCallbackQuery(callbackId).catch(() => undefined);
    } catch {
      if (callbackId) await client.answerCallbackQuery(callbackId, "РћС€РёР±РєР°").catch(() => undefined);
    }
  }
}

async function runBotLoop(config: BotConfig) {
  const client = new TelegramApiClient(config.token, config.botType);
  while (true) {
    try {
      await client.deleteWebhook();
      const me = await client.getMe();
      console.info(`[tg-bot] bot started type=${config.botType} username=${String(me?.username || "")}`);
      await telegramBotEventsService.log({ botType: config.botType, eventType: "bot_started", meta: { username: String(me?.username || "") } });
      break;
    } catch (error) {
      console.error(`[tg-bot] startup failed type=${config.botType}`, error);
      await sleep(BOT_RETRY_DELAY_MS);
    }
  }
  let offset = Math.max(1, getStoredOffset(config.botType) + 1);
  while (true) {
    try {
      const updates = await client.getUpdates(offset);
      for (const update of updates) {
        await processUpdate(client, config, update).catch(() => undefined);
        const updateId = Number(update.update_id || 0);
        if (updateId > 0) {
          offset = updateId + 1;
          setStoredOffset(config.botType, updateId);
        }
      }
    } catch (error) {
      console.error(`[tg-bot] polling failed type=${config.botType}`, error);
      await sleep(BOT_RETRY_DELAY_MS);
    }
  }
}

function getBotsToRun() {
  const candidates: BotConfig[] = [
    { botType: "claude", serviceName: "Claude Pro РђРєС‚РёРІР°С†РёСЏ", token: String(env.TELEGRAM_CLAUDE_BOT_TOKEN || "").trim() },
    { botType: "chatgpt", serviceName: "ChatGPT Plus РђРєС‚РёРІР°С†РёСЏ", token: String(env.TELEGRAM_CHATGPT_BOT_TOKEN || "").trim() },
    { botType: "grok", serviceName: "SuperGrok РђРєС‚РёРІР°С†РёСЏ", token: String(env.TELEGRAM_GROK_BOT_TOKEN || "").trim() },
  ];
  return candidates.filter((item) => item.token);
}

export async function startTelegramBotsWorker() {
  if (!env.TELEGRAM_BOTS_ENABLED) {
    console.info("[tg-bot] worker disabled by TELEGRAM_BOTS_ENABLED=false");
    return false;
  }
  const bots = getBotsToRun();
  if (!bots.length) {
    console.warn("[tg-bot] worker enabled but no bot tokens configured");
    return false;
  }
  console.info(`[tg-bot] starting ${bots.length} bot(s): ${bots.map((b) => b.botType).join(", ")}`);
  await Promise.all(bots.map((bot) => runBotLoop(bot)));
  return true;
}


