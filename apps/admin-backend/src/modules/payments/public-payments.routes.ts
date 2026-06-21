import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../common/middleware/validation";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { paymentsService } from "./payments.service";
import { checkoutCreateRateLimit } from "../../common/security/rate-limit";
import { env } from "../../config/env";
import { buildSiteOrderTelegramDeepLink } from "../orders/telegram-order-linking";

const createPaymentSchema = z.object({
  email: z.preprocess((value) => String(value || "").trim().toLowerCase(), z.string().email()),
  plan_id: z.preprocess((value) => String(value || "").trim(), z.string().optional()),
  planId: z.preprocess((value) => String(value || "").trim(), z.string().optional()),
  product_id: z.preprocess((value) => String(value || "").trim(), z.string().optional()),
  productId: z.preprocess((value) => String(value || "").trim(), z.string().optional()),
  promo_code: z.preprocess((value) => {
    const normalized = String(value || "").trim();
    return normalized ? normalized : undefined;
  }, z.string().max(40).optional()),
  promoCode: z.preprocess((value) => {
    const normalized = String(value || "").trim();
    return normalized ? normalized : undefined;
  }, z.string().max(40).optional()),
  qty: z.coerce.number().int().min(1).max(100).optional(),
  quantity: z.coerce.number().int().min(1).max(100).optional(),
  payment_method: z.preprocess((value) => String(value || "").trim().toLowerCase(), z.string().optional()),
  paymentMethod: z.preprocess((value) => String(value || "").trim().toLowerCase(), z.string().optional()),
  order_details: z.unknown().optional(),
  orderDetails: z.unknown().optional(),
}).passthrough();

const allowedPublicPaymentMethods = new Set(["enot", "lava"]);

function normalizePublicPaymentMethod(input: string) {
  const raw = String(input || "").trim().toLowerCase();
  if (raw === "enot.io") return "enot";
  if (raw === "gateway") return "enot";
  return raw;
}

function sanitizePublicOrderDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const json = JSON.stringify(value);
    if (!json || json.length > 12000) return undefined;
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function stringField(body: Record<string, unknown>, key: string) {
  return String(body[key] || "").trim();
}

function boolField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function buildOrderDetailsFromFlatBody(body: Record<string, unknown>, productId: string) {
  const hasAnyCheckoutField = [
    "contactEmail",
    "telegram",
    "deliveryMethod",
    "duration",
    "accountStatus",
    "serviceLogin",
    "servicePassword",
    "isGift",
    "giftSender",
    "giftRecipient",
    "giftDeliveryMethod",
    "giftRecipientContact",
    "giftSendDate",
    "giftSendTime",
    "giftMessage",
    "giftCertificateDesign",
    "cameByRecommendation",
    "referrerContact",
    "orderComment",
  ].some(key => body[key] !== undefined && String(body[key] ?? "").trim() !== "");
  if (!hasAnyCheckoutField) return undefined;

  return sanitizePublicOrderDetails({
    source: "flat-checkout-fields",
    capturedAt: new Date().toISOString(),
    product: {
      id: productId,
      title: stringField(body, "productTitle") || stringField(body, "title"),
      price: Number(body.price || 0) || undefined,
      currency: stringField(body, "currency") || undefined,
    },
    selection: {
      product: stringField(body, "product") || "ChatGPT",
      plan: stringField(body, "plan"),
      deliveryMethod: stringField(body, "deliveryMethod"),
      duration: stringField(body, "duration"),
      quantity: Number(body.quantity || body.qty || 1) || 1,
      paymentMethod: stringField(body, "paymentMethod") || stringField(body, "payment_method"),
      promoCode: stringField(body, "promoCode") || stringField(body, "promo_code") || null,
    },
    contact: {
      email: stringField(body, "contactEmail") || stringField(body, "email"),
      telegram: stringField(body, "telegram"),
    },
    gift: boolField(body, "isGift")
      ? {
          isGift: true,
          sender: stringField(body, "giftSender"),
          recipient: stringField(body, "giftRecipient"),
          deliveryMethod: stringField(body, "giftDeliveryMethod"),
          recipientContact: stringField(body, "giftRecipientContact"),
          sendDate: stringField(body, "giftSendDate"),
          sendTime: stringField(body, "giftSendTime"),
          message: stringField(body, "giftMessage"),
          certificateDesign: stringField(body, "giftCertificateDesign"),
        }
      : { isGift: false },
    account: {
      status: stringField(body, "accountStatus"),
      login: stringField(body, "serviceLogin"),
      password: stringField(body, "servicePassword"),
    },
    recommendation: {
      cameByRecommendation: boolField(body, "cameByRecommendation"),
      referrerContact: stringField(body, "referrerContact"),
    },
    comment: stringField(body, "orderComment"),
  });
}

function resolvePublicOrigin(req: any) {
  const forwardedHost = String(req.get("x-forwarded-host") || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req.get("host") || "").trim();
  if (!host) return "";

  const forwardedProto = String(req.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = forwardedProto || String(req.protocol || "https").trim().toLowerCase();
  return `${protocol}://${host}`;
}

export const publicPaymentsRouter = Router();

publicPaymentsRouter.post(
  "/:provider/create",
  checkoutCreateRateLimit,
  validateBody(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const provider = normalizePublicPaymentMethod(String(req.params.provider || ""));
    if (!allowedPublicPaymentMethods.has(provider)) {
      throw new AppError("Unsupported payment provider", 400);
    }

    const body = req.body as z.infer<typeof createPaymentSchema>;
    const productId = String(body.plan_id || body.planId || body.product_id || body.productId || "").trim();
    if (!productId) {
      throw new AppError("Validation failed", 422, {
        formErrors: [],
        fieldErrors: {
          plan_id: ["Product id is required"],
        },
      });
    }
    const promoCode = String(body.promo_code || body.promoCode || "").trim() || undefined;
    const paymentMethod = normalizePublicPaymentMethod(String(body.payment_method || body.paymentMethod || provider));
    const orderDetails =
      sanitizePublicOrderDetails(body.order_details ?? body.orderDetails) ||
      buildOrderDetailsFromFlatBody(body as Record<string, unknown>, productId);

    const created = await paymentsService.createOrderWithPayment({
      email: body.email,
      productId,
      quantity: 1,
      paymentMethod,
      promoCode,
      orderDetails,
      ip: req.ip,
    });

    if (!created.checkoutUrl) {
      throw new AppError("Failed to create payment URL", 502);
    }

    const publicOrigin = resolvePublicOrigin(req) || `${req.protocol}://${req.get("host")}`;
    const activationUrl = new URL(created.deliveryType === "vpn" ? "/store/vpn/activate" : "/redeem-start.html", publicOrigin);
    activationUrl.searchParams.set("order_id", created.orderId);
    if (created.redeemToken) {
      activationUrl.searchParams.set("t", created.redeemToken);
    }
    const telegramUrl = buildSiteOrderTelegramDeepLink({
      botUsername: env.TELEGRAM_BOT_USERNAME || "GPTishka_myBot",
      orderId: created.orderId,
      orderToken: created.redeemToken,
    });

    return res.status(201).json({
      order_id: created.orderId,
      pay_url: created.checkoutUrl,
      activation_url: activationUrl.toString(),
      telegram_url: telegramUrl || null,
      activation_token: created.redeemToken,
      amount: created.finalPrice,
      base_amount: created.basePrice,
      discount: created.discountAmount,
      promo_code: created.promoCode,
      payment_method: created.paymentProvider,
    });
  })
);
