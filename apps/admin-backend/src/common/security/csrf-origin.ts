import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { AppError } from "../errors/app-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function verifyAdminOrigin(req: Request, _res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/admin/")) return next();
  if (SAFE_METHODS.has(String(req.method || "").toUpperCase())) return next();

  const allowedOrigins = getAllowedOrigins();
  const origin = normalizeOrigin(String(req.headers.origin || ""));
  const refererOrigin = getRefererOrigin(String(req.headers.referer || ""));
  const requestOrigin = getRequestOrigin(req);

  if (origin && allowedOrigins.has(origin)) return next();
  if (refererOrigin && allowedOrigins.has(refererOrigin)) return next();
  if (!origin && !refererOrigin && requestOrigin && allowedOrigins.has(requestOrigin)) return next();

  return next(new AppError("CSRF origin check failed", 403));
}

function getAllowedOrigins() {
  const origins = new Set<string>();
  const primary = normalizeOrigin(env.ADMIN_UI_URL);
  const app = normalizeOrigin(env.APP_URL);
  if (primary) origins.add(primary);
  if (app) origins.add(app);

  // Local development often serves admin via Vite (:5173) or storefront proxy (:3000).
  if (env.NODE_ENV !== "production") {
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]
      .map(normalizeOrigin)
      .filter(Boolean)
      .forEach((item) => origins.add(item));
  }

  return origins;
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

function getRefererOrigin(referer: string) {
  if (!referer) return "";
  try {
    return new URL(referer).origin.toLowerCase();
  } catch {
    return "";
  }
}

function getRequestOrigin(req: Request) {
  const forwardedProtoRaw = String(req.headers["x-forwarded-proto"] || "").trim();
  const forwardedProto = forwardedProtoRaw.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  if (!host) return "";
  return normalizeOrigin(`${protocol}://${host}`);
}
