import { Currency, DiscountType, OrderStatus, PartnerEarningStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  getPaymentProvider,
  getProviderByCode,
  normalizePaymentMethodCode,
  resolveProviderCodeByPaymentMethod,
} from "./payment.factory";
import { writeAuditLog } from "../audit/audit.service";
import { AppError } from "../../common/errors/app-error";
import { WELCOME_PROMO_CODE } from "../promocodes/welcome-promo.service";
import crypto from "crypto";
import { resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { resolveActivationVariant } from "../../common/utils/product-activation-variants";

const ORDER_SOURCE_SITE = "site";
const ORDER_SOURCE_TELEGRAM = "telegram";

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function generateRedeemToken() {
  // Short, URL-safe, unguessable.
  return crypto.randomBytes(24).toString("hex");
}

function normalizeOrderSource(value: unknown) {
  const source = String(value || "").trim().toLowerCase();
  if (source === ORDER_SOURCE_TELEGRAM) return ORDER_SOURCE_TELEGRAM;
  return ORDER_SOURCE_SITE;
}

function normalizeTelegramBotType(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "claude" || normalized === "chatgpt" || normalized === "grok") return normalized;
  return null;
}

function normalizeTelegramIdentifier(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^\d-]/g, "");
  return normalized ? normalized : null;
}

function normalizeTelegramUsername(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/^@+/, "");
  return normalized ? normalized : null;
}

