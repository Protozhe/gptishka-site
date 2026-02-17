import { OrderStatus, PartnerEarningStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/app-error";
import { sendOrderPaidEmail, sendTelegramNotification } from "../notifications/notifications.service";
import { deliverProduct } from "../orders/delivery.service";
import { env } from "../../config/env";

type WebhookPayload = {
  paymentId?: string;
  payment_id?: string;
  invoice_id?: string;
  id?: string;
  orderId?: string;
  order_id?: string;
  status?: string;
  event?: string;
  amount?: number | string;
  currency?: string;
  [k: string]: unknown;
};

function toStatus(payload: WebhookPayload): "success" | "failed" | "processing" | "refunded" {
  const statusRaw = String(payload.status || payload.event || "").toLowerCase();
  if (["success", "succeeded", "paid", "payment.success"].includes(statusRaw)) return "success";
  if (["fail", "failed", "error", "expired", "cancelled", "canceled", "payment.failed", "payment.expired"].includes(statusRaw))
    return "failed";
  if (["refund", "refunded", "chargeback", "reversed", "payment.refunded", "payment.chargeback"].includes(statusRaw)) return "refunded";
  return "processing";
}

export const paymentWebhookService = {
  async handle(rawPayload: WebhookPayload) {
    const paymentRef = String(rawPayload.paymentId || rawPayload.payment_id || rawPayload.invoice_id || rawPayload.id || "").trim();
    const orderId = String(rawPayload.orderId || rawPayload.order_id || "").trim();
    const mapped = toStatus(rawPayload);

    if (!paymentRef && !orderId) {
      throw new AppError("Invalid webhook payload", 400);
    }

    const payment = paymentRef
      ? await prisma.payment.findFirst({
          where: { OR: [{ providerRef: paymentRef }, { id: paymentRef }] },
          include: { order: true },
        })
      : null;

    const fallbackOrder = !payment && orderId ? await prisma.order.findUnique({ where: { id: orderId } }) : null;
    const order = payment?.order || fallbackOrder;
    if (!order) throw new AppError("Order not found", 404);

    const targetPayment =
      payment ||
      (await prisma.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
      }));
    if (!targetPayment) throw new AppError("Payment not found", 404);

    if (paymentRef) {
      const foreignPayment = await prisma.payment.findFirst({
        where: {
          providerRef: paymentRef,
          id: { not: targetPayment.id },
        },
      });
      if (foreignPayment) {
        throw new AppError("Duplicate payment reference", 409);
      }
    }

    const isRefund = mapped === "refunded";

    // Prevent replay/downgrade attacks on terminal states.
    if (order.status === OrderStatus.REFUNDED) {
      return { ok: true, duplicate: true, orderId: order.id };
    }
    if (order.status === OrderStatus.PAID && mapped !== "refunded") {
      return { ok: true, duplicate: true, orderId: order.id };
    }
    const nextPaymentStatus = isRefund
      ? PaymentStatus.REFUNDED
      : mapped === "success"
      ? PaymentStatus.SUCCESS
      : mapped === "failed"
      ? PaymentStatus.FAILED
      : PaymentStatus.PROCESSING;
    const nextOrderStatus = isRefund
      ? OrderStatus.REFUNDED
      : mapped === "success"
      ? OrderStatus.PAID
      : mapped === "failed"
      ? OrderStatus.FAILED
      : OrderStatus.PENDING;

    if (targetPayment.status === PaymentStatus.SUCCESS && nextPaymentStatus === PaymentStatus.SUCCESS) {
      return { ok: true, duplicate: true, orderId: order.id };
    }

    if (mapped === "success") {
      const reportedAmount = parseAmount(rawPayload.amount);
      if (reportedAmount === null) {
        throw new AppError("Webhook amount is required for successful payment", 400);
      }

      const expectedAmount = Number(order.totalAmount);
      if (Math.abs(reportedAmount - expectedAmount) > 0.01) {
        throw new AppError("Webhook amount mismatch", 409);
      }

      if (rawPayload.currency) {
        const incomingCurrency = String(rawPayload.currency).toUpperCase();
        const expectedCurrency = String(order.currency).toUpperCase();
        if (incomingCurrency !== expectedCurrency) {
          throw new AppError("Webhook currency mismatch", 409);
        }
      }

      // Additional S2S verification with payment provider API.
      await verifyGatewayInvoice({
        paymentRef: paymentRef || String(targetPayment.providerRef || ""),
        orderId: order.id,
        expectedAmount,
        expectedCurrency: String(order.currency).toUpperCase(),
      });
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: targetPayment.id },
        data: {
          status: nextPaymentStatus,
          providerRef: paymentRef || targetPayment.providerRef,
          processedAt: mapped === "processing" ? null : new Date(),
          payload: rawPayload as any,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          status: nextOrderStatus,
          paymentId: paymentRef || targetPayment.providerRef || targetPayment.id,
        },
      }),
    ]);

    if (nextOrderStatus === OrderStatus.PAID && order.status !== OrderStatus.PAID) {
      if (order.promoCodeId) {
        await prisma.promoCode.update({
          where: { id: order.promoCodeId },
          data: { usedCount: { increment: 1 } },
        });
      }

      if (order.partnerId) {
        const partner = await prisma.partner.findUnique({ where: { id: order.partnerId } });
        if (partner) {
          const commission = Number(((Number(order.totalAmount) * Number(partner.payoutPercent)) / 100).toFixed(2));
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
          console.info(`[partner] earning created order=${order.id} partner=${partner.id} amount=${commission}`);
        }
      }

      const sideEffects = await Promise.allSettled([
        sendOrderPaidEmail(order.email, {
          orderId: order.id,
          amount: Number(order.totalAmount),
          currency: order.currency,
        }),
        sendTelegramNotification(`Order paid (webhook): ${order.id}, ${order.email}, ${order.totalAmount} ${order.currency}`),
        deliverProduct(order),
      ]);
      sideEffects.forEach((effect, index) => {
        if (effect.status === "rejected") {
          const effectName = index === 0 ? "email" : index === 1 ? "telegram" : "delivery";
          console.error(`[payment] post-paid ${effectName} failed for order=${order.id}`, effect.reason);
        }
      });
      console.info(`[payment] order ${order.id} marked as PAID via webhook`);
    }

    if (nextOrderStatus === OrderStatus.FAILED) {
      console.info(`[payment] order ${order.id} marked as FAILED via webhook`);
    }

    if (nextOrderStatus === OrderStatus.REFUNDED) {
      await prisma.partnerEarning.updateMany({
        where: {
          orderId: order.id,
          status: { not: PartnerEarningStatus.REVERSED },
        },
        data: {
          status: PartnerEarningStatus.REVERSED,
        },
      });
      console.info(`[partner] earning reversed for order=${order.id}`);
    }

    return { ok: true, duplicate: false, orderId: order.id };
  },
};

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Number(amount.toFixed(2));
}

