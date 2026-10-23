import dns from "node:dns";
import { spawn } from "node:child_process";
dns.setDefaultResultOrder("ipv4first");
import fs from "node:fs";
import { execFileSync } from "node:child_process";
process.umask(0o077);
function readActivationFile() {
  return process.env.ACTIVATION_READER_SOCKET
    ? execFileSync("/usr/bin/curl", ["--fail", "--silent", "--max-time", "5", "--unix-socket", process.env.ACTIVATION_READER_SOCKET, "http://localhost/activations"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    : fs.readFileSync(ACTIVATION_STORE_FILE, "utf8");
}
import { createRequire } from "node:module";
import path from "node:path";
import crypto from "node:crypto";

const BOT_TOKEN = String(process.env.TELEGRAM_RECEIPT_BOT_TOKEN || "").trim();
const DATABASE_URL = String(process.env.STORE_DATABASE_URL || "").trim();
const PLATFORM_DATABASE_URL = String(process.env.PLATFORM_DATABASE_URL || "").trim();
const STATE_FILE = String(
  process.env.RECEIPT_BOT_STATE_FILE || "/var/lib/gptishka-runtime/receipt-bot-state.json"
).trim();
const USER_STATE_FILE = String(
  process.env.RECEIPT_BOT_USERS_FILE || `${STATE_FILE}.users.json`
).trim();
const OWNER_STATE_FILE = String(
  process.env.RECEIPT_BOT_OWNER_FILE || `${STATE_FILE}.owner.json`
).trim();
const BOOTSTRAP_ADMIN_IDS = new Set(
  String(process.env.RECEIPT_ADMIN_IDS || process.env.BOT_ADMIN_IDS || "")
    .split(/[\s,;]+/)
    .map((value) => normalizeTelegramId(value))
    .filter(Boolean)
);
const ACTIVATION_STORE_FILE = String(
  process.env.ACTIVATION_STORE_FILE || "/var/lib/gptishka-runtime/order-activations.json"
).trim();
const STORE_URL = String(process.env.GPTISHKA_STORE_URL || "https://gptishka.shop/").trim();
const SUPPORT_URL = String(process.env.GPTISHKA_SUPPORT_URL || "https://t.me/gptishkasupport").trim();
const SCAN_INTERVAL_MS = Math.max(5_000, Number(process.env.RECEIPT_SCAN_INTERVAL_MS || 10_000));

if (!BOT_TOKEN) {
  console.error("TELEGRAM_RECEIPT_BOT_TOKEN is missing");
  process.exit(1);
}
if (!DATABASE_URL || !PLATFORM_DATABASE_URL) {
  console.error("STORE_DATABASE_URL and PLATFORM_DATABASE_URL are required");
  process.exit(1);
}

const storeRequire = createRequire("/var/www/gptishka-new/package.json");
const platformRequire = createRequire(process.env.PLATFORM_CLIENT_PACKAGE || "/root/gptishka-platform-repo/shop-platform/package.json");
const { PrismaClient: StorePrismaClient } = storeRequire("@prisma/client");
const { PrismaClient: PlatformPrismaClient } = platformRequire("@prisma/client");
const prisma = new StorePrismaClient({ datasourceUrl: DATABASE_URL });
const platformDb = new PlatformPrismaClient({ datasourceUrl: PLATFORM_DATABASE_URL });

let offset = 0;
let stopping = false;
const recoveryAttempts = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeTelegramId(value) {
  const normalized = String(value ?? "").trim();
  return /^-?\d{4,20}$/.test(normalized) ? normalized : "";
}

function normalizeTelegramUsername(value) {
  const normalized = String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9_]{5,32}$/.test(normalized) ? normalized : "";
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatMoney(value, currency = "RUB") {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
  return String(currency).toUpperCase() === "RUB" ? `${formatted} ₽` : `${formatted} ${currency}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function providerLabel(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (provider.includes("pally")) return "Pally";
  if (provider.includes("lava")) return "Lava";
  if (provider.includes("enot") || provider.includes("gateway")) return "Онлайн-оплата";
  if (provider.includes("stripe")) return "Банковская карта";
  if (provider.includes("manual")) return "Подтверждено менеджером";
  return provider || "Онлайн-оплата";
}

function sourceLabel(order) {
  if (String(order.source || "").toLowerCase() !== "telegram") return "Сайт GPTishka Shop";
  const names = {
    chatgpt: "Telegram · ChatGPT",
    claude: "Telegram · Claude",
    grok: "Telegram · Grok",
    gptishka: "Telegram · GPTishka Shop",
  };
  return names[String(order.botType || "").toLowerCase()] || "Telegram · GPTishka Shop";
}

function isItunesOrder(order) {
  if (!order || order._system === "platform") return false;
  return (order.items || []).some((item) => {
    const slug = String(item?.product?.slug || item?.productRaw || "").trim().toLowerCase();
    return /^itunes(?:-|_|$)/.test(slug);
  });
}

function readItunesVoucher(order) {
  if (!isItunesOrder(order)) return "";
  try {
    const parsed = JSON.parse(readActivationFile());
    const record = Array.isArray(parsed?.items)
      ? parsed.items.find((item) => String(item?.orderId || "") === String(order.id || ""))
      : null;
    return String(record?.cdk || "").trim();
  } catch {
    return "";
  }
}

function isAdminId(value) {
  const id = normalizeTelegramId(value);
  if (!id) return false;
  const owner = readOwnerState();
  return owner.telegramId ? owner.telegramId === id : BOOTSTRAP_ADMIN_IDS.has(id);
}

function receiptKeyboard(chatId = "") {
  const rows = [
    [{ text: "🧾 Мои чеки", callback_data: "receipt:list" }],
    [
      { text: "🛍 Наш сайт", url: STORE_URL },
      { text: "💬 Поддержка", url: SUPPORT_URL },
    ],
  ];
  if (isAdminId(chatId)) rows.push([{ text: "⚙️ Админка", callback_data: "adm:home" }]);
  return {
    inline_keyboard: rows,
  };
}

async function tg(method, payload = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const proxy = String(process.env.TELEGRAM_RECEIPT_PROXY || "http://127.0.0.1:18082").trim();
  const runtimeDir = path.dirname(STATE_FILE);
  fs.mkdirSync(runtimeDir, { recursive: true });
  const bodyPath = path.join(runtimeDir, `telegram-request-${process.pid}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(bodyPath, JSON.stringify(payload), { mode: 0o600 });
  const escapeConfig = (value) => String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');

  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["--config", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const cleanup = () => {
      try { fs.unlinkSync(bodyPath); } catch {}
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      settled = true;
      cleanup();
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      const response = (() => {
        try { return JSON.parse(stdout); } catch { return {}; }
      })();
      if (code !== 0 || !response?.ok) {
        const description = String(response?.description || stderr || `curl exited with code ${code}`).trim();
        const error = new Error(description.slice(0, 500));
        error.status = Number(response?.error_code || 0);
        error.telegramCode = Number(response?.error_code || 0);
        reject(error);
        return;
      }
      resolve(response.result);
    });

    const config = [
      `url = "${escapeConfig(url)}"`,
      ...(proxy ? [`proxy = "${escapeConfig(proxy)}"`] : []),
      'request = "POST"',
      'header = "content-type: application/json"',
      `data-binary = "@${escapeConfig(bodyPath)}"`,
      "silent",
      "show-error",
      "connect-timeout = 10",
      "max-time = 40",
      "",
    ].join("\n");
    child.stdin.end(config);
  });
}

