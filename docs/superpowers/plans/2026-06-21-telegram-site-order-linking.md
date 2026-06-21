# Telegram Site Order Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** связать заказы с сайта с Telegram-ботом GPTishka так, чтобы клиент после первого открытия бота видел все свои покупки вместе: сайт, Telegram, VPN-ключи, статусы активации и инструкции.

**Architecture:** используем уже существующие поля `Order.telegramUserId`, `Order.telegramChatId`, `Order.telegramUsername`, `Order.redeemTokenHash`; миграция БД для первой версии не нужна. Сайт создает защищенную Telegram deep-link ссылку вида `https://t.me/<bot>?start=order_<orderId>_<redeemToken>`, бот проверяет `redeemToken` по hash в заказе, привязывает заказ к Telegram user id и дальше показывает данные только этому Telegram-пользователю. Оплата, расчет промокодов, выдача CDK/VPN и checkout остаются в текущих сервисах.

**Tech Stack:** Node.js, TypeScript, Express, Prisma, Telegram Bot API, storefront vanilla JS, current GPTishka payment/order services.

---

## Scope boundaries

Что входит:

- Site order → Telegram binding through `/start order_<orderId>_<token>`.
- `/orders` in the GPTishka bot shows all linked purchases together, regardless of source: `site` or `telegram`.
- VPN orders show VLESS/access data in Telegram after payment.
- Activation orders show status and command/instruction for token submission.
- Site checkout response returns `telegram_url`.
- Success/activation pages expose a client-facing Telegram link.
- Product/payment/checkout price logic remains server-owned.

Что не входит:

- Bot token rotation.
- Full rewrite of the bot store catalog.
- Telegram DM by `@username` without user opening the bot. Telegram Bot API requires `chat_id`; the user must open the bot through the deep-link once.
- New product database model.
- New payment provider logic.

## File structure

Create:

- `apps/admin-backend/src/modules/orders/telegram-order-linking.ts`
  - Pure helpers for Telegram order deep-links, start payload parsing, Telegram id normalization, and redeem token hash verification.

- `apps/admin-backend/src/modules/telegram/telegram-order-messages.ts`
  - Pure message builders for order summaries, paid VPN access, activation status, manual fulfillment, and linking errors.

- `apps/admin-backend/src/modules/telegram/telegram-site-orders.test.ts`
  - Lightweight `node:assert` tests executed with `tsx`; no database required.

Modify:

- `apps/admin-backend/package.json`
  - Add a test script for the pure Telegram order-linking behavior.

- `apps/admin-backend/src/modules/orders/orders.service.ts`
  - Add trusted Telegram ownership access for activation/VPN reads and token activation, without weakening existing public `order_id + t` access.

- `apps/admin-backend/src/modules/orders/telegram-orders.service.ts`
  - Add `linkSiteOrderToTelegram`.
  - Change `listOrders` and `getOrderStatus` to include all orders owned by `telegramUserId`, not only `source = telegram`.

- `apps/admin-backend/src/modules/telegram/telegram.sender.ts`
  - Allow optional reply markup and add safe long-message splitting.

- `apps/admin-backend/src/modules/telegram/telegram.service.ts`
  - Handle `/start order_<orderId>_<token>`, `/orders`, `/check <orderId>`, and `/token <orderId> <clientToken>` for the unified bot.

- `apps/admin-backend/src/modules/telegram-bots/telegram-bots.worker.ts`
  - Keep existing product bot behavior, but make `/orders`, `/check`, and `/token` work with site-linked orders too by relying on the updated `telegramOrdersService`.

- `apps/admin-backend/src/modules/payments/public-payments.routes.ts`
  - Return `telegram_url` together with `activation_url`.

- `apps/admin-backend/src/modules/payments/public-enot.routes.ts`
  - Return `telegram_url` for the ENOT legacy route too.

- `assets/js/app.js`
  - Store `telegram_url` returned by checkout and expose it with the existing activation resume context.

- `assets/js/app.min.js`
  - Keep production storefront behavior in sync with `assets/js/app.js`.

- `success.html`
  - Add a visible “Открыть покупки в Telegram” action when `order_id` and `t` are present.

- `store/vpn/activate/index.html`
  - Add an optional Telegram action so the client can save/reopen VPN data through the bot.

- `chatgpt.html`, `claude.html`, `supergrok.html`, `store/vpn/index.html`, `index.html`
  - Update cache-bust query for `app.min.js` after JS changes.

---

### Task 1: Add pure Telegram order-linking helpers

**Files:**

- Create: `apps/admin-backend/src/modules/orders/telegram-order-linking.ts`
- Create: `apps/admin-backend/src/modules/telegram/telegram-site-orders.test.ts`
- Modify: `apps/admin-backend/package.json`

- [ ] **Step 1: Create helper module**

Create `apps/admin-backend/src/modules/orders/telegram-order-linking.ts` with this content:

```ts
import crypto from "crypto";
import { AppError } from "../../common/errors/app-error";

export type SiteOrderStartPayload = {
  orderId: string;
  orderToken: string;
};

export function normalizeTelegramIdForOrder(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^\d-]/g, "");
  if (!normalized) throw new AppError("Telegram user id is required", 400);
  return normalized;
}

export function normalizeTelegramUsernameForOrder(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 64);
  return normalized || null;
}

export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function verifyRedeemTokenHash(input: { expectedHash?: string | null; providedToken?: string | null }) {
  const expectedHash = String(input.expectedHash || "").trim();
  const providedToken = String(input.providedToken || "").trim();
  if (!expectedHash) throw new AppError("Order does not support Telegram linking", 409);
  if (!providedToken) throw new AppError("Order link token is required", 401);
  if (sha256Hex(providedToken) !== expectedHash) {
    throw new AppError("Invalid order link token", 403);
  }
}

export function parseSiteOrderStartPayload(payload: unknown): SiteOrderStartPayload | null {
  const raw = String(payload || "").trim();
  const match = raw.match(/^order_([a-zA-Z0-9]{8,64})_([a-zA-Z0-9_-]{16,256})$/);
  if (!match) return null;
  return {
    orderId: String(match[1] || "").trim(),
    orderToken: String(match[2] || "").trim(),
  };
}

export function buildSiteOrderTelegramDeepLink(input: {
  botUsername?: string | null;
  orderId: string;
  orderToken?: string | null;
}) {
  const username = String(input.botUsername || "").trim().replace(/^@+/, "");
  const orderId = String(input.orderId || "").trim();
  const orderToken = String(input.orderToken || "").trim();
  if (!username || !orderId || !orderToken) return "";
  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(`order_${orderId}_${orderToken}`)}`;
}
```

- [ ] **Step 2: Add pure helper tests**

Create `apps/admin-backend/src/modules/telegram/telegram-site-orders.test.ts` with this content:

```ts
import assert from "node:assert/strict";
import {
  buildSiteOrderTelegramDeepLink,
  parseSiteOrderStartPayload,
  sha256Hex,
  verifyRedeemTokenHash,
} from "../orders/telegram-order-linking";

