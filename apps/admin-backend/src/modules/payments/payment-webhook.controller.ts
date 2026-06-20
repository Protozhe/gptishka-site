import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { paymentWebhookService } from "./payment-webhook.service";
import { runPaymentWebhookOnce } from "./webhook-idempotency.service";

type PaymentWebhookHandlerDeps = {
  runPaymentWebhookOnce?: typeof runPaymentWebhookOnce;
  paymentWebhookService?: Pick<typeof paymentWebhookService, "handle">;
};

export function createPaymentWebhookHandler(defaultProvider: string, deps: PaymentWebhookHandlerDeps = {}) {
  const runOnce = deps.runPaymentWebhookOnce || runPaymentWebhookOnce;
  const service = deps.paymentWebhookService || paymentWebhookService;

  return asyncHandler(async (req: Request, res: Response) => {
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
      result = await runOnce(defaultProvider, payload as any, () => service.handle(payload as any));
    } catch (error) {
      console.error("[payment-webhook] processing error", error);
      throw error;
    }
    res.json(result);
  });
}

export const handlePaymentWebhook = createPaymentWebhookHandler("gateway");
