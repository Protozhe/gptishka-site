import crypto from "crypto";
import { AppError } from "../errors/app-error";
import { isActivationRecoveryTokenValid, isOriginalActivationLinkFresh } from "./activation-recovery-token";

export function assertOrderLinkAccess(
  order: { id: string; redeemTokenHash?: string | null; createdAt: Date | string },
  token?: string
) {
  const expected = String(order.redeemTokenHash || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(expected)) throw new AppError("Request a new activation link from support", 401);
  const provided = String(token || "").trim();
  if (!provided) throw new AppError("Activation link token is required", 401);
  if (provided.length > 128) throw new AppError("Invalid activation link token", 403);
  const hash = crypto.createHash("sha256").update(provided).digest("hex");
  const originalMatches = crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex")) &&
    isOriginalActivationLinkFresh(order.createdAt);
  if (!originalMatches && !isActivationRecoveryTokenValid(order.id, expected, provided, order.createdAt)) {
    throw new AppError("Activation link is invalid or expired. Request a new link from support", 403);
  }
}