function testParseOrderStartPayload() {
  assert.deepEqual(parseSiteOrderStartPayload("order_cmqjs5sbe000x9nw4696b343m_abcDEF_1234567890"), {
    orderId: "cmqjs5sbe000x9nw4696b343m",
    orderToken: "abcDEF_1234567890",
  });
  assert.equal(parseSiteOrderStartPayload("login_abc"), null);
  assert.equal(parseSiteOrderStartPayload("order_only"), null);
}

function testDeepLinkBuilder() {
  assert.equal(
    buildSiteOrderTelegramDeepLink({
      botUsername: "@GPTishka_myBot",
      orderId: "cmqjs5sbe000x9nw4696b343m",
      orderToken: "secret_token",
    }),
    "https://t.me/GPTishka_myBot?start=order_cmqjs5sbe000x9nw4696b343m_secret_token"
  );
  assert.equal(
    buildSiteOrderTelegramDeepLink({
      botUsername: "",
      orderId: "cmqjs5sbe000x9nw4696b343m",
      orderToken: "secret_token",
    }),
    ""
  );
}

function testRedeemTokenHashVerification() {
  const token = "safe_order_token";
  const hash = sha256Hex(token);
  assert.doesNotThrow(() => verifyRedeemTokenHash({ expectedHash: hash, providedToken: token }));
  assert.throws(() => verifyRedeemTokenHash({ expectedHash: hash, providedToken: "wrong" }), /Invalid order link token/);
  assert.throws(() => verifyRedeemTokenHash({ expectedHash: "", providedToken: token }), /does not support Telegram linking/);
}

testParseOrderStartPayload();
testDeepLinkBuilder();
testRedeemTokenHashVerification();

console.log("telegram-site-orders tests passed");
```

- [ ] **Step 3: Add test script**

Modify `apps/admin-backend/package.json` scripts block:

```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "dev:telegram-bots": "tsx watch src/telegram-bots.main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "start:telegram-bots": "node dist/telegram-bots.main.js",
    "restore:modal-backup": "node scripts/restore-product-modals-from-backup.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "seed": "tsx prisma/seed.ts",
    "bootstrap:user": "tsx scripts/upsert-admin-user.ts",
    "backfill:service-pages": "tsx scripts/backfill-service-pages.ts",
    "test:telegram-site-orders": "tsx src/modules/telegram/telegram-site-orders.test.ts",
    "test": "npm run test:telegram-site-orders"
  }
}
```

If the file contains additional scripts, keep them and only add `test:telegram-site-orders` and `test`.

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm run test:telegram-site-orders --workspace @gptishka/admin-backend
```

Expected:

```text
telegram-site-orders tests passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/admin-backend/package.json apps/admin-backend/src/modules/orders/telegram-order-linking.ts apps/admin-backend/src/modules/telegram/telegram-site-orders.test.ts
git commit -m "test: add telegram site order linking helpers"
```

---

### Task 2: Add safe Telegram-owned access to existing order activation/VPN service

**Files:**

- Modify: `apps/admin-backend/src/modules/orders/orders.service.ts`

- [ ] **Step 1: Add access context type near private order access helpers**

In `apps/admin-backend/src/modules/orders/orders.service.ts`, near `assertPaidOrderAccess`, add:

```ts
type OrderAccessContext = {
  orderToken?: string;
  telegramUserId?: string;
};

function normalizeTelegramOrderOwner(value: unknown) {
  return String(value || "").trim().replace(/[^\d-]/g, "");
}
```

- [ ] **Step 2: Replace token-only order access helper with token-or-Telegram-owner helper**

Replace:

```ts
async function assertPaidOrderAccess(orderId: string, orderToken?: string) {
  const order = await assertOrderTokenAccess(orderId, orderToken);
```

with:

```ts
async function assertPaidOrderAccess(orderId: string, access?: string | OrderAccessContext) {
  const order = await assertOrderAccess(orderId, access);
```

Replace:

```ts
async function assertOrderTokenAccess(orderId: string, orderToken?: string) {
  assertOrderId(orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);

  const expected = String(order.redeemTokenHash || "").trim();
  if (expected) {
    const provided = String(orderToken || "").trim();
    if (!provided) throw new AppError("Activation link token is required", 401);
    const providedHash = crypto.createHash("sha256").update(provided).digest("hex");
    if (providedHash !== expected) throw new AppError("Invalid activation link token", 403);
  }

  return order;
}
```

with:

```ts
function normalizeOrderAccess(access?: string | OrderAccessContext): OrderAccessContext {
  if (typeof access === "string") return { orderToken: access };
  return access || {};
}

async function assertOrderAccess(orderId: string, access?: string | OrderAccessContext) {
  assertOrderId(orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);

  const normalizedAccess = normalizeOrderAccess(access);
  const telegramUserId = normalizeTelegramOrderOwner(normalizedAccess.telegramUserId);
  if (telegramUserId && String(order.telegramUserId || "") === telegramUserId) {
    return order;
  }

  const expected = String(order.redeemTokenHash || "").trim();
  if (expected) {
    const provided = String(normalizedAccess.orderToken || "").trim();
    if (!provided) throw new AppError("Activation link token is required", 401);
    const providedHash = crypto.createHash("sha256").update(provided).digest("hex");
    if (providedHash !== expected) throw new AppError("Invalid activation link token", 403);
  }

  return order;
}

async function assertOrderTokenAccess(orderId: string, orderToken?: string) {
  return assertOrderAccess(orderId, { orderToken });
}
```

- [ ] **Step 3: Update private token-flow helpers to accept access context**

Change function signatures:

```ts
async function ensureActivationRecordForTokenFlow(orderId: string, orderToken?: string, activationInfo?: any)
async function startActivationUnsafe(orderId: string, token: string, orderToken?: string)
```

to:

```ts
async function ensureActivationRecordForTokenFlow(orderId: string, access?: string | OrderAccessContext, activationInfo?: any)
async function startActivationUnsafe(orderId: string, token: string, access?: string | OrderAccessContext)
```

Inside both functions, preserve existing behavior by passing `access` into `getActivation`, `assertPaidOrderAccess`, and `ensureActivationRecordForTokenFlow`.

The key replacement pattern is:

```ts
const order = await assertPaidOrderAccess(orderId, access);
```

and:

```ts
const activationInfo = await ordersService.getActivationWithAccess(orderId, access);
```

- [ ] **Step 4: Add service wrappers for trusted Telegram owner**

Inside exported `ordersService`, add methods next to existing activation methods:

