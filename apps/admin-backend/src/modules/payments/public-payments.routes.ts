import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../common/middleware/validation";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { paymentsService } from "./payments.service";
import { checkoutCreateRateLimit } from "../../common/security/rate-limit";

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
});

const allowedPublicPaymentMethods = new Set(["enot", "lava"]);

function normalizePublicPaymentMethod(input: string) {
  const raw = String(input || "").trim().toLowerCase();
  if (raw === "enot.io") return "enot";
  if (raw === "gateway") return "enot";
  return raw;
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

    const created = await paymentsService.createOrderWithPayment({
      email: body.email,
      productId,
      quantity: 1,
      paymentMethod,
      promoCode,
      ip: req.ip,
    });

    if (!created.checkoutUrl) {
      throw new AppError("Failed to create payment URL", 502);
    }

    const publicOrigin = resolvePublicOrigin(req) || `${req.protocol}://${req.get("host")}`;
    const activationUrl = new URL("/redeem-start.html", publicOrigin);
    activationUrl.searchParams.set("order_id", created.orderId);
    if (created.redeemToken) {
      activationUrl.searchParams.set("t", created.redeemToken);
    }

    return res.status(201).json({
      order_id: created.orderId,
      pay_url: created.checkoutUrl,
      activation_url: activationUrl.toString(),
      activation_token: created.redeemToken,
      amount: created.finalPrice,
      base_amount: created.basePrice,
      discount: created.discountAmount,
      promo_code: created.promoCode,
      payment_method: paymentMethod,
    });
  })
);
