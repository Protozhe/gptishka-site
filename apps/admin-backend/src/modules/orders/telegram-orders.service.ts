import { AppError } from "../../common/errors/app-error";
import { resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { paymentsService } from "../payments/payments.service";
import { activationStore } from "./activation.store";

export type TelegramBotType = "claude" | "chatgpt" | "grok";

type TelegramOrderContext = {
  botType: TelegramBotType;
  telegramUserId: string;
  telegramChatId: string;
  telegramUsername?: string | null;
};

const REUSE_PENDING_ORDER_WINDOW_MINUTES = 30;

function normalizeTelegramId(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^\d-]/g, "");
  if (!normalized) throw new AppError("Telegram user id is required", 400);
  return normalized;
}

function normalizeTelegramUsername(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/^@+/, "");
  return normalized || null;
}

function buildTelegramSyntheticEmail(input: { telegramUserId: string; botType: TelegramBotType }) {
  return `tg_${input.botType}_${input.telegramUserId}@telegram.local`;
}

function extractCheckoutUrlFromPayload(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const payload = value as Record<string, unknown>;
  const checkout = String(payload.checkoutUrl || payload.checkout_url || payload.url || "").trim();
  return checkout;
}

function resolveConfiguredProductId(botType: TelegramBotType) {
  if (botType === "claude") return String(env.TELEGRAM_CLAUDE_PRODUCT_ID || "").trim();
  if (botType === "chatgpt") return String(env.TELEGRAM_CHATGPT_PRODUCT_ID || "").trim();
  return String(env.TELEGRAM_GROK_PRODUCT_ID || "").trim();
}

function scoreProductForBot(input: {
  botType: TelegramBotType;
  slug: string;
  title: string;
  tags: string[];
  deliveryType: string;
}) {
  const slug = input.slug.toLowerCase();
  const title = input.title.toLowerCase();
  const tags = input.tags.map((item) => item.toLowerCase());
  const text = `${slug} ${title} ${tags.join(" ")}`;
  let score = 0;

  const has = (token: string) => text.includes(token);
  const hasTag = (token: string) => tags.includes(token);

  if (input.botType === "claude") {
    if (input.deliveryType === "support_claude") score += 100;
    if (has("claude")) score += 45;
    if (has("pro")) score += 15;
  } else if (input.botType === "chatgpt") {
    if (input.deliveryType === "activation") score += 45;
    if (has("chatgpt")) score += 40;
    if (has("plus")) score += 28;
    if (has("chatgpt-plus-vpn")) score += 30;
    if (has("vpn")) score += 10;
    if (hasTag("chatgpt") && hasTag("plus")) score += 20;
  } else {
    if (input.deliveryType === "support") score += 80;
    if (has("grok")) score += 45;
    if (has("supergrok")) score += 30;
    if (has("super")) score += 10;
  }

  return score;
}

async function resolveProductForBot(botType: TelegramBotType) {
  const configuredProductId = resolveConfiguredProductId(botType);
  if (configuredProductId) {
    const exact = await prisma.product.findFirst({
      where: {
        id: configuredProductId,
        isActive: true,
        isArchived: false,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        tags: true,
        price: true,
        currency: true,
      },
    });
    if (exact) return exact;
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      isArchived: false,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      tags: true,
      price: true,
      currency: true,
      createdAt: true,
    },
  });

  const scored = products
    .map((product) => {
      const deliveryType = resolveProductDeliveryType(product.tags || []);
      const score = scoreProductForBot({
        botType,
        slug: String(product.slug || ""),
        title: String(product.title || ""),
        tags: Array.isArray(product.tags) ? product.tags : [],
        deliveryType,
      });
      return {
        product,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aPrice = Number(a.product.price);
      const bPrice = Number(b.product.price);
      if (aPrice !== bPrice) return aPrice - bPrice;
      return b.product.createdAt.getTime() - a.product.createdAt.getTime();
    });

  if (!scored.length) {
    throw new AppError(`No active product configured for telegram bot "${botType}"`, 409);
  }

  return scored[0].product;
}

