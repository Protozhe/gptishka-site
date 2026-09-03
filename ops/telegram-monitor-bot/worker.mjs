import { exec as execCb } from "node:child_process";
import dns from "node:dns";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

dns.setDefaultResultOrder("ipv4first");

const exec = promisify(execCb);
const BOT_TOKEN = String(process.env.TELEGRAM_MONITOR_BOT_TOKEN || "").trim();
const ADMIN_IDS = String(process.env.TELEGRAM_MONITOR_ADMIN_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const STORE_DATABASE_URL = String(process.env.STORE_DATABASE_URL || "").trim();
const PLATFORM_DATABASE_URL = String(process.env.PLATFORM_DATABASE_URL || "").trim();
const WEB_ADMIN_URL = String(process.env.WEB_ADMIN_URL || "https://gptishka.shop/admin/").trim();
const STATE_FILE = String(process.env.ADMIN_BOT_STATE_FILE || "/var/lib/gptishka-runtime/admin-bot-state.json").trim();
const ACTIVATION_FILE = String(process.env.ORDER_ACTIVATIONS_FILE || "/var/lib/gptishka-runtime/order-activations.json").trim();
const NOTIFICATION_INTERVAL_MS = 15_000;

if (!BOT_TOKEN) {
  console.error("TELEGRAM_MONITOR_BOT_TOKEN is missing");
  process.exit(1);
}
if (!ADMIN_IDS.length) {
  console.error("TELEGRAM_MONITOR_ADMIN_IDS is missing; refusing to start an unrestricted admin bot");
  process.exit(1);
}
if (!STORE_DATABASE_URL || !PLATFORM_DATABASE_URL) {
  console.error("STORE_DATABASE_URL and PLATFORM_DATABASE_URL are required");
  process.exit(1);
}

const storeRequire = createRequire("/var/www/gptishka-new/package.json");
const platformRequire = createRequire("/root/gptishka-platform-repo/shop-platform/package.json");
const { PrismaClient: StorePrismaClient } = storeRequire("@prisma/client");
const { PrismaClient: PlatformPrismaClient } = platformRequire("@prisma/client");
const storeDb = new StorePrismaClient({ datasourceUrl: STORE_DATABASE_URL });
const platformDb = new PlatformPrismaClient({ datasourceUrl: PLATFORM_DATABASE_URL });

let offset = 0;
let stopping = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAllowed(userId) {
  return ADMIN_IDS.includes(String(userId));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatMoney(value, currency = "RUB") {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
  return currency === "RUB" ? `${formatted} ₽` : `${formatted} ${currency}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status) {
  const normalized = String(status || "").toUpperCase();
  return {
    PENDING: "⌛ Ожидает оплаты",
    PAID: "✅ Оплачен",
    FAILED: "❌ Ошибка",
    REFUNDED: "↩️ Возврат",
  }[normalized] || normalized || "—";
}

async function tg(method, payload = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const timeoutMs = method === "getUpdates" ? 38_000 : 15_000;
  let lastError = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await response.text();
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      if (response.ok && body?.ok) return body.result;
      lastError = new Error(body?.description || `Telegram ${method} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < 4) await delay(Math.min(4_000, attempt * 750));
  }

  throw lastError instanceof Error ? lastError : new Error(`Telegram ${method} failed`);
}

async function send(chatId, text, options = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options,
  });
}

function adminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📦 Заказы", callback_data: "admin:orders" },
        { text: "🤖 Из ботов", callback_data: "admin:telegram-orders" },
      ],
      [
        { text: "✅ Оплаченные", callback_data: "admin:paid" },
        { text: "💬 Обращения", callback_data: "admin:tickets" },
      ],
      [
        { text: "📊 Сводка", callback_data: "admin:stats" },
        { text: "🖥 Сервер", callback_data: "admin:server" },
      ],
      [{ text: "🌐 Открыть веб-админку", url: WEB_ADMIN_URL }],
    ],
  };
}

async function getServerStats() {
  const [{ stdout: disk }, { stdout: memory }, { stdout: pm2 }] = await Promise.all([
    exec("df -h /"),
    exec("free -h"),
    exec("pm2 list --no-color"),
  ]);
  return ["Server status:", "", "Disk:", disk.trim(), "", "Memory:", memory.trim(), "", "PM2:", pm2.trim()].join("\n");
}