async function verifyGatewayInvoice(input: {
  paymentRef: string;
  orderId: string;
  expectedAmount: number;
  expectedCurrency: string;
}) {
  const paymentRef = String(input.paymentRef || "").trim();
  if (!paymentRef) throw new AppError("Missing payment reference for provider verification", 409);

  const apiKey = env.ENOT_API_KEY || env.PAYMENT_SECRET;
  const shopId = env.ENOT_SHOP_ID || env.PAYMENT_SHOP_ID;
  if (!apiKey || !shopId) throw new AppError("Payment provider credentials are not configured", 500);

  const invoiceInfoUrl = new URL("/invoice/info", env.PAYMENT_API_BASE_URL);
  invoiceInfoUrl.searchParams.set("shop_id", String(shopId));
  invoiceInfoUrl.searchParams.set("invoice_id", paymentRef);

  const response = await fetch(invoiceInfoUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });
  if (!response.ok) {
    throw new AppError("Payment provider verification failed", 409);
  }

  const payload = (await response.json()) as {
    status_check?: boolean;
    data?: {
      order_id?: string;
      status?: string;
      currency?: string;
      invoice_amount?: number | string;
      amount?: number | string;
    };
  };
  const info = payload?.data;
  if (!payload?.status_check || !info) throw new AppError("Payment provider verification failed", 409);

  if (String(info.order_id || "") !== String(input.orderId)) {
    throw new AppError("Payment provider order mismatch", 409);
  }
  const status = String(info.status || "").toLowerCase();
  if (!["success", "succeeded", "paid"].includes(status)) {
    throw new AppError("Payment is not confirmed by provider", 409);
  }

  const providerAmount = parseAmount(info.invoice_amount ?? info.amount);
  if (providerAmount === null || Math.abs(providerAmount - input.expectedAmount) > 0.01) {
    throw new AppError("Payment provider amount mismatch", 409);
  }
  const providerCurrency = String(info.currency || "").toUpperCase();
  if (providerCurrency && providerCurrency !== input.expectedCurrency) {
    throw new AppError("Payment provider currency mismatch", 409);
  }
}