async function send(chatId, text, options = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...options,
  });
}

const storeOrderSelect = {
  id: true,
  email: true,
  status: true,
  source: true,
  botType: true,
  telegramUserId: true,
  telegramChatId: true,
  telegramUsername: true,
  paymentMethod: true,
  paymentId: true,
  orderDetails: true,
  subtotalAmount: true,
  discountAmount: true,
  totalAmount: true,
  currency: true,
  promoCodeSnapshot: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: { id: "asc" },
    select: {
      productRaw: true,
      price: true,
      quantity: true,
      product: { select: { title: true, slug: true } },
    },
  },
  payments: {
    where: { status: "SUCCESS" },
    orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
    take: 1,
    select: {
      provider: true,
      providerRef: true,
      amount: true,
      currency: true,
      processedAt: true,
      createdAt: true,
    },
  },
};

const platformOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  currency: true,
  amountRub: true,
  initialAmountRub: true,
  discountAmountRub: true,
  promoCodeText: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { telegramId: true, username: true } },
  product: { select: { titleRu: true, slug: true } },
  payment: {
    select: {
      provider: true,
      providerPaymentId: true,
      amountRub: true,
      paidAt: true,
      createdAt: true,
    },
  },
};

function receiptKey(order) {
  return `${order._system || "store"}:${order.id}`;
}

function detailsTelegramId(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  const candidates = [
    details.telegramUserId,
    details.telegramId,
    details.telegramChatId,
    details?.contact?.telegramUserId,
    details?.contact?.telegramId,
    details?.contact?.telegramChatId,
  ];
  for (const candidate of candidates) {
    const id = normalizeTelegramId(candidate);
    if (id) return id;
  }
  return "";
}

async function resolveOrderTelegramId(order) {
  if (order._system === "platform") return normalizeTelegramId(order.user?.telegramId);
  const direct = normalizeTelegramId(order.telegramChatId) || normalizeTelegramId(order.telegramUserId);
  if (direct) return direct;

  const synthetic = normalizeEmail(order.email).match(
    /^tg_(?:claude|chatgpt|grok|gptishka)_(-?\d+)@(?:gptishka\.)?telegram\.local$/
  );
  if (synthetic?.[1]) return synthetic[1];

  const detailsId = detailsTelegramId(order.orderDetails);
  if (detailsId) return detailsId;

  const email = normalizeEmail(order.email);
  if (!email || email.endsWith("@telegram.local")) return "";
  const customer = await prisma.customer.findUnique({
    where: { email },
    select: {
      telegramLink: {
        select: { telegramId: true, isActive: true, unlinkedAt: true },
      },
    },
  });
  if (customer?.telegramLink?.isActive && !customer.telegramLink.unlinkedAt) {
    return normalizeTelegramId(customer.telegramLink.telegramId);
  }
  return "";
}

function formatReceipt(order) {
  if (order._system === "platform") return formatPlatformReceipt(order);
  const payment = order.payments?.[0];
  const paidAt = payment?.processedAt || payment?.createdAt || order.updatedAt;
  const products = (order.items || []).map((item) => {
    const title = item.product?.title || item.productRaw || "Товар";
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitPrice = Number(item.price || 0);
    const itemTotal = unitPrice * quantity;
    return `• <b>${escapeHtml(title)}</b>\n  ${quantity} × ${formatMoney(unitPrice, order.currency)} = ${formatMoney(itemTotal, order.currency)}`;
  });
  const operationId = payment?.providerRef || order.paymentId || order.id;
  const discount = Number(order.discountAmount || 0);
  const itunesVoucher = readItunesVoucher(order);

  return [
    "🧾 <b>Чек об операции</b>",
    "✅ <b>Оплата успешно подтверждена</b>",
    "",
    `<b>Заказ:</b> <code>${escapeHtml(order.id)}</code>`,
    `<b>Дата оплаты:</b> ${formatDate(paidAt)}`,
    `<b>Источник:</b> ${escapeHtml(sourceLabel(order))}`,
    "",
    "<b>Состав заказа:</b>",
    products.length ? products.join("\n") : "• Товар по заказу",
    "",
    `<b>Сумма товаров:</b> ${formatMoney(order.subtotalAmount, order.currency)}`,
    ...(discount > 0 ? [`<b>Скидка:</b> −${formatMoney(discount, order.currency)}`] : []),
    `<b>Итого оплачено:</b> ${formatMoney(order.totalAmount, order.currency)}`,
    `<b>Способ оплаты:</b> ${escapeHtml(providerLabel(payment?.provider || order.paymentMethod))}`,
    `<b>ID операции:</b> <code>${escapeHtml(operationId)}</code>`,
    ...(itunesVoucher ? [
      "",
      "🎁 <b>Ваучер Apple Gift Card:</b>",
      `<code>${escapeHtml(itunesVoucher)}</code>`,
      "Используйте ваучер только для Apple ID региона США.",
    ] : []),
    "",
    "🛡 Платёж зафиксирован в системе GPTishka Shop. Сохраните это сообщение до получения товара или завершения активации.",
    "",
    "<i>Это информационный чек об операции. Фискальный документ, если он предусмотрен способом оплаты, формируется платёжным сервисом отдельно.</i>",
  ].join("\n");
}