```ts
async getActivationWithAccess(orderId: string, access?: string | OrderAccessContext) {
  const order = await assertPaidOrderAccess(orderId, access);
  return this.buildActivationPayloadForPaidOrder(order.id);
},

async getActivationForTelegram(orderId: string, telegramUserId: string) {
  return this.getActivationWithAccess(orderId, { telegramUserId });
},

async validateActivationTokenForTelegram(orderId: string, token: string, telegramUserId: string) {
  return this.validateActivationTokenWithAccess(orderId, token, { telegramUserId });
},

async startActivationForTelegram(orderId: string, token: string, telegramUserId: string) {
  return this.startActivationWithAccess(orderId, token, { telegramUserId });
},
```

Then refactor existing public methods to use shared internal methods:

```ts
async getActivation(orderId: string, orderToken?: string) {
  return this.getActivationWithAccess(orderId, { orderToken });
},

async startActivation(orderId: string, token: string, orderToken?: string) {
  return this.startActivationWithAccess(orderId, token, { orderToken });
},

async startActivationWithAccess(orderId: string, token: string, access?: string | OrderAccessContext) {
  const activationInfo = (await this.getActivationWithAccess(orderId, access)) as any;
  assertTokenActivationDeliveryMode(activationInfo);
  return withActivationOrderLock(orderId, async () => startActivationUnsafe(orderId, token, access));
},

async validateActivationToken(orderId: string, token: string, orderToken?: string) {
  return this.validateActivationTokenWithAccess(orderId, token, { orderToken });
},

async validateActivationTokenWithAccess(orderId: string, token: string, access?: string | OrderAccessContext) {
  const activationInfo = (await this.getActivationWithAccess(orderId, access)) as any;
  assertTokenActivationDeliveryMode(activationInfo);
  const stored = await ensureActivationRecordForTokenFlow(orderId, access, activationInfo);
  // Keep the current validation body below this line unchanged.
}
```

Extract the current body of `getActivation` after:

```ts
const order = await assertPaidOrderAccess(orderId, orderToken);
```

into:

```ts
async buildActivationPayloadForPaidOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);
  // Existing getActivation body continues here, using `order`.
}
```

This preserves public site behavior while letting Telegram owner access the same payload without storing raw `redeemToken`.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build:admin:api
```

Expected: TypeScript compilation completes without errors.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/admin-backend/src/modules/orders/orders.service.ts
git commit -m "feat: allow telegram-owned order activation access"
```

---

### Task 3: Link site orders to Telegram user and list all purchases together

**Files:**

- Modify: `apps/admin-backend/src/modules/orders/telegram-orders.service.ts`

- [ ] **Step 1: Import helpers**

At the top of `apps/admin-backend/src/modules/orders/telegram-orders.service.ts`, add:

```ts
import {
  normalizeTelegramIdForOrder,
  normalizeTelegramUsernameForOrder,
  verifyRedeemTokenHash,
} from "./telegram-order-linking";
```

- [ ] **Step 2: Reuse shared normalization**

Replace local `normalizeTelegramId` and `normalizeTelegramUsername` bodies with:

```ts
function normalizeTelegramId(value: unknown) {
  return normalizeTelegramIdForOrder(value);
}

function normalizeTelegramUsername(value: unknown) {
  return normalizeTelegramUsernameForOrder(value);
}
```

- [ ] **Step 3: Extract row presenter for Telegram order status**

Add this helper above `export const telegramOrdersService`:

```ts
function mapTelegramOrderRow(row: any) {
  const activation = activationStore.findByOrderId(row.id);
  const lastPayment = row.payments?.[0] || null;
  const product = row.items?.[0]?.product || null;
  const productTags = Array.isArray(product?.tags) ? product.tags : [];
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    botType: row.botType,
    telegramUserId: row.telegramUserId,
    telegramUsername: row.telegramUsername,
    telegramChatId: row.telegramChatId,
    amount: Number(row.totalAmount),
    discountAmount: Number(row.discountAmount),
    promoCode: row.promoCodeSnapshot || null,
    currency: row.currency,
    productTitle: String(product?.title || row.items?.[0]?.productRaw || ""),
    deliveryType: resolveProductDeliveryType(productTags),
    paymentStatus: lastPayment?.status || null,
    paymentProvider: lastPayment?.provider || null,
    paymentRef: lastPayment?.providerRef || null,
    paidAt: lastPayment?.processedAt || null,
    paymentProcessedAt: lastPayment?.processedAt || null,
    checkoutUrl: extractCheckoutUrlFromPayload(lastPayment?.payload),
    activationStatus: activation?.status || null,
    activationVerificationState: activation?.verificationState || null,
    activationTaskId: activation?.taskId || null,
    activationMessage: activation?.lastProviderMessage || null,
    activationUpdatedAt: activation?.updatedAt || null,
    createdAt: row.createdAt,
  };
}
```

- [ ] **Step 4: Change `listOrders` to include site-linked orders**

Replace the `where` block in `listOrders`:

```ts
where: {
  source: "telegram",
  botType: input.botType,
  telegramUserId,
},
```

with:

```ts
where: {
  telegramUserId,
},
```

Replace the `rows.map` body with:

```ts
return rows.map(mapTelegramOrderRow);
```

- [ ] **Step 5: Change `getOrderStatus` to include site-linked orders**

Replace the `where` block in `getOrderStatus`:

```ts
where: {
  id: orderId,
  source: "telegram",
  botType: input.botType,
  telegramUserId,
},
```

with:

```ts
where: {
  id: orderId,
  telegramUserId,
},
```

Replace the returned object construction with:

```ts
return mapTelegramOrderRow(row);
```

- [ ] **Step 6: Add `linkSiteOrderToTelegram`**

Inside `telegramOrdersService`, add this method before `setOrderError`:

```ts
async linkSiteOrderToTelegram(
  input: TelegramOrderContext & {
    orderId: string;
    orderToken: string;
  }
) {
  const telegramUserId = normalizeTelegramId(input.telegramUserId);
  const telegramChatId = normalizeTelegramId(input.telegramChatId);
  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);
  const orderId = String(input.orderId || "").trim();
  const orderToken = String(input.orderToken || "").trim();
  if (!orderId) throw new AppError("Order id is required", 400);

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { product: true },
        orderBy: { id: "asc" },
        take: 1,
      },
      payments: {
        select: {
          status: true,
          provider: true,
          providerRef: true,
          payload: true,
          processedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!existing) throw new AppError("Order not found", 404);
  verifyRedeemTokenHash({
    expectedHash: existing.redeemTokenHash,
    providedToken: orderToken,
  });

  const currentTelegramOwner = String(existing.telegramUserId || "").trim();
  if (currentTelegramOwner && currentTelegramOwner !== telegramUserId) {
    throw new AppError("Order is already linked to another Telegram account", 409);
  }

  const linked = await prisma.order.update({
    where: { id: existing.id },
    data: {
      telegramUserId,
      telegramChatId,
      telegramUsername,
      telegramLastError: null,
    },
    include: {
      items: {
        include: { product: true },
        orderBy: { id: "asc" },
        take: 1,
      },
      payments: {
        select: {
          status: true,
          provider: true,
          providerRef: true,
          payload: true,
          processedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return mapTelegramOrderRow(linked);
},
```

