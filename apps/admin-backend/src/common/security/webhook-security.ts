import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { AppError } from "../errors/app-error";

function getClientIp(req: Request) {
  const xff = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return (xff || req.ip || "").replace("::ffff:", "");
}

export function allowWebhookIp(req: Request, _res: Response, next: NextFunction) {
  const allowRaw = String(env.PAYMENT_WEBHOOK_IP_ALLOWLIST || "").trim();
  return allowWebhookIpFromList(allowRaw, req, next, env.NODE_ENV === "production");
}

export function allowLavaWebhookIp(req: Request, _res: Response, next: NextFunction) {
  const allowRaw = String(env.LAVA_WEBHOOK_IP_ALLOWLIST || "").trim();
  // Lava IP list is optional: if empty, rely on signature + S2S verification.
  return allowWebhookIpFromList(allowRaw, req, next, false);
}

function allowWebhookIpFromList(allowRaw: string, req: Request, next: NextFunction, requireInProduction: boolean) {
  if (!allowRaw) {
    if (requireInProduction) {
      return next(new AppError("Webhook IP allowlist is not configured", 403));
    }
    return next();
  }

  const allow = new Set(
    allowRaw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );
  const ip = getClientIp(req);
  if (!allow.has(ip)) {
    return next(new AppError("Forbidden", 403));
  }
  return next();
}

export function verifyWebhookSignature(req: Request, _res: Response, next: NextFunction) {
  const webhookSecret = env.ENOT_WEBHOOK_SECRET || env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return next(new AppError("Webhook secret is not configured", 500));
  }

  const headerName = env.PAYMENT_WEBHOOK_SIGNATURE_HEADER.toLowerCase();
  const incoming = String(
    req.headers[headerName] || req.headers["x-api-sha256-signature"] || req.headers["x-signature"] || ""
  )
    .trim()
    .toLowerCase();
  if (!incoming) return next(new AppError("Invalid webhook signature", 401));

  if (!Buffer.isBuffer(req.body)) {
    return next(new AppError("Invalid webhook body", 400));
  }

  let bodyObject: unknown;
  try {
    bodyObject = JSON.parse(req.body.toString("utf-8"));
  } catch {
    return next(new AppError("Invalid webhook body", 400));
  }

  const expectedSorted = crypto
    .createHmac("sha256", webhookSecret)
    .update(stableStringifySorted(bodyObject), "utf8")
    .digest("hex")
    .toLowerCase();
  const expectedRaw = crypto.createHmac("sha256", webhookSecret).update(req.body).digest("hex").toLowerCase();

  if (!safeEqualHex(incoming, expectedSorted) && !safeEqualHex(incoming, expectedRaw)) {
    return next(new AppError("Invalid webhook signature", 401));
  }

  return next();
}

export function verifyLavaWebhookSignature(req: Request, _res: Response, next: NextFunction) {
  const webhookSecret = String(env.LAVA_WEBHOOK_SECRET || env.LAVA_ADDITIONAL_SECRET || "").trim();
  if (!webhookSecret) {
    return next(new AppError("Lava webhook secret is not configured", 500));
  }

  const headerName = String(env.LAVA_WEBHOOK_SIGNATURE_HEADER || "authorization")
    .trim()
    .toLowerCase();
  const incomingRaw = String(req.headers[headerName] || req.headers.authorization || req.headers.signature || "")
    .trim();
  const incoming = normalizeSignatureToken(incomingRaw).toLowerCase();
  if (!incoming) return next(new AppError("Invalid webhook signature", 401));

  if (!Buffer.isBuffer(req.body)) {
    return next(new AppError("Invalid webhook body", 400));
  }

  const bodyUtf8 = req.body.toString("utf8");
  let bodyObject: unknown;
  try {
    bodyObject = JSON.parse(bodyUtf8);
  } catch {
    return next(new AppError("Invalid webhook body", 400));
  }

  const sortedBody = stableStringifySorted(bodyObject);
  const expected = [
    crypto.createHmac("sha256", webhookSecret).update(sortedBody, "utf8").digest("hex").toLowerCase(),
    crypto.createHmac("sha256", webhookSecret).update(bodyUtf8, "utf8").digest("hex").toLowerCase(),
    crypto.createHash("sha256").update(sortedBody + webhookSecret, "utf8").digest("hex").toLowerCase(),
    crypto.createHash("sha256").update(bodyUtf8 + webhookSecret, "utf8").digest("hex").toLowerCase(),
  ];

  if (!expected.some((candidate) => safeEqualHex(incoming, candidate))) {
    return next(new AppError("Invalid webhook signature", 401));
  }

  return next();
}

function normalizeSignatureToken(rawValue: string) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const bearerMatch = value.match(/^bearer\s+(.+)$/i);
  return String(bearerMatch ? bearerMatch[1] : value).trim();
}

function safeEqualHex(aHex: string, bHex: string) {
  const a = Buffer.from(aHex, "utf8");
  const b = Buffer.from(bHex, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function stableStringifySorted(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringifySorted).join(", ")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}: ${stableStringifySorted(obj[key])}`).join(", ")}}`;
}