function formatPlatformReceipt(order) {
  const paidAt = order.payment?.paidAt || order.paidAt || order.updatedAt;
  const operationId = order.payment?.providerPaymentId || order.id;
  const discount = Number(order.discountAmountRub || 0);
  const initial = Number(order.initialAmountRub || order.amountRub || 0);
  const total = Number(order.amountRub || 0);
  return [
    "🧾 <b>Чек об операции</b>",
    "✅ <b>Оплата успешно подтверждена</b>",
    "",
    `<b>Заказ:</b> #${Number(order.orderNumber)} · <code>${escapeHtml(order.id)}</code>`,
    `<b>Дата оплаты:</b> ${formatDate(paidAt)}`,
    "<b>Источник:</b> Telegram · GPTishka Shop",
    "",
    "<b>Состав заказа:</b>",
    `• <b>${escapeHtml(order.product?.titleRu || "Товар")}</b>\n  1 × ${formatMoney(total, order.currency)}`,
    "",
    `<b>Сумма товаров:</b> ${formatMoney(initial, order.currency)}`,
    ...(discount > 0 ? [`<b>Скидка:</b> −${formatMoney(discount, order.currency)}`] : []),
    `<b>Итого оплачено:</b> ${formatMoney(total, order.currency)}`,
    `<b>Способ оплаты:</b> ${escapeHtml(providerLabel(order.payment?.provider))}`,
    `<b>ID операции:</b> <code>${escapeHtml(operationId)}</code>`,
    "",
    "🛡 Платёж зафиксирован в системе GPTishka Shop. Сохраните это сообщение до получения товара или завершения активации.",
    "",
    "<i>Это информационный чек об операции. Фискальный документ, если он предусмотрен способом оплаты, формируется платёжным сервисом отдельно.</i>",
  ].join("\n");
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      initialized: Boolean(parsed?.initialized),
      lastScanAt: String(parsed?.lastScanAt || ""),
      deliveries: parsed?.deliveries && typeof parsed.deliveries === "object" ? parsed.deliveries : {},
    };
  } catch {
    return { initialized: false, lastScanAt: "", deliveries: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, STATE_FILE);
  fs.chmodSync(STATE_FILE, 0o600);
}

function readUserState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USER_STATE_FILE, "utf8"));
    return {
      users: parsed?.users && typeof parsed.users === "object" ? parsed.users : {},
      dailyStarts: parsed?.dailyStarts && typeof parsed.dailyStarts === "object" ? parsed.dailyStarts : {},
    };
  } catch {
    return { users: {}, dailyStarts: {} };
  }
}

function writeUserState(state) {
  fs.mkdirSync(path.dirname(USER_STATE_FILE), { recursive: true });
  const temporary = `${USER_STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, USER_STATE_FILE);
  fs.chmodSync(USER_STATE_FILE, 0o600);
}

function readOwnerState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(OWNER_STATE_FILE, "utf8"));
    return {
      telegramId: normalizeTelegramId(parsed?.telegramId),
      recoveryHash: /^[a-f0-9]{64}$/i.test(String(parsed?.recoveryHash || "")) ? String(parsed.recoveryHash).toLowerCase() : "",
      recoveryCreatedAt: String(parsed?.recoveryCreatedAt || ""),
      recoveredAt: String(parsed?.recoveredAt || ""),
    };
  } catch {
    return { telegramId: "", recoveryHash: "", recoveryCreatedAt: "", recoveredAt: "" };
  }
}

function writeOwnerState(state) {
  fs.mkdirSync(path.dirname(OWNER_STATE_FILE), { recursive: true });
  const temporary = `${OWNER_STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, OWNER_STATE_FILE);
  fs.chmodSync(OWNER_STATE_FILE, 0o600);
}

function ensureOwnerState() {
  const current = readOwnerState();
  if (current.telegramId) return current;
  const telegramId = [...BOOTSTRAP_ADMIN_IDS][0] || "";
  if (!telegramId) return current;
  const initialized = { telegramId, recoveryHash: "", recoveryCreatedAt: "", recoveredAt: "" };
  writeOwnerState(initialized);
  return initialized;
}

function activeAdminIds() {
  const owner = ensureOwnerState();
  return owner.telegramId ? [owner.telegramId] : [];
}

