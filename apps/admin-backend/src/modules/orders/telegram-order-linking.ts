import crypto from "crypto";
import { AppError } from "../../common/errors/app-error";

const TELEGRAM_START_PAYLOAD_RE = /^[A-Za-z0-9_-]+$/;
const ORDER_ID_RE = /^[A-Za-z0-9]{8,32}$/;
const PROOF_RE = /^[A-Za-z0-9_-]{32}$/;
const LEGACY_TOKEN_RE = /^[A-Za-z0-9_-]{16,32}$/;
const SHA256_HEX_RE = /^[a-fA-F0-9]{64}$/;

export type SiteOrderStartPayload =
  | {
      kind: "compact-proof";
      orderId: string;
      proof: string;
    }
  | {
      kind: "legacy-token";
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

export function buildTelegramOrderLinkProof(input: { orderId: string; redeemTokenHash: string }) {
  const orderId = String(input.orderId || "").trim();
  const redeemTokenHash = String(input.redeemTokenHash || "").trim();
  return crypto
    .createHash("sha256")
    .update(`tg-order-link:${orderId}:${redeemTokenHash}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 32);
}

function isTimingSafeEqual(value: string, expected: string, encoding: BufferEncoding = "utf8") {
  const valueBuffer = Buffer.from(value, encoding);
  const expectedBuffer = Buffer.from(expected, encoding);
  if (valueBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

export function verifyRedeemTokenHash(input: { expectedHash?: string | null; providedToken?: string | null }) {
  const expectedHash = String(input.expectedHash || "").trim();
  const providedToken = String(input.providedToken || "").trim();
  if (!expectedHash || !SHA256_HEX_RE.test(expectedHash)) throw new AppError("Order does not support Telegram linking", 409);
  if (!providedToken) throw new AppError("Order link token is required", 401);
  if (!isTimingSafeEqual(sha256Hex(providedToken), expectedHash, "hex")) {
    throw new AppError("Invalid order link token", 403);
  }
}

export function verifyTelegramOrderLinkProof(input: {
  orderId: string;
  redeemTokenHash?: string | null;
  providedProof?: string | null;
}) {
  const orderId = String(input.orderId || "").trim();
  const redeemTokenHash = String(input.redeemTokenHash || "").trim();
  const providedProof = String(input.providedProof || "").trim();
  if (!redeemTokenHash || !SHA256_HEX_RE.test(redeemTokenHash)) {
    throw new AppError("Order does not support Telegram linking", 409);
  }
  if (!providedProof) throw new AppError("Order link token is required", 401);
  if (!ORDER_ID_RE.test(orderId)) throw new AppError("Invalid order link token", 403);

  const expectedProof = buildTelegramOrderLinkProof({
    orderId,
    redeemTokenHash,
  });
  if (providedProof.length !== expectedProof.length || !PROOF_RE.test(providedProof)) {
    throw new AppError("Invalid order link token", 403);
  }
  if (!isTimingSafeEqual(providedProof, expectedProof)) {
    throw new AppError("Invalid order link token", 403);
  }
}

export function parseSiteOrderStartPayload(payload: unknown): SiteOrderStartPayload | null {
  const raw = String(payload || "").trim();
  if (!raw || raw.length > 64 || !TELEGRAM_START_PAYLOAD_RE.test(raw)) return null;

  const compactMatch = raw.match(/^o_([a-zA-Z0-9]{8,32})_([a-zA-Z0-9_-]{32})$/);
  if (compactMatch) {
    return {
      kind: "compact-proof",
      orderId: String(compactMatch[1] || "").trim(),
      proof: String(compactMatch[2] || "").trim(),
    };
  }

  const match = raw.match(/^order_([a-zA-Z0-9]{8,32})_([a-zA-Z0-9_-]{16,32})$/);
  if (!match || !LEGACY_TOKEN_RE.test(String(match[2] || ""))) return null;
  return {
    kind: "legacy-token",
    orderId: String(match[1] || "").trim(),
    orderToken: String(match[2] || "").trim(),
  };
}

export function isCompactTelegramOrderPayload(
  payload: SiteOrderStartPayload | null
): payload is Extract<SiteOrderStartPayload, { kind: "compact-proof" }> {
  return payload?.kind === "compact-proof";
}

export function isLegacyTelegramOrderPayload(
  payload: SiteOrderStartPayload | null
): payload is Extract<SiteOrderStartPayload, { kind: "legacy-token" }> {
  return payload?.kind === "legacy-token";
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
  if (!ORDER_ID_RE.test(orderId)) return "";

  const redeemTokenHash = sha256Hex(orderToken);
  const proof = buildTelegramOrderLinkProof({ orderId, redeemTokenHash });
  const startPayload = `o_${orderId}_${proof}`;
  if (startPayload.length > 64 || !TELEGRAM_START_PAYLOAD_RE.test(startPayload)) return "";

  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(startPayload)}`;
}
