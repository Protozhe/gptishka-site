import crypto from "crypto";
import { AppError } from "../../common/errors/app-error";

export type SiteOrderStartPayload = {
  orderId: string;
  orderToken: string;
};

export function normalizeTelegramIdForOrder(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^\d-]/g, "");
  if (!normalized) throw new AppError("Telegram user id is required", 400);
  return normalized;
}

export function normalizeTelegramUsernameForOrder(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 64);
  return normalized || null;
}

export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function verifyRedeemTokenHash(input: { expectedHash?: string | null; providedToken?: string | null }) {
  const expectedHash = String(input.expectedHash || "").trim();
  const providedToken = String(input.providedToken || "").trim();
  if (!expectedHash) throw new AppError("Order does not support Telegram linking", 409);
  if (!providedToken) throw new AppError("Order link token is required", 401);
  if (sha256Hex(providedToken) !== expectedHash) {
    throw new AppError("Invalid order link token", 403);
  }
}

export function parseSiteOrderStartPayload(payload: unknown): SiteOrderStartPayload | null {
  const raw = String(payload || "").trim();
  const match = raw.match(/^order_([a-zA-Z0-9]{8,64})_([a-zA-Z0-9_-]{16,256})$/);
  if (!match) return null;
  return {
    orderId: String(match[1] || "").trim(),
    orderToken: String(match[2] || "").trim(),
  };
}

export function buildSiteOrderTelegramDeepLink(input: {
  botUsername?: string | null;
  orderId: string;
  orderToken?: string | null;
}) {
  const username = String(input.botUsername || "").trim().replace(/^@+/, "");
  const orderId = String(input.orderId || "").trim();
  const orderToken = String(input.orderToken || "").trim();
  if (!username || !orderId || !orderToken) return "";
  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(`order_${orderId}_${orderToken}`)}`;
}