function moscowDay(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function recordStart(message) {
  const telegramId = normalizeTelegramId(message?.from?.id || message?.chat?.id);
  if (!telegramId) return;
  const now = new Date().toISOString();
  const state = readUserState();
  const previous = state.users[telegramId] || {};
  state.users[telegramId] = {
    telegramId,
    username: normalizeTelegramUsername(message?.from?.username) || previous.username || "",
    firstName: String(message?.from?.first_name || previous.firstName || "").slice(0, 100),
    lastName: String(message?.from?.last_name || previous.lastName || "").slice(0, 100),
    firstStartedAt: previous.firstStartedAt || now,
    lastStartedAt: now,
    startCount: Number(previous.startCount || 0) + 1,
  };
  const day = moscowDay();
  const daily = state.dailyStarts[day] || { total: 0, users: [] };
  daily.total = Number(daily.total || 0) + 1;
  daily.users = [...new Set([...(Array.isArray(daily.users) ? daily.users : []), telegramId])].slice(-10_000);
  state.dailyStarts[day] = daily;
  state.dailyStarts = Object.fromEntries(Object.entries(state.dailyStarts).sort(([a], [b]) => b.localeCompare(a)).slice(0, 180));
  writeUserState(state);
}

async function deliverReceipt(order, state, forcedTelegramId = "") {
  const key = receiptKey(order);
  const previous = state.deliveries[key] || {};
  if (previous.status === "sent" && !forcedTelegramId) return { ok: true, duplicate: true };
  if (isItunesOrder(order) && !readItunesVoucher(order)) {
    state.deliveries[key] = {
      ...previous,
      status: "waiting_for_voucher",
      lastAttemptAt: new Date().toISOString(),
    };
    return { ok: false, waiting: true, waitingForVoucher: true };
  }
  const telegramId = forcedTelegramId || (await resolveOrderTelegramId(order));
  if (!telegramId) {
    state.deliveries[key] = {
      ...previous,
      status: "waiting_for_telegram",
      lastAttemptAt: new Date().toISOString(),
    };
    return { ok: false, waiting: true };
  }

  try {
    const message = await send(telegramId, formatReceipt(order), { reply_markup: receiptKeyboard() });
    state.deliveries[key] = {
      status: "sent",
      telegramId,
      messageId: Number(message?.message_id || 0) || null,
      sentAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
    };
    return { ok: true };
  } catch (error) {
    const description = String(error?.message || error).slice(0, 300);
    const blocked = /blocked|chat not found|user is deactivated|bot can't initiate/i.test(description);
    state.deliveries[key] = {
      ...previous,
      status: blocked ? "waiting_for_start" : "retry",
      telegramId,
      lastError: description,
      lastAttemptAt: new Date().toISOString(),
    };
    return { ok: false, waiting: blocked };
  }
}

async function initializeState() {
  const state = readState();
  if (state.initialized) return state;
  const [storeExisting, platformExisting] = await Promise.all([
    prisma.order.findMany({
      where: { status: "PAID" },
      orderBy: { updatedAt: "desc" },
      take: 2_000,
      select: { id: true },
    }),
    platformDb.order.findMany({
      where: { paidAt: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 2_000,
      select: { id: true },
    }),
  ]);
  const now = new Date().toISOString();
  state.initialized = true;
  state.lastScanAt = now;
  for (const order of storeExisting) state.deliveries[`store:${order.id}`] ||= { status: "existing_before_connection", initializedAt: now };
  for (const order of platformExisting) state.deliveries[`platform:${order.id}`] ||= { status: "existing_before_connection", initializedAt: now };
  writeState(state);
  return state;
}

async function scanPaidOrders() {
  const state = await initializeState();
  const lastScan = Date.parse(state.lastScanAt || "");
  const since = new Date(Number.isFinite(lastScan) ? Math.max(0, lastScan - 60_000) : Date.now() - 60_000);
  const scanStartedAt = new Date();
  const [storeOrders, platformOrders] = await Promise.all([
    prisma.order.findMany({
      where: { status: "PAID", updatedAt: { gte: since } },
      orderBy: { updatedAt: "asc" },
      take: 1_000,
      select: storeOrderSelect,
    }),
    platformDb.order.findMany({
      where: { paidAt: { not: null }, updatedAt: { gte: since } },
      orderBy: { updatedAt: "asc" },
      take: 1_000,
      select: platformOrderSelect,
    }),
  ]);
  const orders = [
    ...storeOrders.map((order) => ({ ...order, _system: "store" })),
    ...platformOrders.map((order) => ({ ...order, _system: "platform" })),
  ].sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));

  for (const order of orders) {
    const delivery = state.deliveries[receiptKey(order)];
    if (!delivery || ["waiting_for_voucher", "waiting_for_telegram", "waiting_for_start", "retry"].includes(delivery.status)) {
      const lastAttempt = Date.parse(delivery?.lastAttemptAt || "");
      const retryDue = delivery?.status === "waiting_for_voucher" || !Number.isFinite(lastAttempt) || Date.now() - lastAttempt >= 15 * 60_000;
      if (!delivery || retryDue) await deliverReceipt(order, state);
    }
  }

  state.lastScanAt = scanStartedAt.toISOString();
  const ids = Object.entries(state.deliveries)
    .sort(([, left], [, right]) => String(right.sentAt || right.lastAttemptAt || "").localeCompare(String(left.sentAt || left.lastAttemptAt || "")))
    .slice(0, 5_000);
  state.deliveries = Object.fromEntries(ids);
  writeState(state);
}

async function ordersForTelegramUser(telegramId, take = 10) {
  const linkedEmails = await prisma.telegramLink.findMany({
    where: { telegramId, isActive: true, unlinkedAt: null },
    select: { customer: { select: { email: true } } },
  });
  const emails = linkedEmails.map((row) => normalizeEmail(row.customer.email)).filter(Boolean);
  const syntheticEmails = ["claude", "chatgpt", "grok", "gptishka"].flatMap((type) => [
    `tg_${type}_${telegramId}@telegram.local`,
    `tg_${type}_${telegramId}@gptishka.telegram.local`,
  ]);

  const [storeOrders, platformOrders] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: "PAID",
        OR: [
          { telegramUserId: telegramId },
          { telegramChatId: telegramId },
          { email: { in: [...syntheticEmails, ...emails], mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take,
      select: storeOrderSelect,
    }),
    platformDb.order.findMany({
      where: { user: { telegramId }, paidAt: { not: null } },
      orderBy: { updatedAt: "desc" },
      take,
      select: platformOrderSelect,
    }),
  ]);
  return [
    ...storeOrders.map((order) => ({ ...order, _system: "store" })),
    ...platformOrders.map((order) => ({ ...order, _system: "platform" })),
  ]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, take);
}

function adminHomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👥 Клиенты", callback_data: "adm:clients:0" }],
      [{ text: "🧾 Последние чеки", callback_data: "adm:receipts:0" }],
      [{ text: "🛡 Резервный доступ", callback_data: "adm:recovery" }],
      [{ text: "🔄 Обновить", callback_data: "adm:home" }],
      [{ text: "⬅️ В меню бота", callback_data: "adm:exit" }],
    ],
  };
}

function privateAdminCommands() {
  return [
    { command: "start", description: "Открыть бота чеков" },
    { command: "receipts", description: "Мои чеки и оплаченные заказы" },
    { command: "admin", description: "Админка чеков" },
    { command: "help", description: "Как получить чек" },
  ];
}

async function setPrivateAdminCommands(telegramId) {
  const id = normalizeTelegramId(telegramId);
  if (!id) return;
  await tg("setMyCommands", {
    scope: { type: "chat", chat_id: Number(id) },
    commands: privateAdminCommands(),
  });
}