export const paymentsService = {
  computeDiscount(
    baseAmount: number,
    promo?: { discountType: DiscountType; discountValue: Prisma.Decimal | number; discountPercent?: number | null } | null
  ) {
    if (!promo) return { discountAmount: 0, finalPrice: Number(baseAmount.toFixed(2)) };

    const base = Math.max(0, Number(baseAmount));
    const valueFromDiscountValue = Math.max(0, Number(promo.discountValue));
    const percentFallback = Math.max(0, Number(promo.discountPercent || 0));
    const value = promo.discountType === DiscountType.PERCENT && valueFromDiscountValue <= 0 ? percentFallback : valueFromDiscountValue;
    let discount = 0;

    if (promo.discountType === DiscountType.FIXED) {
      discount = value;
    } else {
      discount = (base * Math.min(100, value)) / 100;
    }

    discount = Math.min(base, Number(discount.toFixed(2)));
    const finalPrice = Math.max(0, Number((base - discount).toFixed(2)));
    return { discountAmount: discount, finalPrice };
  },

  async validatePromoCode(input: {
    code: string;
    productId: string;
    quantity?: number;
    activationVariant?: string;
    deliveryMethod?: string;
  }) {
    const code = String(input.code || "").trim().toUpperCase();
    if (!code) throw new AppError("Promo code is required", 400);
    const qty = Math.max(1, Number(input.quantity || 1));

    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || !product.isActive || product.isArchived) {
      throw new AppError("Product not available", 400);
    }
    const selectedVariant = resolveActivationVariant(
      product.activationVariants,
      {
        price: Number(product.price),
        deliveryType: resolveProductDeliveryType(product.tags),
      },
      input.activationVariant,
      input.deliveryMethod
    );
    const basePrice = Number((selectedVariant.price * qty).toFixed(2));

    const promo = await prisma.promoCode.findUnique({
      where: { code },
      include: { partner: true },
    });

    if (!promo || !promo.isActive) {
      return {
        valid: false,
        basePrice,
        discountAmount: 0,
        finalPrice: basePrice,
      };
    }

    if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
      return {
        valid: false,
        basePrice,
        discountAmount: 0,
        finalPrice: basePrice,
      };
    }

    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      return {
        valid: false,
        basePrice,
        discountAmount: 0,
        finalPrice: basePrice,
      };
    }

    const { discountAmount, finalPrice } = this.computeDiscount(basePrice, {
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountPercent: promo.discountPercent,
    });

    // Never allow promo to reduce checkout below minimal payable amount.
    if (finalPrice < 1) {
      return {
        valid: false,
        basePrice,
        discountAmount: 0,
        finalPrice: basePrice,
      };
    }

    return {
      valid: true,
      basePrice,
      discountAmount,
      finalPrice,
      partnerId: promo.partnerId || null,
      promoCodeId: promo.id,
    };
  },

  async createOrderWithPayment(input: {
    email: string;
    productId: string;
    quantity: number;
    ip?: string;
    country?: string;
    paymentMethod?: string;
    promoCode?: string;
    source?: string;
    botType?: string;
    telegramUserId?: string;
    telegramUsername?: string | null;
    telegramChatId?: string | null;
    issueRedeemToken?: boolean;
    orderDetails?: Prisma.InputJsonValue | null;
  }) {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || !product.isActive || product.isArchived) {
      throw new AppError("Product not available", 400);
    }

    const rawOrderDetails =
      input.orderDetails && typeof input.orderDetails === "object" && !Array.isArray(input.orderDetails)
        ? (input.orderDetails as Record<string, any>)
        : null;
    const requestedDeliveryMethod = rawOrderDetails?.selection?.deliveryMethod;
    const selectedVariant = resolveActivationVariant(
      product.activationVariants,
      {
        price: Number(product.price),
        deliveryType: resolveProductDeliveryType(product.tags),
      },
      rawOrderDetails?.selection?.activationVariant,
      requestedDeliveryMethod
    );
    if (!selectedVariant.enabled) {
      throw new AppError("Selected activation option is not available", 400);
    }
    const effectiveOrderDetails = {
      ...(rawOrderDetails || {}),
      selection: {
        ...(rawOrderDetails?.selection && typeof rawOrderDetails.selection === "object" ? rawOrderDetails.selection : {}),
        activationVariant: selectedVariant.key,
        serverDeliveryType: selectedVariant.deliveryType,
        serverUnitPrice: selectedVariant.price,
        serverActivationSiteUrl: selectedVariant.activationSiteUrl || "",
      },
    } as Prisma.InputJsonValue;

    const subtotal = selectedVariant.price * Math.max(1, input.quantity);
    let discountAmount = 0;
    let promo: {
      id: string;
      code: string;
      discountType: DiscountType;
      discountValue: number;
      discountPercent: number;
      partnerId?: string | null;
    } | null = null;

    if (input.promoCode) {
      const code = String(input.promoCode).trim().toUpperCase();
      const found = await prisma.promoCode.findUnique({ where: { code } });
      if (!found || !found.isActive) {
        throw new AppError("Promo code is invalid or inactive", 400);
      }
      if (found.expiresAt && found.expiresAt.getTime() < Date.now()) {
        throw new AppError("Promo code expired", 400);
      }
      if (found.usageLimit !== null && found.usedCount >= found.usageLimit) {
        throw new AppError("Promo code usage limit reached", 400);
      }
      if (String(found.ownerLabel || "").trim().toLowerCase() === String(input.email || "").trim().toLowerCase()) {
        throw new AppError("Self-referral promo usage is not allowed", 400);
      }
      if (found.code === WELCOME_PROMO_CODE) {
        const normalizedEmail = String(input.email || "").trim().toLowerCase();
        const hasPaidOrder = await prisma.order.findFirst({
          where: {
            email: normalizedEmail,
            status: OrderStatus.PAID,
          },
          select: { id: true },
        });
        if (hasPaidOrder) {
          throw new AppError("WELCOME34 is available only for first paid order", 400);
        }
      }

      promo = {
        id: found.id,
        code: found.code,
        discountType: found.discountType,
        discountValue: Number(found.discountValue),
        discountPercent: Number(found.discountPercent || 0),
        partnerId: found.partnerId,
      };
      discountAmount = this.computeDiscount(subtotal, {
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discountPercent: promo.discountPercent,
      }).discountAmount;
    }
    const total = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));
    if (total < 1) {
      throw new AppError("Order total is below minimal payable amount", 400);
    }

    const source = normalizeOrderSource(input.source);
    const botType = source === ORDER_SOURCE_TELEGRAM ? normalizeTelegramBotType(input.botType) : null;
    const telegramUserId = source === ORDER_SOURCE_TELEGRAM ? normalizeTelegramIdentifier(input.telegramUserId) : null;
    const telegramChatId = source === ORDER_SOURCE_TELEGRAM ? normalizeTelegramIdentifier(input.telegramChatId) : null;
    const telegramUsername = source === ORDER_SOURCE_TELEGRAM ? normalizeTelegramUsername(input.telegramUsername) : null;
    const issueRedeemToken = input.issueRedeemToken !== false;
    const redeemToken = issueRedeemToken ? generateRedeemToken() : "";
    const redeemTokenHash = issueRedeemToken ? sha256Hex(redeemToken) : null;

    const selectedProviderCode = resolveProviderCodeByPaymentMethod(input.paymentMethod);
    const selectedPaymentMethod = normalizePaymentMethodCode(input.paymentMethod, selectedProviderCode);

    const order = await prisma.$transaction(async tx => {
      const created = await tx.order.create({
        data: {
          email: input.email,
          status: OrderStatus.PENDING,
          redeemTokenHash,
          source,
          botType,
          telegramUserId,
          telegramUsername,
          telegramChatId,
          telegramLastError: null,
          subtotalAmount: subtotal,
          discountAmount,
          totalAmount: total,
          currency: product.currency,
          ip: input.ip,
          country: input.country,
          orderDetails: effectiveOrderDetails || Prisma.JsonNull,
          paymentMethod: selectedPaymentMethod,
          promoCodeId: promo?.id || null,
          promoCodeSnapshot: promo?.code || null,
          partnerId: promo?.partnerId || null,
          items: {
            create: {
              productId: product.id,
              productRaw: product.title,
              price: selectedVariant.price,
              quantity: Math.max(1, input.quantity),
            },
          },
        },
        include: { items: true },
      });

      return created;
    });

    const paymentInput = {
      orderId: order.id,
      amount: total,
      currency: order.currency,
      description: `${product.title} x${input.quantity}`,
      metadata: {
        productId: product.id,
        planId: product.id,
        quantity: input.quantity,
        email: input.email,
        redeemToken: issueRedeemToken ? redeemToken : null,
        promoCode: promo?.code || null,
        promo: promo?.code || null,
        partnerId: promo?.partnerId || null,
        subtotalAmount: subtotal,
        discountAmount,
        finalAmount: total,
        source,
        botType,
      },
    } as const;

    let provider = input.paymentMethod ? getProviderByCode(selectedProviderCode) : getPaymentProvider();
    let paymentResponse;
    try {
      paymentResponse = await provider.createPayment(paymentInput);
    } catch (error) {
      const canFallbackToEnot = selectedProviderCode === "lava";
      if (!canFallbackToEnot) throw error;

      const fallbackProvider = getProviderByCode("gateway");
      paymentResponse = await fallbackProvider.createPayment(paymentInput);
      provider = fallbackProvider;
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentMethod: "enot" },
      });
      console.warn(
        `[payments] provider fallback applied order=${order.id} from=${selectedProviderCode} to=enot reason=${error instanceof Error ? error.message : "unknown"}`
      );
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: paymentResponse.provider,
        providerRef: paymentResponse.paymentId,
        amount: total,
        currency: order.currency,
        payload: {
          checkoutUrl: paymentResponse.checkoutUrl,
          source,
          botType,
          telegramUserId,
          telegramUsername,
          telegramChatId,
          orderDetails: effectiveOrderDetails || null,
        } as Prisma.InputJsonValue,
        status:
          paymentResponse.status === "success"
            ? PaymentStatus.SUCCESS
            : paymentResponse.status === "failed"
            ? PaymentStatus.FAILED
            : PaymentStatus.PROCESSING,
      },
    });

    const nextStatus =
      payment.status === PaymentStatus.SUCCESS
        ? OrderStatus.PAID
        : payment.status === PaymentStatus.FAILED
        ? OrderStatus.FAILED
        : OrderStatus.PENDING;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        paymentId: payment.providerRef,
      },
    });

    if (nextStatus === OrderStatus.PAID && promo) {
      await prisma.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    if (nextStatus === OrderStatus.PAID && promo?.partnerId) {
      const partner = await prisma.partner.findUnique({ where: { id: promo.partnerId } });
      if (partner) {
        const commission = Number(((total * Number(partner.payoutPercent)) / 100).toFixed(2));
        await prisma.partnerEarning.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            partnerId: partner.id,
            commissionRate: partner.payoutPercent,
            commissionAmount: commission,
            status: PartnerEarningStatus.PENDING,
          },
          update: {
            commissionRate: partner.payoutPercent,
            commissionAmount: commission,
            status: PartnerEarningStatus.PENDING,
          },
        });
      }
    }

    console.info(
      `[order] created id=${order.id} status=${nextStatus} paymentProvider=${payment.provider} paymentRef=${payment.providerRef || payment.id}`
    );

    return {
      orderId: order.id,
      redeemToken: issueRedeemToken ? redeemToken : null,
      paymentId: payment.id,
      basePrice: subtotal,
      discountAmount,
      finalPrice: total,
      promoCode: promo?.code || null,
      partnerId: promo?.partnerId || null,
      paymentProvider: payment.provider,
      deliveryType: selectedVariant.deliveryType,
      checkoutUrl: paymentResponse.checkoutUrl,
      status: nextStatus,
    };
  },

  async refund(orderId: string, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: "desc" } } },
    });

    if (!order) throw new AppError("Order not found", 404);
    const payment = order.payments[0];
    if (!payment) throw new AppError("Payment not found", 404);

    const provider = getProviderByCode(payment.provider);
    const refundResult = await provider.refundPayment(payment.providerRef || payment.id, Number(order.totalAmount));
    if (!refundResult.ok) throw new AppError("Refund failed", 400);

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED, processedAt: new Date() },
      }),
      prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.REFUNDED } }),
    ]);

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "order",
      entityId: order.id,
      action: "refund",
      before: { status: order.status },
      after: { status: OrderStatus.REFUNDED, refundRef: refundResult.providerRef },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return { ok: true, refundRef: refundResult.providerRef };
  },
};
