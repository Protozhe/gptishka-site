import { env } from "../../config/env";

export type LavaCredentials = {
  shopId: string;
  secretKey: string;
  webhookSecret: string;
};

function normalizeBotType(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function buildCredentials(shopId: string, secretKey: string, webhookSecret: string): LavaCredentials | null {
  const normalizedShopId = String(shopId || "").trim();
  const normalizedSecretKey = String(secretKey || "").trim();
  const normalizedWebhookSecret = String(webhookSecret || "").trim();
  if (!normalizedShopId || !normalizedSecretKey) return null;
  return {
    shopId: normalizedShopId,
    secretKey: normalizedSecretKey,
    webhookSecret: normalizedWebhookSecret,
  };
}

export function resolveLavaCredentials(input?: { botType?: unknown } | null): LavaCredentials | null {
  const botType = normalizeBotType(input?.botType);

  if (botType === "grok") {
    const grok = buildCredentials(
      env.LAVA_GROK_SHOP_ID,
      env.LAVA_GROK_SECRET_KEY,
      env.LAVA_GROK_WEBHOOK_SECRET || env.LAVA_GROK_ADDITIONAL_SECRET
    );
    if (grok) return grok;
  }

  if (botType === "chatgpt") {
    const chatgpt = buildCredentials(
      env.LAVA_CHATGPT_SHOP_ID,
      env.LAVA_CHATGPT_SECRET_KEY,
      env.LAVA_CHATGPT_WEBHOOK_SECRET || env.LAVA_CHATGPT_ADDITIONAL_SECRET
    );
    if (chatgpt) return chatgpt;
  }

  return buildCredentials(env.LAVA_SHOP_ID, env.LAVA_SECRET_KEY, env.LAVA_WEBHOOK_SECRET || env.LAVA_ADDITIONAL_SECRET);
}

export function getLavaWebhookSecrets() {
  return [
    env.LAVA_WEBHOOK_SECRET || env.LAVA_ADDITIONAL_SECRET,
    env.LAVA_GROK_WEBHOOK_SECRET || env.LAVA_GROK_ADDITIONAL_SECRET,
    env.LAVA_CHATGPT_WEBHOOK_SECRET || env.LAVA_CHATGPT_ADDITIONAL_SECRET,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}
