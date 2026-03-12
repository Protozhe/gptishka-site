import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../common/middleware/validation";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { paymentsService } from "./payments.service";
import { checkoutCreateRateLimit } from "../../common/security/rate-limit";
import { prisma } from "../../config/prisma";
import { resolveProductDeliveryType } from "../../common/utils/product-delivery";

const createEnotPaymentSchema = z.object({
  email: z.string().email(),
  plan_id: z.string().min(10),
  promo_code: z.string().min(2).max(40).optional(),
  qty: z.coerce.number().int().min(1).max(100).optional(),
});

export const publicEnotRouter = Router();

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

publicEnotRouter.post(
  "/create",
  checkoutCreateRateLimit,
  validateBody(createEnotPaymentSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createEnotPaymentSchema>;
    const created = await paymentsService.createOrderWithPayment({
      email: body.email,
      productId: body.plan_id,
      quantity: 1,
      paymentMethod: "enot",
      promoCode: body.promo_code,
      ip: req.ip,
    });

    if (!created.checkoutUrl) {
      throw new AppError("Failed to create Enot payment URL", 502);
    }

    const publicOrigin = resolvePublicOrigin(req) || `${req.protocol}://${req.get("host")}`;
    const product = await prisma.product.findUnique({
      where: { id: body.plan_id },
      select: { tags: true },
    });
    const deliveryType = resolveProductDeliveryType(product?.tags || []);
    const activationUrl = new URL(deliveryType === "vpn" ? "/store/vpn/activate" : "/redeem-start.html", publicOrigin);
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
    });
  })
);
