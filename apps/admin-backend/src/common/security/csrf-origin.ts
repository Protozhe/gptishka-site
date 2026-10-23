import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
import { getAllowedOrigins as getConfiguredAllowedOrigins } from "./origins";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ADMIN_CSRF_EXEMPT_PATHS = new Set(["/api/admin/auth/login"]);

export function verifyAdminOrigin(req: Request, _res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/admin/")) return next();
  if (ADMIN_CSRF_EXEMPT_PATHS.has(req.path)) return next();
  if (SAFE_METHODS.has(String(req.method || "").toUpperCase())) return next();

  const allowedOrigins = getConfiguredAllowedOrigins();
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const origin = normalizeOrigin(String(originHeader || ""));
  const refererOrigin = getRefererOrigin(String(refererHeader || ""));
  const requestOrigin = getRequestOrigin(req);

  // A present but rejected Origin must not fall back to Referer or Host.
  if (originHeader !== undefined) {
    return origin && allowedOrigins.has(origin) ? next() : next(new AppError("CSRF origin check failed", 403));
  }
  if (refererHeader !== undefined) {
    return refererOrigin && allowedOrigins.has(refererOrigin) ? next() : next(new AppError("CSRF origin check failed", 403));
  }
  if (requestOrigin && allowedOrigins.has(requestOrigin)) return next();

  return next(new AppError("CSRF origin check failed", 403));
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

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}