export const telegramOrdersService = {
  async getBotOffer(botType: TelegramBotType) {
    const product = await resolveProductForBot(botType);
    return {
      productId: product.id,
      title: product.title,
      price: Number(product.price),
      currency: product.currency,
    };
  },

  async validatePromoCodeForBot(input: { botType: TelegramBotType; promoCode: string }) {
    const code = String(input.promoCode || "").trim().toUpperCase();
    if (!code) throw new AppError("Promo code is required", 400);
    const product = await resolveProductForBot(input.botType);
    return paymentsService.validatePromoCode({
      code,
      productId: product.id,
      quantity: 1,
    });
  },

  async createOrderFromTelegram(input: TelegramOrderContext & { paymentMethod?: string; promoCode?: string }) {
    const telegramUserId = normalizeTelegramId(input.telegramUserId);
    const telegramChatId = normalizeTelegramId(input.telegramChatId);
    const telegramUsername = normalizeTelegramUsername(input.telegramUsername);
    const promoCode = String(input.promoCode || "").trim().toUpperCase() || null;
    const now = Date.now();
    const reusableSince = new Date(now - REUSE_PENDING_ORDER_WINDOW_MINUTES * 60 * 1000);

    const reusable = await prisma.order.findFirst({
      where: {
        source: "telegram",
        botType: input.botType,
        telegramUserId,
        status: "PENDING",
        createdAt: {
          gte: reusableSince,
        },
        promoCodeSnapshot: promoCode,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        items: {
          include: {
            product: true,
          },
          orderBy: {
            id: "asc",
          },
          take: 1,
        },
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (reusable) {
      const lastPayment = reusable.payments[0] || null;
      const checkoutUrl = extractCheckoutUrlFromPayload(lastPayment?.payload);
      if (checkoutUrl) {
        await prisma.order.update({
          where: { id: reusable.id },
          data: {
            telegramChatId,
            telegramUsername,
            telegramLastError: null,
          },
        });

        return {
          reused: true,
          orderId: reusable.id,
          checkoutUrl,
          basePrice: Number(reusable.subtotalAmount),
          discountAmount: Number(reusable.discountAmount),
          promoCode: reusable.promoCodeSnapshot || null,
          amount: Number(reusable.totalAmount),
          currency: reusable.currency,
          status: reusable.status,
          productTitle: String(reusable.items[0]?.product?.title || reusable.items[0]?.productRaw || ""),
        };
      }
    }

    const product = await resolveProductForBot(input.botType);
    const syntheticEmail = buildTelegramSyntheticEmail({ telegramUserId, botType: input.botType });
    const created = await paymentsService.createOrderWithPayment({
      email: syntheticEmail,
      productId: product.id,
      quantity: 1,
      paymentMethod: input.paymentMethod,
      source: "telegram",
      botType: input.botType,
      telegramUserId,
      telegramUsername,
      telegramChatId,
      issueRedeemToken: false,
      promoCode: promoCode || undefined,
    });

    if (!created.checkoutUrl) {
      throw new AppError("Payment link is not available for telegram order", 502);
    }

    return {
      reused: false,
      orderId: created.orderId,
      checkoutUrl: created.checkoutUrl,
      basePrice: created.basePrice,
      discountAmount: created.discountAmount,
      promoCode: created.promoCode,
      amount: created.finalPrice,
      currency: product.currency,
      status: created.status,
      productTitle: product.title,
    };
  },

  async listOrders(input: TelegramOrderContext, limit = 10) {
    const telegramUserId = normalizeTelegramId(input.telegramUserId);
    const safeLimit = Math.max(1, Math.min(20, Number(limit || 10)));

    const rows = await prisma.order.findMany({
      where: {
        source: "telegram",
        botType: input.botType,
        telegramUserId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: safeLimit,
      include: {
        items: {
          include: {
            product: true,
          },
          orderBy: { id: "asc" },
          take: 1,
        },
        payments: {
          select: {
            status: true,
            provider: true,
            providerRef: true,
            processedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return rows.map((row) => {
      const activation = activationStore.findByOrderId(row.id);
      const lastPayment = row.payments[0] || null;
      return {
        id: row.id,
        status: row.status,
        amount: Number(row.totalAmount),
        discountAmount: Number(row.discountAmount),
        promoCode: row.promoCodeSnapshot || null,
        currency: row.currency,
        productTitle: String(row.items[0]?.product?.title || row.items[0]?.productRaw || ""),
        paymentStatus: lastPayment?.status || null,
        paymentProvider: lastPayment?.provider || null,
        paymentRef: lastPayment?.providerRef || null,
        paidAt: lastPayment?.processedAt || null,
        activationStatus: activation?.status || null,
        activationVerificationState: activation?.verificationState || null,
        activationMessage: activation?.lastProviderMessage || null,
        createdAt: row.createdAt,
      };
    });
  },

  async getOrderStatus(input: TelegramOrderContext & { orderId: string }) {
    const telegramUserId = normalizeTelegramId(input.telegramUserId);
    const orderId = String(input.orderId || "").trim();
    if (!orderId) throw new AppError("Order id is required", 400);

    const row = await prisma.order.findFirst({
      where: {
        id: orderId,
        source: "telegram",
        botType: input.botType,
        telegramUserId,
      },
      include: {
        items: {
          include: {
            product: true,
          },
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
    if (!row) throw new AppError("Order not found", 404);

    const latestPayment = row.payments[0] || null;
    const activation = activationStore.findByOrderId(row.id);
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
      productTitle: String(row.items[0]?.product?.title || row.items[0]?.productRaw || ""),
      deliveryType: resolveProductDeliveryType(row.items[0]?.product?.tags || []),
      paymentStatus: latestPayment?.status || null,
      paymentProvider: latestPayment?.provider || null,
      paymentRef: latestPayment?.providerRef || null,
      paymentProcessedAt: latestPayment?.processedAt || null,
      checkoutUrl: extractCheckoutUrlFromPayload(latestPayment?.payload),
      activationStatus: activation?.status || null,
      activationVerificationState: activation?.verificationState || null,
      activationTaskId: activation?.taskId || null,
      activationMessage: activation?.lastProviderMessage || null,
      activationUpdatedAt: activation?.updatedAt || null,
      createdAt: row.createdAt,
    };
  },

  async setOrderError(input: { orderId: string; error: string }) {
    const orderId = String(input.orderId || "").trim();
    if (!orderId) return;
    const text = String(input.error || "").trim().slice(0, 1000);
    await prisma.order.updateMany({
      where: { id: orderId },
      data: { telegramLastError: text || null },
    });
  },

  async clearOrderError(orderId: string) {
    const id = String(orderId || "").trim();
    if (!id) return;
    await prisma.order.updateMany({
      where: { id },
      data: { telegramLastError: null },
    });
  },
};
