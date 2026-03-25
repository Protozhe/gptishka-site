import { Router } from "express";
import { telegramWebhookRateLimit } from "../../common/security/rate-limit";
import { handleTelegramWebhook } from "./telegram.controller";

export const telegramRouter = Router();

telegramRouter.post("/webhook", telegramWebhookRateLimit, handleTelegramWebhook);

