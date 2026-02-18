import { Currency, DiscountType, OrderStatus, PartnerEarningStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { getPaymentProvider, getProviderByCode } from "./payment.factory";
import { writeAuditLog } from "../audit/audit.service";
import { AppError } from "../../common/errors/app-error";
import crypto from "crypto";

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function generateRedeemToken() {
  // Short, URL-safe, unguessable.
  return crypto.randomBytes(24).toString("hex");
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

  async validatePromoCode(input: { code: string; productId: string; quantity?: number }) {
    const code = String(input.code || "").trim().toUpperCase();
    if (!code) throw new AppError("Promo code is required", 400);
    const qty = Math.max(1, Number(input.quantity || 1));

    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || !product.isActive || product.isArchived) {
      throw new AppError("Product not available", 400);
    }
    const basePrice = Number((Number(product.price) * qty).toFixed(2));

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
  }) {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || !product.isActive || product.isArchived) {
      throw new AppError("Product not available", 400);
    }

    const subtotal = Number(product.price) * Math.max(1, input.quantity);
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

    const redeemToken = generateRedeemToken();
    const redeemTokenHash = sha256Hex(redeemToken);

    const order = await prisma.$transaction(async tx => {
      const created = await tx.order.create({
        data: {
          email: input.email,
          status: OrderStatus.PENDING,
          redeemTokenHash,
          subtotalAmount: subtotal,
          discountAmount,
          totalAmount: total,
          currency: product.currency,
          ip: input.ip,
          country: input.country,
          paymentMethod: input.paymentMethod || null,
          promoCodeId: promo?.id || null,
          promoCodeSnapshot: promo?.code || null,
          partnerId: promo?.partnerId || null,
          items: {
            create: {
              productId: product.id,
              productRaw: product.title,
              price: product.price,
              quantity: Math.max(1, input.quantity),
            },
          },
        },
        include: { items: true },
      });

      return created;
    });

    const provider = getPaymentProvider();
    const paymentResponse = await provider.createPayment({
      orderId: order.id,
      amount: total,
      currency: order.currency,
      description: `${product.title} x${input.quantity}`,
      metadata: {
        productId: product.id,
        planId: product.id,
        quantity: input.quantity,
        email: input.email,
        redeemToken,
        promoCode: promo?.code || null,
        promo: promo?.code || null,
        partnerId: promo?.partnerId || null,
        subtotalAmount: subtotal,
        discountAmount,
        finalAmount: total,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: paymentResponse.provider,
        providerRef: paymentResponse.paymentId,
        amount: total,
        currency: order.currency,
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
      redeemToken,
      paymentId: payment.id,
      basePrice: subtotal,
      discountAmount,
      finalPrice: total,
      promoCode: promo?.code || null,
      partnerId: promo?.partnerId || null,
      paymentProvider: payment.provider,
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