- [ ] **Step 7: Run build and tests**

Run:

```bash
npm run test:telegram-site-orders --workspace @gptishka/admin-backend
npm run build:admin:api
```

Expected:

```text
telegram-site-orders tests passed
```

and TypeScript build passes.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/admin-backend/src/modules/orders/telegram-orders.service.ts
git commit -m "feat: link site orders to telegram users"
```

---

### Task 4: Add Telegram message rendering for unified purchase cabinet

**Files:**

- Create: `apps/admin-backend/src/modules/telegram/telegram-order-messages.ts`
- Modify: `apps/admin-backend/src/modules/telegram/telegram-site-orders.test.ts`

- [ ] **Step 1: Create message builders**

Create `apps/admin-backend/src/modules/telegram/telegram-order-messages.ts`:

```ts
type OrderSummary = {
  id: string;
  status: string;
  productTitle?: string | null;
  amount?: number | null;
  currency?: string | null;
  promoCode?: string | null;
  deliveryType?: string | null;
  activationStatus?: string | null;
  createdAt?: Date | string | null;
  paidAt?: Date | string | null;
};

type ActivationPayload = {
  deliveryMode?: string | null;
  status?: string | null;
  message?: string | null;
  accessLink?: string | null;
  deeplinkUrl?: string | null;
  subscriptionConfig?: unknown;
  expiresAt?: Date | string | null;
  plan?: string | null;
  supportUrl?: string | null;
  supportEmail?: string | null;
  credentials?: {
    login?: string | null;
    password?: string | null;
  } | null;
  activationFlow?: string | null;
  verificationState?: string | null;
  lastProviderMessage?: string | null;
};

function formatMoney(amount: unknown, currency: unknown) {
  const value = Number(amount || 0);
  const code = String(currency || "RUB").toUpperCase();
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: code }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

function formatDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
}

function orderStatusLabel(status: unknown) {
  const value = String(status || "").toUpperCase();
  if (value === "PAID") return "оплачен";
  if (value === "FAILED") return "ошибка оплаты";
  if (value === "REFUNDED") return "возврат";
  return "ожидает оплату";
}

export function buildTelegramOrdersText(orders: OrderSummary[]) {
  if (!orders.length) {
    return [
      "🛒 Мои покупки GPTishka",
      "",
      "Покупок пока нет.",
      "Если вы оплатили заказ на сайте, откройте Telegram-ссылку после оплаты, чтобы привязать покупку.",
    ].join("\n");
  }

  const blocks = orders.map((order, index) => {
    const status = String(order.status || "").toUpperCase();
    return [
      `${index + 1}. ${order.productTitle || "Товар GPTishka"}`,
      `Заказ: ${order.id}`,
      `Статус: ${orderStatusLabel(status)}`,
      `Сумма: ${formatMoney(order.amount || 0, order.currency || "RUB")}`,
      order.promoCode ? `Промокод: ${order.promoCode}` : "",
      order.deliveryType ? `Тип выдачи: ${order.deliveryType}` : "",
      order.activationStatus ? `Активация: ${order.activationStatus}` : "",
      status === "PAID" ? `Оплачен: ${formatDate(order.paidAt || order.createdAt)}` : `Создан: ${formatDate(order.createdAt)}`,
      status === "PAID" ? `Данные: /check ${order.id}` : "",
    ].filter(Boolean).join("\n");
  });

  return ["🛒 Мои покупки GPTishka", "", ...blocks].join("\n\n");
}

export function buildTelegramLinkedOrderText(order: OrderSummary) {
  return [
    "✅ Заказ привязан к Telegram",
    "",
    `${order.productTitle || "Товар GPTishka"}`,
    `Заказ: ${order.id}`,
    `Статус: ${orderStatusLabel(order.status)}`,
    `Сумма: ${formatMoney(order.amount || 0, order.currency || "RUB")}`,
    "",
    String(order.status || "").toUpperCase() === "PAID"
      ? `Чтобы открыть данные заказа, отправьте: /check ${order.id}`
      : "После подтверждения оплаты бот покажет данные заказа здесь.",
  ].join("\n");
}

export function buildTelegramOrderDetailsText(input: { order: OrderSummary; activation?: ActivationPayload | null }) {
  const order = input.order;
  const activation = input.activation || null;
  const deliveryMode = String(activation?.deliveryMode || order.deliveryType || "").toLowerCase();

  if (String(order.status || "").toUpperCase() !== "PAID") {
    return [
      "Заказ еще не оплачен.",
      "",
      `${order.productTitle || "Товар GPTishka"}`,
      `Заказ: ${order.id}`,
      `Статус: ${orderStatusLabel(order.status)}`,
    ].join("\n");
  }

  if (deliveryMode === "vpn") {
    return [
      "🔐 GPTishka VPN",
      "",
      `${order.productTitle || "VPN-доступ"}`,
      `Заказ: ${order.id}`,
      activation?.plan ? `Тариф: ${activation.plan}` : "",
      activation?.expiresAt ? `Действует до: ${formatDate(activation.expiresAt)}` : "",
      "",
      "Ключ VLESS:",
      String(activation?.accessLink || "Ключ еще не выдан. Проверьте заказ через 1-2 минуты."),
      activation?.deeplinkUrl ? ["", "Deep-link:", String(activation.deeplinkUrl)].join("\n") : "",
      "",
      "Если потеряете ключ, отправьте /orders или /check " + order.id,
    ].filter(Boolean).join("\n");
  }

  if (deliveryMode === "credentials") {
    return [
      "🔑 Данные для входа",
      "",
      `${order.productTitle || "Товар GPTishka"}`,
      `Заказ: ${order.id}`,
      "",
      `Логин: ${activation?.credentials?.login || "данные готовятся"}`,
      `Пароль: ${activation?.credentials?.password || "данные готовятся"}`,
      "",
      activation?.message || "Сохраните данные в безопасном месте.",
    ].join("\n");
  }

  if (deliveryMode === "manual_login") {
    return [
      "👤 Заявка передана менеджеру",
      "",
      `${order.productTitle || "Товар GPTishka"}`,
      `Заказ: ${order.id}`,
      "",
      activation?.message ||
        "Менеджер подключит подписку вручную и свяжется с вами по указанным контактам.",
    ].join("\n");
  }

  return [
    "⚙️ Активация подписки",
    "",
    `${order.productTitle || "Товар GPTishka"}`,
    `Заказ: ${order.id}`,
    activation?.status ? `Статус: ${activation.status}` : "",
    activation?.verificationState ? `Проверка: ${activation.verificationState}` : "",
    activation?.lastProviderMessage ? `Ответ системы: ${activation.lastProviderMessage}` : "",
    "",
    `Для запуска или повтора активации отправьте: /token ${order.id} <токен>`,
    "Если система уже обрабатывает заказ, просто проверьте позже: /check " + order.id,
  ].filter(Boolean).join("\n");
}
```

- [ ] **Step 2: Extend pure tests**

Append to `apps/admin-backend/src/modules/telegram/telegram-site-orders.test.ts`:

```ts
import {
  buildTelegramLinkedOrderText,
  buildTelegramOrderDetailsText,
  buildTelegramOrdersText,
} from "./telegram-order-messages";

