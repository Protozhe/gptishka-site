import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { paymentWebhookService } from "./payment-webhook.service";
import { runPaymentWebhookOnce } from "./webhook-idempotency.service";

export const handlePaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body)) {
    throw new AppError("Invalid webhook body", 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(req.body.toString("utf-8"));
  } catch {
    throw new AppError("Invalid JSON in webhook", 400);
  }

  let result;
  try {
    const provider = String((payload as any)?.provider || (payload as any)?.payment_provider || "gateway");
    result = await runPaymentWebhookOnce(provider, payload as any, () => paymentWebhookService.handle(payload as any));
  } catch (error) {
    console.error("[payment-webhook] processing error", error);
    throw error;
  }
  res.json(result);
});
