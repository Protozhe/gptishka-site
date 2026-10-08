import crypto from "crypto";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";
import { asyncHandler } from "../../common/http/async-handler";
import { paymentWebhookService } from "./payment-webhook.service";

export const handlePallyWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body) || !env.PALLY_API_TOKEN) {
    throw new AppError("Invalid Pally webhook", 400);
  }
  const form = new URLSearchParams(req.body.toString("utf8"));
  for (const key of ["InvId", "OutSum", "TrsId", "Status", "CurrencyIn", "SignatureValue"]) {
    if (form.getAll(key).length !== 1 || !form.get(key)) {
      throw new AppError("Invalid Pally webhook field", 400);
    }
  }
  const orderId = form.get("InvId")!;
  const amount = form.get("OutSum")!;
  const paymentRef = form.get("TrsId")!;
  const signature = form.get("SignatureValue")!;
  const expected = crypto.createHash("md5")
    .update(`${amount}:${orderId}:${env.PALLY_API_TOKEN}`, "utf8")
    .digest("hex")
    .toUpperCase();
  if (!/^[A-F0-9]{32}$/i.test(signature) ||
      !crypto.timingSafeEqual(Buffer.from(signature.toUpperCase()), Buffer.from(expected))) {
    throw new AppError("Invalid Pally webhook signature", 401);
  }

  const payment = await prisma.payment.findFirst({
    where: { orderId, provider: "pally", providerRef: paymentRef },
    select: { id: true },
  });
  if (!payment) throw new AppError("Pally payment not found", 404);

  const status = form.get("Status")!.toUpperCase();
  if (!["SUCCESS", "OVERPAID", "UNDERPAID", "FAIL"].includes(status)) {
    throw new AppError("Unknown Pally payment status", 400);
  }
  const result = await paymentWebhookService.handle({
    paymentId: paymentRef,
    orderId,
    status: status === "SUCCESS" ? "success" : status === "FAIL" ? "failed" : "processing",
    amount,
    currency: form.get("CurrencyIn")!,
    pallyStatus: status,
    commission: form.get("Commission") || "",
    balanceAmount: form.get("BalanceAmount") || "",
    balanceCurrency: form.get("BalanceCurrency") || "",
    accountType: form.get("AccountType") || "",
  });
  res.json(result);
});
