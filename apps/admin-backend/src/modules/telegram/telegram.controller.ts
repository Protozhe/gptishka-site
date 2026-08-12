import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { telegramService } from "./telegram.service";

export const handleTelegramWebhook = asyncHandler(async (req: Request, res: Response) => {
  const expectedSecret = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (expectedSecret) {
    const headerSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "").trim();
    if (!headerSecret || headerSecret !== expectedSecret) {
      throw new AppError("Invalid telegram webhook secret", 401);
    }
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    throw new AppError("Invalid telegram webhook payload", 400);
  }

  try {
    const result = await telegramService.handleWebhookUpdate(payload);
    res.json({ ok: true, result });
  } catch (error) {
    console.error("[telegram-webhook] failed", error);
    throw error;
  }
});