function testOrderMessages() {
  const order = {
    id: "cmqjs5sbe000x9nw4696b343m",
    status: "PAID",
    productTitle: "GPTishka VPN",
    amount: 199,
    currency: "RUB",
    deliveryType: "vpn",
    createdAt: new Date("2026-06-21T10:00:00.000Z"),
  };

  assert.match(buildTelegramOrdersText([order]), /Мои покупки GPTishka/);
  assert.match(buildTelegramLinkedOrderText(order), /Заказ привязан/);
  assert.match(
    buildTelegramOrderDetailsText({
      order,
      activation: {
        deliveryMode: "vpn",
        plan: "vpn_month",
        expiresAt: new Date("2026-07-21T10:00:00.000Z"),
        accessLink: "vless://example",
      },
    }),
    /vless:\/\/example/
  );
}

testOrderMessages();
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm run test:telegram-site-orders --workspace @gptishka/admin-backend
```

Expected:

```text
telegram-site-orders tests passed
```

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/admin-backend/src/modules/telegram/telegram-order-messages.ts apps/admin-backend/src/modules/telegram/telegram-site-orders.test.ts
git commit -m "feat: add telegram order message templates"
```

---

### Task 5: Extend generic GPTishka Telegram webhook bot

**Files:**

- Modify: `apps/admin-backend/src/modules/telegram/telegram.sender.ts`
- Modify: `apps/admin-backend/src/modules/telegram/telegram.service.ts`

- [ ] **Step 1: Allow reply markup and long messages**

Modify `telegram.sender.ts` input type:

```ts
async sendTextMessage(input: { telegramId: string; text: string; replyMarkup?: unknown }): Promise<TelegramSendResult> {
```

In the request body, add `reply_markup` only when present:

```ts
body: JSON.stringify({
  chat_id: telegramId,
  text,
  disable_web_page_preview: true,
  ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
}),
```

Add a long-message helper inside `telegramSender`:

```ts
async sendLongTextMessage(input: { telegramId: string; text: string; replyMarkup?: unknown }): Promise<TelegramSendResult> {
  const text = String(input.text || "").trim();
  if (text.length <= 3900) return this.sendTextMessage(input);

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 3900) {
    const slice = rest.slice(0, 3900);
    const cut = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const index = cut > 1000 ? cut : 3900;
    chunks.push(rest.slice(0, index).trim());
    rest = rest.slice(index).trimStart();
  }
  if (rest) chunks.push(rest);

  let last: TelegramSendResult = {
    ok: true,
    messageId: null,
  };
  for (let i = 0; i < chunks.length; i += 1) {
    last = await this.sendTextMessage({
      telegramId: input.telegramId,
      text: chunks[i],
      replyMarkup: i === chunks.length - 1 ? input.replyMarkup : undefined,
    });
    if (!last.ok) return last;
  }
  return last;
},
```

- [ ] **Step 2: Import order services and message helpers**

At the top of `telegram.service.ts`, add:

```ts
import { ordersService } from "../orders/orders.service";
import { telegramOrdersService } from "../orders/telegram-orders.service";
import { parseSiteOrderStartPayload } from "../orders/telegram-order-linking";
import {
  buildTelegramLinkedOrderText,
  buildTelegramOrderDetailsText,
  buildTelegramOrdersText,
} from "./telegram-order-messages";
```

- [ ] **Step 3: Add command parsers**

Add below `isStartCommand`:

```ts
function isOrdersCommand(text: string) {
  return /^\/(?:orders|myorders|purchases)(?:@\w+)?(?:\s|$)/i.test(String(text || "").trim());
}

function parseCheckCommand(text: string) {
  const match = String(text || "").trim().match(/^\/check(?:@\w+)?\s+([a-zA-Z0-9]{8,64})$/i);
  return match ? String(match[1] || "").trim() : "";
}

function parseTokenCommand(text: string) {
  const match = String(text || "").trim().match(/^\/token(?:@\w+)?\s+([a-zA-Z0-9]{8,64})\s+([\s\S]+)$/i);
  if (!match) return null;
  return {
    orderId: String(match[1] || "").trim(),
    token: String(match[2] || "").trim(),
  };
}

function buildTelegramContext(message: NonNullable<ReturnType<typeof extractTextMessage>>) {
  return {
    botType: "chatgpt" as const,
    telegramUserId: message.telegramId || message.chatId,
    telegramChatId: message.chatId || message.telegramId,
    telegramUsername: message.telegramUsername,
  };
}
```

The generic bot uses `botType: "chatgpt"` only as compatibility context for existing types. Listing and linked order lookup use `telegramUserId`, not `botType`.

- [ ] **Step 4: Add order command handlers**

Add below `buildStartHintText`:

```ts
async function sendLinkedOrders(message: NonNullable<ReturnType<typeof extractTextMessage>>) {
  const ctx = buildTelegramContext(message);
  const orders = await telegramOrdersService.listOrders(ctx, 20);
  await telegramSender.sendLongTextMessage({
    telegramId: message.telegramId || message.chatId,
    text: buildTelegramOrdersText(orders),
  });
  return {
    handled: true,
    action: "telegram_orders",
    count: orders.length,
  };
}

async function sendLinkedOrderDetails(message: NonNullable<ReturnType<typeof extractTextMessage>>, orderId: string) {
  const ctx = buildTelegramContext(message);
  const order = await telegramOrdersService.getOrderStatus({ ...ctx, orderId });
  let activation: any = null;
  if (String(order.status || "").toUpperCase() === "PAID") {
    activation = await ordersService.getActivationForTelegram(order.id, ctx.telegramUserId).catch((error) => ({
      deliveryMode: order.deliveryType,
      status: "pending",
      message: error instanceof Error ? error.message : "Данные заказа пока готовятся.",
    }));
  }

  await telegramSender.sendLongTextMessage({
    telegramId: message.telegramId || message.chatId,
    text: buildTelegramOrderDetailsText({ order, activation }),
  });
  return {
    handled: true,
    action: "telegram_order_details",
    orderId: order.id,
  };
}

async function linkSiteOrderFromStartPayload(
  message: NonNullable<ReturnType<typeof extractTextMessage>>,
  payload: string
) {
  const parsed = parseSiteOrderStartPayload(payload);
  if (!parsed) return null;
  const ctx = buildTelegramContext(message);
  const order = await telegramOrdersService.linkSiteOrderToTelegram({
    ...ctx,
    orderId: parsed.orderId,
    orderToken: parsed.orderToken,
  });
  await telegramSender.sendLongTextMessage({
    telegramId: message.telegramId || message.chatId,
    text: buildTelegramLinkedOrderText(order),
  });
  if (String(order.status || "").toUpperCase() === "PAID") {
    await sendLinkedOrderDetails(message, order.id);
  }
  return {
    handled: true,
    action: "telegram_site_order_linked",
    orderId: order.id,
  };
}

async function handleTelegramToken(message: NonNullable<ReturnType<typeof extractTextMessage>>, text: string) {
  const parsed = parseTokenCommand(text);
  if (!parsed) {
    await telegramSender.sendTextMessage({
      telegramId: message.telegramId || message.chatId,
      text: "Формат: /token <order_id> <токен>",
    });
    return {
      handled: true,
      action: "telegram_token_help",
    };
  }

  const ctx = buildTelegramContext(message);
  const order = await telegramOrdersService.getOrderStatus({ ...ctx, orderId: parsed.orderId });
  if (String(order.status || "").toUpperCase() !== "PAID") {
    await telegramSender.sendTextMessage({
      telegramId: message.telegramId || message.chatId,
      text: "Заказ еще не оплачен. После оплаты отправьте токен повторно.",
    });
    return {
      handled: true,
      action: "telegram_token_order_unpaid",
      orderId: order.id,
    };
  }

  const validation = await ordersService.validateActivationTokenForTelegram(order.id, parsed.token, ctx.telegramUserId);
  if (!validation.ok) {
    const reason = (validation.reasons || []).join("; ") || "Токен не прошел проверку";
    await telegramOrdersService.setOrderError({ orderId: order.id, error: reason });
    await telegramSender.sendTextMessage({
      telegramId: message.telegramId || message.chatId,
      text: `Токен не принят: ${reason}`,
    });
    return {
      handled: true,
      action: "telegram_token_rejected",
      orderId: order.id,
    };
  }

  const started = await ordersService.startActivationForTelegram(order.id, parsed.token, ctx.telegramUserId);
  await telegramOrdersService.clearOrderError(order.id);
  await telegramSender.sendTextMessage({
    telegramId: message.telegramId || message.chatId,
    text: ["Токен принят.", "Активация запущена.", started?.taskId ? `Task ID: ${String(started.taskId)}` : ""]
      .filter(Boolean)
      .join("\n"),
  });
  return {
    handled: true,
    action: "telegram_activation_started",
    orderId: order.id,
  };
}
```

- [ ] **Step 5: Route new commands before old unsupported payload fallback**

Inside `handleWebhookUpdate`, after extracting `message`, before the current `if (!isStartCommand(message.text))`, add:

```ts
if (isOrdersCommand(message.text)) {
  return sendLinkedOrders(message);
}

const checkOrderId = parseCheckCommand(message.text);
if (checkOrderId) {
  return sendLinkedOrderDetails(message, checkOrderId);
}

if (/^\/token(?:@|\s|$)/i.test(message.text)) {
  return handleTelegramToken(message, message.text);
}
```

Inside the `/start` payload section, after `const startPayload = extractStartPayload(message.text);`, add:

```ts
const linkedOrderResult = await linkSiteOrderFromStartPayload(message, startPayload);
if (linkedOrderResult) return linkedOrderResult;
```

This must run before `login_` and `link_` fallback rejection, while still preserving existing `login_` and account `link_` behavior.

- [ ] **Step 6: Run build**

Run:

```bash
npm run test:telegram-site-orders --workspace @gptishka/admin-backend
npm run build:admin:api
```