async function showRecoveryAccess(chatId) {
  if (!isAdminId(chatId)) return;
  const owner = ensureOwnerState();
  await send(chatId, [
    "🛡 <b>Резервный доступ</b>",
    "",
    "Создайте одноразовый код и сохраните его вне Telegram: в менеджере паролей или на бумаге.",
    "",
    "Если вы потеряете аккаунт, отправьте новому аккаунту бота команду:",
    "<code>/recover ВАШ_КОД</code>",
    "",
    owner.recoveryHash
      ? `Текущий код активен с ${formatDate(owner.recoveryCreatedAt)}.`
      : "Активного резервного кода пока нет.",
    "После успешного восстановления старый аккаунт сразу потеряет доступ, а код будет аннулирован.",
  ].join("\n"), {
    reply_markup: { inline_keyboard: [
      [{ text: owner.recoveryHash ? "🔄 Заменить резервный код" : "🔐 Создать резервный код", callback_data: "adm:recovery:new" }],
      [{ text: "⬅️ Админка", callback_data: "adm:home" }],
    ] },
  });
}

async function createRecoveryCode(chatId) {
  if (!isAdminId(chatId)) return;
  const code = crypto.randomBytes(32).toString("base64url");
  const owner = ensureOwnerState();
  writeOwnerState({
    ...owner,
    recoveryHash: crypto.createHash("sha256").update(code, "utf8").digest("hex"),
    recoveryCreatedAt: new Date().toISOString(),
  });
  const message = await send(chatId, [
    "🔐 <b>Одноразовый код восстановления</b>",
    "",
    `<code>${code}</code>`,
    "",
    "Сохраните код вне Telegram. Он показывается только вам и заменяет любой ранее созданный код.",
    "Это сообщение автоматически удалится через 10 минут.",
  ].join("\n"), {
    protect_content: true,
    reply_markup: { inline_keyboard: [[{ text: "🗑 Я сохранил — удалить сообщение", callback_data: "adm:recovery:hide" }]] },
  });
  const messageId = Number(message?.message_id || 0);
  if (messageId) {
    const timer = setTimeout(() => tg("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => {}), 10 * 60_000);
    timer.unref?.();
  }
}

function recoveryAttemptAllowed(telegramId) {
  const id = normalizeTelegramId(telegramId);
  if (!id) return false;
  const now = Date.now();
  const previous = recoveryAttempts.get(id) || { count: 0, since: now };
  const current = now - previous.since > 30 * 60_000 ? { count: 0, since: now } : previous;
  if (current.count >= 5) return false;
  recoveryAttempts.set(id, { count: current.count + 1, since: current.since });
  return true;
}

async function recoverAdminAccess(message, code) {
  const newAdminId = normalizeTelegramId(message?.from?.id || message?.chat?.id);
  if (!newAdminId || message?.chat?.type !== "private" || !recoveryAttemptAllowed(newAdminId)) return;
  const owner = ensureOwnerState();
  const suppliedHash = crypto.createHash("sha256").update(String(code || ""), "utf8").digest("hex");
  if (!owner.recoveryHash || !crypto.timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(owner.recoveryHash))) return;

  const oldAdminId = owner.telegramId;
  writeOwnerState({ telegramId: newAdminId, recoveryHash: "", recoveryCreatedAt: "", recoveredAt: new Date().toISOString() });
  recoveryAttempts.delete(newAdminId);
  if (oldAdminId && oldAdminId !== newAdminId) {
    await tg("deleteMyCommands", { scope: { type: "chat", chat_id: Number(oldAdminId) } }).catch(() => {});
    await send(oldAdminId, "⚠️ Доступ к админке чеков перенесён на другой Telegram-аккаунт с использованием резервного кода.").catch(() => {});
  }
  await setPrivateAdminCommands(newAdminId).catch(() => {});
  await send(newAdminId, "✅ <b>Доступ восстановлен</b>\n\nЭтот Telegram-аккаунт теперь является единственным владельцем админки. Резервный код аннулирован — создайте новый и сохраните его офлайн.", { reply_markup: adminHomeKeyboard() });
}

function adminClientName(client) {
  if (client.username) return `@${client.username}`;
  const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
  return fullName || `ID ${client.telegramId}`;
}

async function adminClientRows() {
  const userState = readUserState();
  const deliveryState = readState();
  const rows = new Map();
  const touch = (telegramId, values = {}) => {
    const id = normalizeTelegramId(telegramId);
    if (!id) return;
    const previous = rows.get(id) || { telegramId: id, username: "", firstName: "", lastName: "", startCount: 0, receiptCount: 0, lastSeenAt: "" };
    rows.set(id, {
      ...previous,
      ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "" && value !== null && value !== undefined)),
      telegramId: id,
      startCount: Math.max(Number(previous.startCount || 0), Number(values.startCount || 0)),
      receiptCount: Number(previous.receiptCount || 0) + Number(values.receiptIncrement || 0),
      lastSeenAt: [previous.lastSeenAt, values.lastSeenAt].filter(Boolean).sort().at(-1) || "",
    });
  };

  for (const user of Object.values(userState.users)) touch(user.telegramId, user);
  for (const delivery of Object.values(deliveryState.deliveries || {})) {
    touch(delivery?.telegramId, { lastSeenAt: delivery?.sentAt || delivery?.lastAttemptAt || "" });
  }

  const [storeOrders, platformOrders] = await Promise.all([
    prisma.order.findMany({
      where: { status: "PAID", OR: [{ telegramUserId: { not: null } }, { telegramChatId: { not: null } }] },
      orderBy: { updatedAt: "desc" },
      take: 5_000,
      select: { telegramUserId: true, telegramChatId: true, telegramUsername: true, updatedAt: true },
    }),
    platformDb.order.findMany({
      where: { paidAt: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 5_000,
      select: { updatedAt: true, user: { select: { telegramId: true, username: true } } },
    }),
  ]);
  for (const order of storeOrders) {
    touch(order.telegramChatId || order.telegramUserId, {
      username: normalizeTelegramUsername(order.telegramUsername),
      receiptIncrement: 1,
      lastSeenAt: order.updatedAt?.toISOString?.() || String(order.updatedAt || ""),
    });
  }
  for (const order of platformOrders) {
    touch(order.user?.telegramId, {
      username: normalizeTelegramUsername(order.user?.username),
      receiptIncrement: 1,
      lastSeenAt: order.updatedAt?.toISOString?.() || String(order.updatedAt || ""),
    });
  }
  return [...rows.values()].sort((left, right) => String(right.lastSeenAt || right.lastStartedAt || "").localeCompare(String(left.lastSeenAt || left.lastStartedAt || "")));
}

