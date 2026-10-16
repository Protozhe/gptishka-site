import crypto from "crypto";
import { env } from "../../config/env";

export const ACTIVATION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function recoverySecret() {
  return String(env.ACTIVATION_RECOVERY_LINK_SECRET || env.ACTIVATION_TOKEN_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET).trim();
}

function recoverySignature(orderId: string, redeemTokenHash: string, expires?: number) {
  const hmac = crypto.createHmac("sha256", recoverySecret());
  hmac.update(expires === undefined ? "gptishka-order-activation-recovery\0" : "gptishka-order-activation-recovery-v2\0");
  hmac.update(String(orderId).trim()).update("\0").update(String(redeemTokenHash).trim());
  if (expires !== undefined) hmac.update("\0").update(String(expires));
  return hmac.digest("base64url");
}

function equal(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createActivationRecoveryToken(orderId: string, redeemTokenHash: string, now = Date.now()) {
  const expires = Math.floor((now + ACTIVATION_LINK_TTL_MS) / 1000);
  return `r2.${expires}.${recoverySignature(orderId, redeemTokenHash, expires)}`;
}

export function isOriginalActivationLinkFresh(createdAt: Date | string, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) && created <= now + 60_000 && now < created + ACTIVATION_LINK_TTL_MS;
}

export function isActivationRecoveryTokenValid(
  orderId: string, redeemTokenHash: string, token: string | null | undefined,
  createdAt?: Date | string, now = Date.now()
) {
  const provided = String(token || "").trim();
  if (!redeemTokenHash || provided.length > 128) return false;
  const match = /^r2\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(provided);
  if (match) {
    const expires = Number(match[1]);
    if (expires * 1000 <= now || expires * 1000 > now + ACTIVATION_LINK_TTL_MS) return false;
    return equal(match[2], recoverySignature(orderId, redeemTokenHash, expires));
  }
  // Existing links remain usable only within seven days of purchase.
  return provided.startsWith("r1.") && !!createdAt && isOriginalActivationLinkFresh(createdAt, now) &&
    equal(provided, `r1.${recoverySignature(orderId, redeemTokenHash)}`);
}