const orderSelect = {
  id: true,
  status: true,
  source: true,
  botType: true,
  telegramUserId: true,
  telegramUsername: true,
  email: true,
  totalAmount: true,
  currency: true,
  createdAt: true,
  items: {
    take: 1,
    select: {
      productRaw: true,
      quantity: true,
      product: { select: { title: true, slug: true } },
    },
  },
};

async function listOrders({ telegramOnly = false, paidOnly = false, take = 10 } = {}) {
  return storeDb.order.findMany({
    where: {
      ...(telegramOnly ? { source: "telegram" } : {}),
      ...(paidOnly ? { status: "PAID" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: orderSelect,
  });
}

async function findOrder(orderId) {
  return storeDb.order.findUnique({ where: { id: String(orderId || "") }, select: orderSelect });
}

function orderProduct(order) {
  const item = order?.items?.[0];
  return item?.product?.title || item?.productRaw || "Товар";
}

function orderClient(order) {
  if (order?.telegramUsername) return `@${String(order.telegramUsername).replace(/^@+/, "")}`;
  if (order?.telegramUserId) return `ID ${order.telegramUserId}`;
  return order?.email || "клиент сайта";
}

function formatOrder(order, index) {
  const source = order.source === "telegram" ? `Telegram${order.botType ? ` · ${order.botType}` : ""}` : "Сайт";
  return [
    `<b>${index + 1}. ${escapeHtml(orderProduct(order))}</b>`,
    `${statusLabel(order.status)} · ${formatMoney(order.totalAmount, order.currency)}`,
    `${escapeHtml(source)} · ${escapeHtml(orderClient(order))} · ${formatDate(order.createdAt)}`,
    `<code>${escapeHtml(order.id)}</code>`,
  ].join("\n");
}

async function sendOrders(chatId, options = {}) {
  const orders = await listOrders(options);
  const title = options.telegramOnly
    ? "🤖 <b>Последние заказы из Telegram-ботов</b>"
    : options.paidOnly
      ? "✅ <b>Последние оплаченные заказы</b>"
      : "📦 <b>Последние заказы магазина</b>";
  const text = orders.length ? `${title}\n\n${orders.map(formatOrder).join("\n\n")}` : `${title}\n\nЗаказов пока нет.`;
  await send(chatId, text, { parse_mode: "HTML", reply_markup: adminKeyboard() });
}

async function listOpenTickets(take = 10) {
  return platformDb.supportTicket.findMany({
    where: { status: { in: ["open", "in_progress", "waiting_user"] } },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      subject: true,
      status: true,
      priority: true,
      updatedAt: true,
      user: { select: { telegramId: true, username: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
    },
  });
}

async function sendTickets(chatId) {
  const tickets = await listOpenTickets();
  const body = tickets.map((ticket, index) => {
    const username = ticket.user.username ? `@${String(ticket.user.username).replace(/^@+/, "")}` : `ID ${ticket.user.telegramId}`;
    const lastMessage = String(ticket.messages?.[0]?.body || "").replace(/\s+/g, " ").slice(0, 180);
    return [
      `<b>${index + 1}. ${escapeHtml(ticket.subject)}</b>`,
      `${escapeHtml(ticket.status)} · ${escapeHtml(ticket.priority)} · ${formatDate(ticket.updatedAt)}`,
      `${escapeHtml(username)}${lastMessage ? `\n${escapeHtml(lastMessage)}` : ""}`,
      `<code>${escapeHtml(ticket.id)}</code>`,
    ].join("\n");
  });
  await send(chatId, `💬 <b>Открытые обращения</b>\n\n${body.length ? body.join("\n\n") : "Открытых обращений нет."}`, {
    parse_mode: "HTML",
    reply_markup: adminKeyboard(),
  });
}

async function sendStats(chatId) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const [todayOrders, todayPaid, pendingOrders, telegramOrders, openTickets] = await Promise.all([
    storeDb.order.count({ where: { createdAt: { gte: dayStart } } }),
    storeDb.order.count({ where: { createdAt: { gte: dayStart }, status: "PAID" } }),
    storeDb.order.count({ where: { status: "PENDING" } }),
    storeDb.order.count({ where: { source: "telegram", createdAt: { gte: dayStart } } }),
    platformDb.supportTicket.count({ where: { status: { in: ["open", "in_progress", "waiting_user"] } } }),
  ]);
  await send(chatId, [
    "📊 <b>Сводка GPTishka Shop</b>",
    "",
    `🧾 Заказов сегодня: <b>${todayOrders}</b>`,
    `✅ Оплачено сегодня: <b>${todayPaid}</b>`,
    `🤖 Из Telegram сегодня: <b>${telegramOrders}</b>`,
    `⌛ Ожидают оплаты: <b>${pendingOrders}</b>`,
    `💬 Открытых обращений: <b>${openTickets}</b>`,
  ].join("\n"), { parse_mode: "HTML", reply_markup: adminKeyboard() });
}

async function showMenu(chatId) {
  await send(chatId, "🛡 <b>Админка GPTishka Shop</b>\n\nЗаказы, активации, остатки ключей, обращения клиентов и состояние сервера.\n\nВыберите раздел:", {
    parse_mode: "HTML",
    reply_markup: adminKeyboard(),
  });
}

async function dispatchAction(chatId, action) {
  if (action === "admin:orders") return sendOrders(chatId);
  if (action === "admin:telegram-orders") return sendOrders(chatId, { telegramOnly: true });
  if (action === "admin:paid") return sendOrders(chatId, { paidOnly: true });
  if (action === "admin:tickets") return sendTickets(chatId);
  if (action === "admin:stats") return sendStats(chatId);
  if (action === "admin:server") return send(chatId, await getServerStats());
  return showMenu(chatId);
}

async function handleMessage(message) {
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  const text = String(message?.text || "").trim();
  if (!chatId || !text) return;
  if (!isAllowed(userId)) return send(chatId, "Доступ запрещён.");
  if (/^\/(?:start|menu)(?:@\w+)?(?:\s|$)/i.test(text)) return showMenu(chatId);
  if (/^\/orders_tg(?:@\w+)?(?:\s|$)/i.test(text)) return sendOrders(chatId, { telegramOnly: true });
  if (/^\/orders(?:@\w+)?(?:\s|$)/i.test(text)) return sendOrders(chatId);
  if (/^\/paid(?:@\w+)?(?:\s|$)/i.test(text)) return sendOrders(chatId, { paidOnly: true });
  if (/^\/tickets(?:@\w+)?(?:\s|$)/i.test(text)) return sendTickets(chatId);
  if (/^\/stats(?:@\w+)?(?:\s|$)/i.test(text)) return sendStats(chatId);
  if (/^\/admin(?:@\w+)?(?:\s|$)/i.test(text)) {
    return send(chatId, "🌐 Веб-админка GPTishka Shop", {
      reply_markup: { inline_keyboard: [[{ text: "Открыть админку", url: WEB_ADMIN_URL }]] },
    });
  }
  if (/^\/ping(?:@\w+)?(?:\s|$)/i.test(text)) return send(chatId, "✅ Бот, база заказов и админка доступны.");
  if (/^\/server(?:@\w+)?(?:\s|$)/i.test(text)) return send(chatId, await getServerStats());
  return showMenu(chatId);
}

async function handleCallback(query) {
  const chatId = query?.message?.chat?.id;
  const userId = query?.from?.id;
  if (!chatId) return;
  if (!isAllowed(userId)) {
    await tg("answerCallbackQuery", { callback_query_id: query.id, text: "Доступ запрещён", show_alert: true });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});
  await dispatchAction(chatId, String(query.data || ""));
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      initialized: Boolean(parsed?.initialized),
      activationInitialized: Boolean(parsed?.activationInitialized),
      poolInitialized: Boolean(parsed?.poolInitialized),
      statuses: parsed?.statuses && typeof parsed.statuses === "object" ? parsed.statuses : {},
      activationStatuses: parsed?.activationStatuses && typeof parsed.activationStatuses === "object" ? parsed.activationStatuses : {},
      emptyKeyOrders: parsed?.emptyKeyOrders && typeof parsed.emptyKeyOrders === "object" ? parsed.emptyKeyOrders : {},
      poolAvailability: parsed?.poolAvailability && typeof parsed.poolAvailability === "object" ? parsed.poolAvailability : {},
    };
  } catch {
    return {
      initialized: false,
      activationInitialized: false,
      poolInitialized: false,
      statuses: {},
      activationStatuses: {},
      emptyKeyOrders: {},
      poolAvailability: {},
    };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, STATE_FILE);
  fs.chmodSync(STATE_FILE, 0o600);
}

