import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../common/middleware/validation";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { paymentsService } from "./payments.service";
import { checkoutCreateRateLimit } from "../../common/security/rate-limit";

const createEnotPaymentSchema = z.object({
  email: z.string().email(),
  plan_id: z.string().min(10),
  promo_code: z.string().min(2).max(40).optional(),
  qty: z.coerce.number().int().min(1).max(100).optional(),
});

export const publicEnotRouter = Router();

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

    return res.status(201).json({
      order_id: created.orderId,
      pay_url: created.checkoutUrl,
      amount: created.finalPrice,
      base_amount: created.basePrice,
      discount: created.discountAmount,
      promo_code: created.promoCode,
    });
  })
);