async function showAdminHome(chatId) {
  if (!isAdminId(chatId)) return;
  const userState = readUserState();
  const today = userState.dailyStarts[moscowDay()] || { total: 0, users: [] };
  const [clients, storeReceipts, platformReceipts] = await Promise.all([
    adminClientRows(),
    prisma.order.count({ where: { status: "PAID" } }),
    platformDb.order.count({ where: { paidAt: { not: null } } }),
  ]);
  const totalStarts = Object.values(userState.users).reduce((sum, user) => sum + Number(user?.startCount || 0), 0);
  await send(chatId, [
    "⚙️ <b>Админка чеков</b>",
    "",
    `👥 Клиентов в боте: <b>${clients.length}</b>`,
    `▶️ Уникальных запусков: <b>${Object.keys(userState.users).length}</b>`,
    `🔁 Всего нажатий /start: <b>${totalStarts}</b>`,
    `📅 Сегодня: <b>${Number(today.total || 0)}</b> нажатий · <b>${Array.isArray(today.users) ? today.users.length : 0}</b> человек`,
    `🧾 Оплаченных чеков: <b>${storeReceipts + platformReceipts}</b>`,
    "",
    "Статистика нажатий считается с момента включения админки.",
  ].join("\n"), { reply_markup: adminHomeKeyboard() });
}

async function showAdminClients(chatId, page = 0) {
  if (!isAdminId(chatId)) return;
  const clients = await adminClientRows();
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(clients.length / pageSize));
  const current = Math.max(0, Math.min(Number(page) || 0, pages - 1));
  const selected = clients.slice(current * pageSize, (current + 1) * pageSize);
  const rows = selected.map((client) => [{
    text: `${adminClientName(client).slice(0, 28)} · ${client.receiptCount || 0} чек.`,
    callback_data: `adm:c:${client.telegramId}`,
  }]);
  const nav = [];
  if (current > 0) nav.push({ text: "⬅️", callback_data: `adm:clients:${current - 1}` });
  nav.push({ text: `${current + 1}/${pages}`, callback_data: "adm:noop" });
  if (current + 1 < pages) nav.push({ text: "➡️", callback_data: `adm:clients:${current + 1}` });
  rows.push(nav, [{ text: "⬅️ Админка", callback_data: "adm:home" }]);
  await send(chatId, `👥 <b>Клиенты</b>\n\nВсего найдено: <b>${clients.length}</b>\nВыберите клиента для просмотра его чеков.`, { reply_markup: { inline_keyboard: rows } });
}

function adminOrderLabel(order) {
  const title = order._system === "platform"
    ? order.product?.titleRu || "Товар"
    : order.items?.[0]?.product?.title || order.items?.[0]?.productRaw || "Товар";
  const amount = order._system === "platform" ? order.amountRub : order.totalAmount;
  return `${String(title).slice(0, 22)} · ${formatMoney(amount, order.currency)}`.slice(0, 55);
}

async function showAdminClient(chatId, telegramId) {
  if (!isAdminId(chatId)) return;
  const id = normalizeTelegramId(telegramId);
  if (!id) return showAdminClients(chatId, 0);
  const user = readUserState().users[id] || { telegramId: id };
  const orders = await ordersForTelegramUser(id, 20);
  const rows = orders.slice(0, 15).map((order) => [{
    text: `🧾 ${adminOrderLabel(order)}`,
    callback_data: `adm:r:${order._system === "platform" ? "p" : "s"}:${order.id}`,
  }]);
  rows.push([{ text: "⬅️ Клиенты", callback_data: "adm:clients:0" }], [{ text: "⚙️ Админка", callback_data: "adm:home" }]);
  await send(chatId, [
    "👤 <b>Карточка клиента</b>",
    "",
    `<b>Клиент:</b> ${escapeHtml(adminClientName({ ...user, telegramId: id }))}`,
    `<b>Telegram ID:</b> <code>${id}</code>`,
    `<b>Нажатий /start:</b> ${Number(user.startCount || 0)}`,
    `<b>Первый запуск:</b> ${user.firstStartedAt ? formatDate(user.firstStartedAt) : "—"}`,
    `<b>Последний запуск:</b> ${user.lastStartedAt ? formatDate(user.lastStartedAt) : "—"}`,
    `<b>Оплаченных чеков:</b> ${orders.length}${orders.length === 20 ? "+" : ""}`,
  ].join("\n"), { reply_markup: { inline_keyboard: rows } });
}

async function recentPaidOrders(take = 100) {
  const [storeOrders, platformOrders] = await Promise.all([
    prisma.order.findMany({ where: { status: "PAID" }, orderBy: { updatedAt: "desc" }, take, select: storeOrderSelect }),
    platformDb.order.findMany({ where: { paidAt: { not: null } }, orderBy: { updatedAt: "desc" }, take, select: platformOrderSelect }),
  ]);
  return [
    ...storeOrders.map((order) => ({ ...order, _system: "store" })),
    ...platformOrders.map((order) => ({ ...order, _system: "platform" })),
  ].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, take);
}

async function showAdminReceipts(chatId, page = 0) {
  if (!isAdminId(chatId)) return;
  const orders = await recentPaidOrders(100);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(orders.length / pageSize));
  const current = Math.max(0, Math.min(Number(page) || 0, pages - 1));
  const rows = orders.slice(current * pageSize, (current + 1) * pageSize).map((order) => [{
    text: `🧾 ${adminOrderLabel(order)}`,
    callback_data: `adm:r:${order._system === "platform" ? "p" : "s"}:${order.id}`,
  }]);
  const nav = [];
  if (current > 0) nav.push({ text: "⬅️", callback_data: `adm:receipts:${current - 1}` });
  nav.push({ text: `${current + 1}/${pages}`, callback_data: "adm:noop" });
  if (current + 1 < pages) nav.push({ text: "➡️", callback_data: `adm:receipts:${current + 1}` });
  rows.push(nav, [{ text: "⬅️ Админка", callback_data: "adm:home" }]);
  await send(chatId, `🧾 <b>Последние оплаченные чеки</b>\n\nПоказаны последние ${orders.length} операций.`, { reply_markup: { inline_keyboard: rows } });
}