Expected: tests pass and TypeScript build passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/admin-backend/src/modules/telegram/telegram.sender.ts apps/admin-backend/src/modules/telegram/telegram.service.ts
git commit -m "feat: handle site orders in telegram bot"
```

---

### Task 6: Keep existing product bot order commands compatible

**Files:**

- Modify: `apps/admin-backend/src/modules/telegram-bots/telegram-bots.worker.ts`

- [ ] **Step 1: Add site order start payload parsing**

Add import:

```ts
import { parseSiteOrderStartPayload } from "../orders/telegram-order-linking";
import { buildTelegramLinkedOrderText, buildTelegramOrderDetailsText } from "../telegram/telegram-order-messages";
```

- [ ] **Step 2: Add link handler**

Add near `sendOrders`:

```ts
async function handleSiteOrderStartPayload(client: TelegramApiClient, ctx: OrderUserContext, payload: string) {
  const parsed = parseSiteOrderStartPayload(payload);
  if (!parsed) return false;
  const linked = await telegramOrdersService.linkSiteOrderToTelegram({
    botType: ctx.botType,
    telegramUserId: ctx.telegramUserId,
    telegramChatId: ctx.chatId,
    telegramUsername: ctx.telegramUsername,
    orderId: parsed.orderId,
    orderToken: parsed.orderToken,
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
```

- [ ] **Step 3: Route payload in `/start`**

Inside current `/start` branch, after:

```ts
const parsed = parseStartPayload(text);
```

add:

```ts
if (await handleSiteOrderStartPayload(client, ctx, parsed.payload)) return;
```

- [ ] **Step 4: Update token handling for linked site orders**

In `handleToken`, replace:

```ts
const validation = await ordersService.validateActivationToken(order.id, parsed.token);
```

with:

```ts
const validation = await ordersService.validateActivationTokenForTelegram(order.id, parsed.token, ctx.telegramUserId);
```

Replace:

```ts
const result = await ordersService.startActivation(order.id, parsed.token);
```

with:

```ts
const result = await ordersService.startActivationForTelegram(order.id, parsed.token, ctx.telegramUserId);
```

- [ ] **Step 5: Update activation details for linked site orders**

In `sendActivationState`, replace:

```ts
const proof = (await ordersService.getActivationProof(status.id, { forceCheck: true })) as any;
```

with:

```ts
const activationInfo = await ordersService.getActivationForTelegram(status.id, ctx.telegramUserId).catch(() => null);
if (activationInfo && String((activationInfo as any).deliveryMode || "").toLowerCase() === "vpn") {
  return client.sendMessage(
    ctx.chatId,
    buildTelegramOrderDetailsText({ order: status, activation: activationInfo }),
    keyboardActivation(status.id)
  );
}
const proof = (await ordersService.getActivationProof(status.id, { forceCheck: true })) as any;
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build:admin:api
```

Expected: TypeScript build passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/admin-backend/src/modules/telegram-bots/telegram-bots.worker.ts
git commit -m "feat: support linked site orders in product bots"
```

---

### Task 7: Return Telegram deep-link from checkout APIs

**Files:**

- Modify: `apps/admin-backend/src/modules/payments/public-payments.routes.ts`
- Modify: `apps/admin-backend/src/modules/payments/public-enot.routes.ts`

- [ ] **Step 1: Import env and deep-link builder**

In both payment route files, add:

```ts
import { env } from "../../config/env";
import { buildSiteOrderTelegramDeepLink } from "../orders/telegram-order-linking";
```

Use the correct relative import path for each file. From `apps/admin-backend/src/modules/payments/public-payments.routes.ts`, the helper import is:

```ts
import { buildSiteOrderTelegramDeepLink } from "../orders/telegram-order-linking";
```

- [ ] **Step 2: Build Telegram URL after activation URL**

After:

```ts
if (created.redeemToken) {
  activationUrl.searchParams.set("t", created.redeemToken);
}
```

add:

```ts
const telegramUrl = buildSiteOrderTelegramDeepLink({
  botUsername: env.TELEGRAM_BOT_USERNAME || "GPTishka_myBot",
  orderId: created.orderId,
  orderToken: created.redeemToken,
});
```

- [ ] **Step 3: Return `telegram_url`**

In JSON response, add:

```ts
telegram_url: telegramUrl || null,
```

near `activation_url`.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build:admin:api
```

Expected: TypeScript build passes.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/admin-backend/src/modules/payments/public-payments.routes.ts apps/admin-backend/src/modules/payments/public-enot.routes.ts
git commit -m "feat: return telegram order link from checkout"
```

---

### Task 8: Expose Telegram link on storefront after checkout

**Files:**

- Modify: `assets/js/app.js`
- Modify: `assets/js/app.min.js`
- Modify: `success.html`
- Modify: `store/vpn/activate/index.html`
- Modify: `chatgpt.html`
- Modify: `claude.html`
- Modify: `supergrok.html`
- Modify: `store/vpn/index.html`
- Modify: `index.html`

- [ ] **Step 1: Store Telegram URL in activation resume context**

In `assets/js/app.js`, add a key next to existing activation keys:

```js
const ACTIVATION_TELEGRAM_URL_KEY = "gptishka_activation_telegram_url";
```

In `clearStoredActivationResumeContext`, remove:

```js
localStorage.removeItem(ACTIVATION_TELEGRAM_URL_KEY);
```

Change:

```js
function readStoredActivationResumeContext() {
```

so every return object includes `telegramUrl`.

The successful return becomes:

```js
return {
  orderId,
  token,
  telegramUrl: String(localStorage.getItem(ACTIVATION_TELEGRAM_URL_KEY) || "").trim(),
};
```

Change:

```js
function persistActivationResumeContext(orderId, token, activationUrl) {
```

to:

```js
function persistActivationResumeContext(orderId, token, activationUrl, telegramUrl) {
```

Inside the storage write block, add:

```js
const safeTelegramUrl = String(telegramUrl || "").trim();
if (safeTelegramUrl) {
  localStorage.setItem(ACTIVATION_TELEGRAM_URL_KEY, safeTelegramUrl);
}
```

Change the checkout call:

```js
persistActivationResumeContext(
  String(data.order_id || ""),
  String(data.activation_token || ""),
  String(data.activation_url || "")
);
```

to:

```js
persistActivationResumeContext(
  String(data.order_id || ""),
  String(data.activation_token || ""),
  String(data.activation_url || ""),
  String(data.telegram_url || "")
);
```

- [ ] **Step 2: Add optional Telegram floating link outside payment pages**

In `initActivationResumeShortcut`, change:

```js
const { orderId, token: orderToken } = readStoredActivationResumeContext();
```

to:

```js
const { orderId, token: orderToken, telegramUrl } = readStoredActivationResumeContext();
```

After appending the existing activation link, add:

```js
if (telegramUrl) {
  const telegramAnchor = document.createElement("a");
  telegramAnchor.href = telegramUrl;
  telegramAnchor.className = "gptishka-resume-activation gptishka-resume-activation--telegram";
  telegramAnchor.textContent = isEnPage ? "My purchases in Telegram" : "Мои покупки в Telegram";
  telegramAnchor.setAttribute("aria-label", isEnPage ? "Open purchases in Telegram" : "Открыть покупки в Telegram");
  telegramAnchor.addEventListener("click", () => {
    trackAnalyticsEvent("telegram_order_link_click");
  });
  document.body.appendChild(telegramAnchor);
}
```

Add a CSS rule in the same asset styling location where `.gptishka-resume-activation` is defined:

```css
.gptishka-resume-activation--telegram {
  bottom: 82px;
  background: linear-gradient(135deg, #229ed9, #1677b9);
}
```

If `.gptishka-resume-activation` styles live in `assets/css/unified-premium.css`, make the CSS edit there and update CSS cache-bust on pages that load it.

- [ ] **Step 3: Add Telegram action to `success.html`**

In `success.html`, add a third action link:

```html
<a class="btn" id="telegramOrderLink" href="#" target="_blank" rel="noopener" hidden>Открыть покупки в Telegram</a>
```

Add constants after `linkToken`:

```js
const TELEGRAM_BOT_USERNAME = "GPTishka_myBot";
const TELEGRAM_URL_STORAGE_KEY = "gptishka_activation_telegram_url";
```

Add:

```js
function buildTelegramOrderUrl(id, token) {
  const safeOrderId = String(id || "").trim();
  const safeToken = String(token || "").trim();
  if (!safeOrderId || !safeToken) return "";
  return `https://t.me/${encodeURIComponent(TELEGRAM_BOT_USERNAME)}?start=${encodeURIComponent(`order_${safeOrderId}_${safeToken}`)}`;
}

function exposeTelegramOrderLink(id, token) {
  const link = document.getElementById("telegramOrderLink");
  if (!link) return;
  const fromStorage = String(localStorage.getItem(TELEGRAM_URL_STORAGE_KEY) || "").trim();
  const url = fromStorage || buildTelegramOrderUrl(id, token);
  if (!url) return;
  link.href = url;
  link.hidden = false;
}
```

After storing activation token in localStorage, call:

```js
exposeTelegramOrderLink(orderId, linkToken);
```

- [ ] **Step 4: Add Telegram action to VPN activation page**

In `store/vpn/activate/index.html`, add a secondary action near existing key buttons:

```html
<a class="btn key-soft-btn" id="vpnTelegramBtn" href="#" target="_blank" rel="noopener" hidden>Сохранить в Telegram</a>
```

Add JS:

```js
const vpnTelegramBtn = document.getElementById("vpnTelegramBtn");
const TELEGRAM_BOT_USERNAME = "GPTishka_myBot";

function buildTelegramOrderUrl(orderId, token) {
  const safeOrderId = String(orderId || "").trim();
  const safeToken = String(token || "").trim();
  if (!safeOrderId || !safeToken) return "";
  return `https://t.me/${encodeURIComponent(TELEGRAM_BOT_USERNAME)}?start=${encodeURIComponent(`order_${safeOrderId}_${safeToken}`)}`;
}

function refreshTelegramOrderButton() {
  if (!vpnTelegramBtn) return;
  const context = readOrderContext();
  const url = buildTelegramOrderUrl(context.orderId, context.token);
  if (!url) {
    vpnTelegramBtn.hidden = true;
    vpnTelegramBtn.setAttribute("href", "#");
    return;
  }
  vpnTelegramBtn.hidden = false;
  vpnTelegramBtn.setAttribute("href", url);
}
```

Call:

```js
refreshTelegramOrderButton();
```

after `const context = readOrderContext();` in initial page setup.

- [ ] **Step 5: Update minified app asset**

If no minifier script exists, use a controlled one-off minification with `npx terser` only after approval for network install if `terser` is not available locally.

Preferred command if `npx terser` is available:

```bash
npx terser assets/js/app.js -c -m -o assets/js/app.min.js
```

Expected: `assets/js/app.min.js` changes and contains `telegram_url` and `gptishka_activation_telegram_url`.

- [ ] **Step 6: Update JS cache-bust**

Change current `app.min.js?v=20260620-vpn-card1` and `app.min.js?v=20260620-vpn-card2` on touched public pages to:

```html
app.min.js?v=20260621-telegram-orders1
```

At minimum update:

- `index.html`
- `chatgpt.html`
- `claude.html`
- `supergrok.html`
- `store/vpn/index.html`

- [ ] **Step 7: Browser smoke**

Run local server using the normal project command:

```bash
npm run start
```

Open:

- `http://localhost:4000/chatgpt`
- `http://localhost:4000/claude`
- `http://localhost:4000/supergrok`
- `http://localhost:4000/store/vpn/`

Expected:

- Buy modal still opens.
- Payment method selection still works.
- Promo field still validates.
- Checkout request still calls `/api/payments/<provider>/create`.
- No visual regression on ChatGPT/Claude/SuperGrok/VPN cards.

- [ ] **Step 8: Commit**

Run:

```bash
git add assets/js/app.js assets/js/app.min.js success.html store/vpn/activate/index.html index.html chatgpt.html claude.html supergrok.html store/vpn/index.html
git commit -m "feat: expose telegram order links after checkout"
```

---

### Task 9: Server verification and deployment

**Files:**

- No source file changes expected.

- [ ] **Step 1: Full local verification**

Run:

```bash
npm run test:telegram-site-orders --workspace @gptishka/admin-backend
npm run build:admin:api
npm run build:admin:ui
```

Expected:

- Telegram tests pass.
- Backend build passes.
- Admin UI build passes.

- [ ] **Step 2: Commit verification fixes if any**

If verification reveals TypeScript or cache-bust errors, fix the specific files and commit:

```bash
git add <changed-files>
git commit -m "fix: stabilize telegram order linking verification"
```

- [ ] **Step 3: Push**

Run:

```bash
git push origin main
```

Expected: push succeeds.

- [ ] **Step 4: Pull clean project folder**

Run in `C:\Users\aSKAR\Desktop\gptishka-site-clean`:

```bash
git pull --ff-only origin main
```

Expected: fast-forward to the pushed commit.

- [ ] **Step 5: Create production backup before deploy**

Run on server:

```bash
ssh root@89.111.154.242 "cd /var/www && tar -czf gptishka-new-backup-$(date +%Y%m%d-%H%M%S).tar.gz gptishka-new"
```

Expected: backup archive is created under `/var/www`.

- [ ] **Step 6: Deploy from clean project**

Use the current deployment process already established for `/var/www/gptishka-new`.

Minimum server commands:

```bash
ssh root@89.111.154.242 "cd /var/www/gptishka-new && git pull --ff-only origin main && npm ci --include=dev && npm run build:admin:api && npm run build:admin:ui && pm2 restart gptishka-admin-api && pm2 restart gptishka-telegram-bots || true"
```

If `pm2 restart gptishka-telegram-bots` reports process not found, do not create a new process during this deploy; verify whether Telegram webhook mode is active through the existing API process first.

- [ ] **Step 7: Production smoke**

Run:

```bash
curl -I https://gptishka.shop/
curl -I https://gptishka.shop/chatgpt
curl -I https://gptishka.shop/claude
curl -I https://gptishka.shop/supergrok
curl -I https://gptishka.shop/store/vpn/
curl -I https://gptishka.shop/success.html
```

Expected: every page returns HTTP 200.

- [ ] **Step 8: Functional smoke**

Manual browser checks:

- Open `https://gptishka.shop/chatgpt?verify_telegram_orders=20260621`.
- Open buy modal.
- Confirm fields still work.
- Select LAVA/ENOT.
- Apply a known promo code.
- Start checkout until payment redirect page opens.
- Confirm backend response includes `telegram_url` in browser network panel.
- Return to `success.html?order_id=<orderId>&t=<token>` and confirm Telegram action appears.
- Open `https://t.me/GPTishka_myBot?start=order_<orderId>_<token>`.
- Confirm bot says order is linked.
- Send `/orders`.
- Confirm the linked site order appears.
- If the order is VPN and paid, send `/check <orderId>` and confirm the VLESS key is displayed.
- If the order is activation and paid, send `/check <orderId>` and confirm token instruction is displayed.

- [ ] **Step 9: Rollback command**

If production breaks, rollback to the backup created in Step 5:

```bash
ssh root@89.111.154.242 "cd /var/www && rm -rf gptishka-new.rollback && mv gptishka-new gptishka-new.rollback && tar -xzf <backup-file-name> && cd /var/www/gptishka-new && pm2 restart gptishka-admin-api && pm2 restart gptishka-telegram-bots || true"
```

Use the exact backup filename printed in Step 5.

---

## Self-review

Spec coverage:

- Orders from site can be linked to Telegram: Task 3 and Task 5.
- All purchases together: Task 3 changes filtering to `telegramUserId`; Task 5 `/orders` uses that list.
- VPN duplicate/recovery through Telegram: Task 2 exposes VPN payload through trusted Telegram ownership; Task 4 formats VLESS; Task 5 sends it.
- Activation products: Task 2 adds Telegram-owned activation access; Task 5 handles `/token` and `/check`.
- No bot DM by `@username`: scope boundary documents Telegram API limitation and uses deep-link binding.
- Checkout/payment logic remains current: Task 7 only adds response field; Task 8 only stores/renders link.
- Existing ChatGPT/Claude/SuperGrok/VPN pages preserved: Task 8 includes smoke tests.
- Production backup/rollback: Task 9.

Placeholder scan:

- The plan defines exact files, functions, command lines, and expected outputs.
- No database schema migration is required for first version because current `Order` fields already support ownership.

Type consistency:

- `telegramUserId` is normalized as string everywhere.
- Public site access still uses `orderToken`.
- Telegram trusted access uses `telegramUserId`.
- `telegramOrdersService.getOrderStatus` and `listOrders` return the same presenter shape.
- Generic bot and product bots call the same order service methods.