async function notifyAdmins(text) {
  await Promise.all(ADMIN_IDS.map((chatId) => send(chatId, text, { parse_mode: "HTML", reply_markup: adminKeyboard() })));
}

async function pollOrderNotifications(state) {
  const orders = await listOrders({ take: 200 });
  if (!state.initialized) {
    state.initialized = true;
    state.statuses = Object.fromEntries(orders.map((order) => [order.id, String(order.status)]));
    writeState(state);
    return;
  }

  for (const order of [...orders].reverse()) {
    const previous = state.statuses[order.id];
    const current = String(order.status);
    let notification = "";
    if (!previous) notification = `🆕 <b>Новый заказ</b>\n\n${formatOrder(order, 0)}`;
    else if (previous !== current && current === "PAID") notification = `✅ <b>Оплата подтверждена</b>\n\n${formatOrder(order, 0)}`;
    else if (previous !== current && ["FAILED", "REFUNDED"].includes(current)) {
      notification = `⚠️ <b>Статус заказа изменён</b>\n\n${formatOrder(order, 0)}`;
    }

    if (notification) await notifyAdmins(notification);
    state.statuses[order.id] = current;
    if (notification) writeState(state);
  }

  const activeIds = new Set(orders.map((order) => order.id));
  for (const orderId of Object.keys(state.statuses)) {
    if (!activeIds.has(orderId)) delete state.statuses[orderId];
  }
  writeState(state);
}