async function showAdminReceipt(chatId, systemCode, orderId) {
  if (!isAdminId(chatId)) return;
  const isPlatform = systemCode === "p";
  const order = isPlatform
    ? await platformDb.order.findUnique({ where: { id: orderId }, select: platformOrderSelect })
    : await prisma.order.findUnique({ where: { id: orderId }, select: storeOrderSelect });
  if (!order || (isPlatform ? !order.paidAt : order.status !== "PAID")) {
    await send(chatId, "Чек не найден или заказ ещё не оплачен.", { reply_markup: adminHomeKeyboard() });
    return;
  }
  await send(chatId, formatReceipt({ ...order, _system: isPlatform ? "platform" : "store" }), {
    reply_markup: { inline_keyboard: [[{ text: "⬅️ Последние чеки", callback_data: "adm:receipts:0" }], [{ text: "⚙️ Админка", callback_data: "adm:home" }]] },
  });
}

async function showReceipts(chatId, { pendingOnly = false } = {}) {
  const telegramId = String(chatId);
  const state = await initializeState();
  const orders = await ordersForTelegramUser(telegramId);
  const selected = pendingOnly
    ? orders.filter((order) => ["waiting_for_voucher", "waiting_for_start", "waiting_for_telegram", "retry"].includes(state.deliveries[receiptKey(order)]?.status))
    : orders;

  if (!selected.length) {
    await send(
      chatId,
      pendingOnly
        ? "✅ Новых чеков для выдачи нет. Все найденные операции уже обработаны."
        : "🧾 <b>Мои чеки</b>\n\nОплаченных заказов, привязанных к вашему Telegram, пока не найдено. Для покупки на сайте используйте тот же Telegram, который привязан в личном кабинете.",
      { reply_markup: receiptKeyboard() }
    );
    return;
  }

  let waitingForVoucher = false;
  for (const order of selected) {
    const result = await deliverReceipt(order, state, telegramId);
    waitingForVoucher = waitingForVoucher || Boolean(result?.waitingForVoucher);
  }
  if (waitingForVoucher) {
    await send(chatId, "⏳ <b>Оплата подтверждена</b>\n\nВаучер подготавливается и появится в электронном чеке сразу после выдачи.", { reply_markup: receiptKeyboard() });
  }
  writeState(state);
}

async function claimWebsiteOrder(chatId, token) {
  const normalizedToken = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,56}$/.test(normalizedToken)) {
    await send(chatId, "⚠️ Ссылка на чек повреждена или устарела. Откройте страницу успешной оплаты ещё раз либо напишите в поддержку.", { reply_markup: receiptKeyboard() });
    return;
  }

  const redeemTokenHash = crypto.createHash("sha256").update(normalizedToken).digest("hex");
  let order = await prisma.order.findFirst({
    where: { redeemTokenHash },
    select: storeOrderSelect,
  });
  if (!order) {
    await send(chatId, "⚠️ Заказ по этой защищённой ссылке не найден. Проверьте, что открыли кнопку именно со страницы своего заказа.", { reply_markup: receiptKeyboard() });
    return;
  }

  const telegramId = String(chatId);
  const currentOwner = normalizeTelegramId(order.telegramChatId) || normalizeTelegramId(order.telegramUserId);
  if (currentOwner && currentOwner !== telegramId) {
    await send(chatId, "🛡 Этот заказ уже привязан к другому Telegram-аккаунту. Если это ваш заказ, обратитесь в поддержку — менеджер безопасно проверит данные.", { reply_markup: receiptKeyboard() });
    return;
  }

  if (!currentOwner) {
    order = await prisma.order.update({
      where: { id: order.id },
      data: { telegramUserId: telegramId, telegramChatId: telegramId },
      select: storeOrderSelect,
    });
  }
  order = { ...order, _system: "store" };

  if (String(order.status || "").toUpperCase() !== "PAID") {
    await send(chatId, "⏳ <b>Заказ привязан к вашему Telegram</b>\n\nПлатёж ещё подтверждается. Как только платёжная система отметит его успешным, чек придёт сюда автоматически — повторно оплачивать заказ не нужно.", { reply_markup: receiptKeyboard() });
    return;
  }

  const state = await initializeState();
  await deliverReceipt(order, state, telegramId);
  writeState(state);
}

async function claimRecentWebsiteOrdersByUsername(message) {
  const telegramId = normalizeTelegramId(message?.from?.id || message?.chat?.id);
  const username = normalizeTelegramUsername(message?.from?.username);
  if (!telegramId || !username) return 0;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.order.findMany({
    where: {
      status: "PAID",
      source: { not: "telegram" },
      telegramUserId: null,
      telegramChatId: null,
      createdAt: { gte: since },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, orderDetails: true },
  });

  const matchingIds = candidates
    .filter((order) => {
      const details = order.orderDetails;
      if (!details || typeof details !== "object" || Array.isArray(details)) return false;
      const savedUsername = normalizeTelegramUsername(
        details?.contact?.telegram || details?.telegramUsername || details?.contact?.telegramUsername
      );
      return savedUsername === username;
    })
    .map((order) => order.id);
  if (!matchingIds.length) return 0;

  const state = await initializeState();
  let claimed = 0;
  for (const orderId of matchingIds) {
    const updated = await prisma.order.updateMany({
      where: { id: orderId, telegramUserId: null, telegramChatId: null },
      data: { telegramUserId: telegramId, telegramChatId: telegramId, telegramUsername: username },
    });
    if (!updated.count) continue;
    claimed += updated.count;
    const key = "store:" + orderId;
    state.deliveries[key] = {
      ...(state.deliveries[key] || {}),
      status: "waiting_for_start",
      telegramId,
      linkedAt: new Date().toISOString(),
    };
  }
  if (claimed) writeState(state);
  return claimed;
}

async function showWelcome(chatId) {
  await send(
    chatId,
    "🧾 <b>Чеки GPTishka Shop</b>\n\nПосле успешной оплаты здесь автоматически появится чек с товаром, суммой, способом оплаты, датой и ID операции.\n\nБот видит только заказы, относящиеся к GPTishka Shop, и показывает их владельцу Telegram-аккаунта.",
    { reply_markup: receiptKeyboard(chatId) }
  );
  await showReceipts(chatId, { pendingOnly: true });
}

