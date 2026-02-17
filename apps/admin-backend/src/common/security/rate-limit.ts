import rateLimit from "express-rate-limit";
import { env } from "../../config/env";

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  // Admin auth has its own dedicated limits; do not let global traffic block login/refresh.
  skip: (req) => String(req.path || "").startsWith("/api/admin/auth/"),
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLoginRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  // Count only failed attempts so normal work in admin UI does not block login.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authSessionRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(env.AUTH_RATE_LIMIT_MAX * 6, 60),
  standardHeaders: true,
  legacyHeaders: false,
});

export const checkoutCreateRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export const promoValidateRateLimit = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

export const activationRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Activation page polls status frequently (every ~2s), so reads must be lenient.
export const activationReadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

// Writes (start/restart) should remain strict to prevent abuse.
export const activationWriteRateLimit = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
});