function readActivationRecords() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ACTIVATION_FILE, "utf8").replace(/^\uFEFF/, ""));
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function activationState(record) {
  const status = String(record?.status || "issued").toLowerCase();
  const verification = String(record?.verificationState || "unknown").toLowerCase();
  if (status === "success" || verification === "success") return "success";
  if (status === "failed" || verification === "failed") return "failed";
  if (status === "processing" || verification === "pending") return "processing";
  return "issued";
}

async function activationNotification(record, result) {
  const order = await findOrder(record.orderId).catch(() => null);
  const product = order ? orderProduct(order) : String(record.productKey || "Товар");
  const client = order ? orderClient(order) : String(record.email || "клиент");
  const message = String(record.lastProviderMessage || "").trim();
  return [
    result === "success" ? "✅ <b>Активация успешна</b>" : "❌ <b>Активация завершилась ошибкой</b>",
    "",
    `Товар: <b>${escapeHtml(product)}</b>`,
    `Пул ключей: <code>${escapeHtml(record.productKey || "—")}</code>`,
    `Клиент: ${escapeHtml(client)}`,
    `Заказ: <code>${escapeHtml(record.orderId)}</code>`,
    message ? `Результат: ${escapeHtml(message).slice(0, 800)}` : "",
  ].filter(Boolean).join("\n");
}

async function emptyKeyNotification(record) {
  const order = await findOrder(record.orderId).catch(() => null);
  const product = order ? orderProduct(order) : String(record.productKey || "Товар");
  const client = order ? orderClient(order) : String(record.email || "клиент");
  return [
    "🚨 <b>Нет ключа для активации</b>",
    "",
    `Товар: <b>${escapeHtml(product)}</b>`,
    `Пустой пул: <code>${escapeHtml(record.productKey || "—")}</code>`,
    `Клиент: ${escapeHtml(client)}`,
    `Заказ: <code>${escapeHtml(record.orderId)}</code>`,
    "ID/токен клиента сохранён в админке. Добавьте ключ в нужный пул — активацию можно будет продолжить.",
  ].join("\n");
}