async function handleMessage(message) {
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!chatId || !text) return;
  const recoveryMatch = text.match(/^\/recover(?:@\w+)?\s+([A-Za-z0-9_-]{40,80})\s*$/);
  if (recoveryMatch) return recoverAdminAccess(message, recoveryMatch[1]);
  if (/^\/admin(?:@\w+)?(?:\s|$)/i.test(text)) {
    if (!isAdminId(message?.from?.id || chatId)) return;
    return showAdminHome(chatId);
  }
  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+receipt_([A-Za-z0-9_-]{16,56}))?\s*$/i);
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) recordStart(message);
  if (startMatch?.[1]) {
    await send(chatId, "🧾 <b>Получаем чек по вашему заказу</b>\n\nПроверяем защищённую ссылку и статус оплаты…", { reply_markup: receiptKeyboard() });
    return claimWebsiteOrder(chatId, startMatch[1]);
  }
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
    await claimRecentWebsiteOrdersByUsername(message).catch((error) =>
      console.error("automatic receipt linking failed", error?.message || error)
    );
    return showWelcome(chatId);
  }
  if (/^\/(?:receipts|checks|orders)(?:@\w+)?(?:\s|$)/i.test(text)) return showReceipts(chatId);
  if (/^\/help(?:@\w+)?(?:\s|$)/i.test(text)) return showWelcome(chatId);
  return showWelcome(chatId);
}

async function handleCallback(query) {
  const chatId = query?.message?.chat?.id;
  if (!chatId) return;
  await tg("answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});
  const data = String(query.data || "");
  if (data.startsWith("adm:")) {
    if (!isAdminId(query?.from?.id || chatId)) return;
    if (data === "adm:home") return showAdminHome(chatId);
    if (data === "adm:exit") return showWelcome(chatId);
    if (data === "adm:recovery") return showRecoveryAccess(chatId);
    if (data === "adm:recovery:new") return createRecoveryCode(chatId);
    if (data === "adm:recovery:hide") return tg("deleteMessage", { chat_id: chatId, message_id: query.message?.message_id }).catch(() => {});
    if (data === "adm:noop") return;
    let match = data.match(/^adm:clients:(\d+)$/);
    if (match) return showAdminClients(chatId, Number(match[1]));
    match = data.match(/^adm:c:(-?\d{4,20})$/);
    if (match) return showAdminClient(chatId, match[1]);
    match = data.match(/^adm:receipts:(\d+)$/);
    if (match) return showAdminReceipts(chatId, Number(match[1]));
    match = data.match(/^adm:r:([ps]):([A-Za-z0-9_-]{8,40})$/);
    if (match) return showAdminReceipt(chatId, match[1], match[2]);
    return;
  }
  if (data === "receipt:list") return showReceipts(chatId);
}

async function telegramLoop() {
  await tg("deleteWebhook", { drop_pending_updates: false }).catch(() => {});
  await Promise.allSettled([
    tg("setMyCommands", {
      commands: [
        { command: "start", description: "Открыть бота чеков" },
        { command: "receipts", description: "Мои чеки и оплаченные заказы" },
        { command: "help", description: "Как получить чек" },
      ],
    }),
    ...activeAdminIds().map((adminId) => tg("setMyCommands", {
      scope: { type: "chat", chat_id: Number(adminId) },
      commands: privateAdminCommands(),
    })),
    tg("setMyDescription", {
      description: "Электронные чеки по заказам GPTishka Shop. После оплаты здесь появятся товар, сумма, дата и ID операции.",
    }),
    tg("setMyShortDescription", { short_description: "Чеки и оплаченные заказы GPTishka Shop" }),
  ]);
  console.log("GPTishka receipt bot started");

  while (!stopping) {
    try {
      const updates = await tg("getUpdates", {
        timeout: 25,
        offset: offset + 1,
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of updates) {
        if (update.message) await handleMessage(update.message).catch((error) => console.error("message failed", error?.message || error));
        if (update.callback_query) await handleCallback(update.callback_query).catch((error) => console.error("callback failed", error?.message || error));
        offset = update.update_id;
      }
    } catch (error) {
      console.error("telegram polling failed", error?.message || error);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
}

async function scanLoop() {
  while (!stopping) {
    try {
      await scanPaidOrders();
    } catch (error) {
      console.error("receipt scan failed", error?.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([prisma.$disconnect(), platformDb.$disconnect()]);
}

async function selfTest() {
  const [storeOrder, platformOrder, claimProbe] = await Promise.all([
    prisma.order.findFirst({
      where: { status: "PAID" },
      orderBy: { updatedAt: "desc" },
      select: storeOrderSelect,
    }),
    platformDb.order.findFirst({
      where: { paidAt: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: platformOrderSelect,
    }),
    prisma.order.findFirst({
      where: { redeemTokenHash: "0".repeat(64) },
      select: { id: true },
    }),
  ]);
  const normalizedOrder = storeOrder ? { ...storeOrder, _system: "store" } : null;
  const normalizedPlatformOrder = platformOrder ? { ...platformOrder, _system: "platform" } : null;
  const telegramId = normalizedOrder ? await resolveOrderTelegramId(normalizedOrder) : "";
  const platformTelegramId = normalizedPlatformOrder ? await resolveOrderTelegramId(normalizedPlatformOrder) : "";
  console.log(JSON.stringify({
    ok: true,
    paidOrderFound: Boolean(normalizedOrder),
    orderId: normalizedOrder?.id || null,
    telegramResolved: Boolean(telegramId),
    itemCount: normalizedOrder?.items.length || 0,
    receiptLength: normalizedOrder ? formatReceipt(normalizedOrder).length : 0,
    platformPaidOrderFound: Boolean(normalizedPlatformOrder),
    platformOrderId: normalizedPlatformOrder?.id || null,
    platformTelegramResolved: Boolean(platformTelegramId),
    platformReceiptLength: normalizedPlatformOrder ? formatReceipt(normalizedPlatformOrder).length : 0,
    claimLookupReady: claimProbe === null,
  }));
}

process.on("SIGINT", () => stop().finally(() => process.exit(0)));
process.on("SIGTERM", () => stop().finally(() => process.exit(0)));

if (process.argv.includes("--self-test")) {
  selfTest()
    .then(() => Promise.allSettled([prisma.$disconnect(), platformDb.$disconnect()]))
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error(error);
      await Promise.allSettled([prisma.$disconnect(), platformDb.$disconnect()]);
      process.exit(1);
    });
} else {
  Promise.all([telegramLoop(), scanLoop()]).catch(async (error) => {
    console.error(error);
    await stop();
    process.exit(1);
  });
}
