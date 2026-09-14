import crypto from "crypto";
import { env } from "../../config/env";

export type ActivationReviewModerationDecision = "approved" | "rejected";

function moderationSecret() {
  return String(env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_BOT_TOKEN || "").trim();
}

function signature(publicId: string, decision: ActivationReviewModerationDecision) {
  const secret = moderationSecret();
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${publicId}:${decision}`)
    .digest("hex")
    .slice(0, 16);
}

export function buildActivationReviewModerationCallback(
  publicId: string,
  decision: ActivationReviewModerationDecision
) {
  const idPart = String(publicId || "").replace(/^site-/i, "").toLowerCase();
  const action = decision === "approved" ? "a" : "r";
  return `ar:${action}:${idPart}:${signature(`site-${idPart}`, decision)}`;
}

export function parseActivationReviewModerationCallback(value: unknown): {
  publicId: string;
  decision: ActivationReviewModerationDecision;
} | null {
  const match = String(value || "").trim().match(/^ar:(a|r):([a-f0-9]{20}):([a-f0-9]{16})$/i);
  if (!match) return null;

  const publicId = `site-${match[2].toLowerCase()}`;
  const decision: ActivationReviewModerationDecision = match[1].toLowerCase() === "a" ? "approved" : "rejected";
  const expected = signature(publicId, decision);
  const actual = match[3].toLowerCase();
  if (!expected || expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return null;
  return { publicId, decision };
}