async function pollActivationNotifications(state) {
  const records = readActivationRecords();
  if (!state.activationInitialized) {
    state.activationInitialized = true;
    state.activationStatuses = Object.fromEntries(records.map((record) => [record.orderId, activationState(record)]));
    writeState(state);
  }

  for (const record of [...records].sort((a, b) => Date.parse(a.updatedAt || 0) - Date.parse(b.updatedAt || 0))) {
    const orderId = String(record?.orderId || "").trim();
    if (!orderId) continue;
    const previous = state.activationStatuses[orderId];
    const current = activationState(record);
    if (previous && previous !== current && ["success", "failed"].includes(current)) {
      await notifyAdmins(await activationNotification(record, current));
      state.activationStatuses[orderId] = current;
      writeState(state);
    } else if (!previous) {
      state.activationStatuses[orderId] = current;
    } else if (previous !== current) {
      state.activationStatuses[orderId] = current;
    }

    const tokenStored = Boolean(String(record.clientTokenStoredAt || "").trim());
    const keyMissing = !String(record.cdk || "").trim();
    if (tokenStored && keyMissing && !state.emptyKeyOrders[orderId]) {
      await notifyAdmins(await emptyKeyNotification(record));
      state.emptyKeyOrders[orderId] = new Date().toISOString();
      writeState(state);
    }
    if (!keyMissing && state.emptyKeyOrders[orderId]) delete state.emptyKeyOrders[orderId];
  }
  writeState(state);
}

async function readPoolAvailability() {
  const rows = await storeDb.licenseKey.findMany({
    select: { productKey: true, activationSiteUrl: true, status: true },
  });
  const pools = {};
  for (const row of rows) {
    const productKey = String(row.productKey || "").trim();
    const activationSiteUrl = String(row.activationSiteUrl || "").trim();
    const id = `${productKey}\u001f${activationSiteUrl}`;
    if (!pools[id]) pools[id] = { productKey, activationSiteUrl, available: 0, total: 0 };
    pools[id].total += 1;
    if (row.status === "available") pools[id].available += 1;
  }
  return pools;
}

async function pollKeyPoolNotifications(state) {
  const pools = await readPoolAvailability();
  if (!state.poolInitialized) {
    state.poolInitialized = true;
    state.poolAvailability = Object.fromEntries(Object.entries(pools).map(([id, pool]) => [id, pool.available]));
    writeState(state);
    return;
  }

  for (const [id, pool] of Object.entries(pools)) {
    const previous = Number(state.poolAvailability[id]);
    if (Number.isFinite(previous) && previous > 0 && pool.available === 0) {
      await notifyAdmins([
        "🚨 <b>Ключи товара закончились</b>",
        "",
        `Пул: <code>${escapeHtml(pool.productKey)}</code>`,
        pool.activationSiteUrl ? `Сайт активации: ${escapeHtml(pool.activationSiteUrl)}` : "",
        `Доступно: <b>0</b> из ${pool.total}`,
        "Добавьте новые ключи в этот конкретный пул в разделе SDK/CDK.",
      ].filter(Boolean).join("\n"));
    }
    state.poolAvailability[id] = pool.available;
  }
  writeState(state);
}

async function pollNotifications() {
  const state = readState();
  await pollOrderNotifications(state);
  await pollActivationNotifications(state);
  await pollKeyPoolNotifications(state);
}

async function notificationLoop() {
  while (!stopping) {
    try {
      await pollNotifications();
    } catch (error) {
      console.error("notification poll failed", error?.message || error);
    }
    await delay(NOTIFICATION_INTERVAL_MS);
  }
}

async function pollingLoop() {
  await tg("deleteWebhook", { drop_pending_updates: false }).catch(() => {});
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть админ-меню" },
      { command: "orders", description: "Последние заказы" },
      { command: "orders_tg", description: "Заказы из Telegram-ботов" },
      { command: "paid", description: "Последние оплаченные заказы" },
      { command: "tickets", description: "Обращения клиентов" },
      { command: "stats", description: "Сводка магазина" },
      { command: "admin", description: "Открыть веб-админку" },
      { command: "server", description: "Состояние сервера" },
    ],
  });
  console.log("GPTishka admin bot started with durable notifications");

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
      await delay(1_500);
    }
  }
}

async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([storeDb.$disconnect(), platformDb.$disconnect()]);
}

process.on("SIGINT", () => stop().finally(() => process.exit(0)));
process.on("SIGTERM", () => stop().finally(() => process.exit(0)));

Promise.all([pollingLoop(), notificationLoop()]).catch(async (error) => {
  console.error(error);
  await stop();
  process.exit(1);
});
