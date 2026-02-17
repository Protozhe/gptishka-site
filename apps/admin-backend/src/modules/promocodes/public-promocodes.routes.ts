import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/http/async-handler";
import { validateBody } from "../../common/middleware/validation";
import { paymentsService } from "../payments/payments.service";
import { promoValidateRateLimit } from "../../common/security/rate-limit";

const validatePromoSchema = z.object({
  code: z.string().min(2).max(40),
  productId: z.string().min(10),
  quantity: z.coerce.number().int().min(1).max(100).optional(),
});

export const publicPromoCodesRouter = Router();

publicPromoCodesRouter.post(
  "/promo/validate",
  promoValidateRateLimit,
  validateBody(validatePromoSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof validatePromoSchema>;
    const result = await paymentsService.validatePromoCode({
      code: body.code,
      productId: body.productId,
      quantity: body.quantity ?? 1,
    });
    res.json({
      valid: result.valid,
      basePrice: result.basePrice,
      discountAmount: result.discountAmount,
      finalPrice: result.finalPrice,
    });
  })
);
