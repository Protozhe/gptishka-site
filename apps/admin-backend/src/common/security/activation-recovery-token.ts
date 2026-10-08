import crypto from "crypto";
import { env } from "../../config/env";

const RECOVERY_TOKEN_PREFIX = "r1.";

function recoverySecret() {
  return String(
    env.ACTIVATION_RECOVERY_LINK_SECRET ||
      env.ACTIVATION_TOKEN_ENCRYPTION_KEY ||
      env.JWT_ACCESS_SECRET
  ).trim();
}

function recoverySignature(orderId: string, redeemTokenHash: string) {
  return crypto
    .createHmac("sha256", recoverySecret())
    .update("gptishka-order-activation-recovery\0")
    .update(String(orderId || "").trim())
    .update("\0")
    .update(String(redeemTokenHash || "").trim())
    .digest("base64url");
}

export function createActivationRecoveryToken(orderId: string, redeemTokenHash: string) {
  return `${RECOVERY_TOKEN_PREFIX}${recoverySignature(orderId, redeemTokenHash)}`;
}

export function isActivationRecoveryTokenValid(
  orderId: string,
  redeemTokenHash: string,
  token: string | null | undefined
) {
  const provided = String(token || "").trim();
  if (!provided.startsWith(RECOVERY_TOKEN_PREFIX) || provided.length > 128) return false;

  const expected = createActivationRecoveryToken(orderId, redeemTokenHash);
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
