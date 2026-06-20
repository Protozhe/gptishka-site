import { env } from "../../config/env";
import { PaymentCreateInput } from "./payment-provider";

const TELEGRAM_BOT_HANDLES: Record<string, string> = {
  claude: "claudeaioffibot",
  chatgpt: "chatgptaioffbot",
  grok: "grokaioffbot",
};

function sanitizeTelegramStartParam(value: string) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 50);
}

function buildTelegramBotUrl(botType: string, prefix: "paid" | "pay", orderId: string) {
  const handle = TELEGRAM_BOT_HANDLES[botType];
  if (!handle) return null;
  const url = new URL(`https://t.me/${handle}`);
  url.searchParams.set("start", `${prefix}_${sanitizeTelegramStartParam(orderId)}`);
  return url;
}

export function buildPaymentReturnUrls(input: PaymentCreateInput) {
  const source = String(input.metadata?.source || "").trim().toLowerCase();
  const botType = String(input.metadata?.botType || "").trim().toLowerCase();

  if (source === "telegram") {
    const successUrl = buildTelegramBotUrl(botType, "paid", input.orderId);
    const failUrl = buildTelegramBotUrl(botType, "pay", input.orderId);
    if (successUrl && failUrl) return { successUrl, failUrl };
  }

  const successUrl = new URL(env.PAYMENT_SUCCESS_URL);
  successUrl.searchParams.set("order_id", input.orderId);
  const failUrl = new URL(env.PAYMENT_FAIL_URL);
  failUrl.searchParams.set("order_id", input.orderId);

  const redeemToken = typeof input.metadata?.redeemToken === "string" ? input.metadata.redeemToken.trim() : "";
  if (redeemToken) {
    successUrl.searchParams.set("t", redeemToken);
    failUrl.searchParams.set("t", redeemToken);
  }

  return { successUrl, failUrl };
}
