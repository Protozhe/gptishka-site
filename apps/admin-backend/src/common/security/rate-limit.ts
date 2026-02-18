import rateLimit from "express-rate-limit";
import { env } from "../../config/env";

function withScope(scope: string) {
  // Keep the default express-rate-limit message/body for compatibility,
  // but add a header so we can quickly identify which limiter is firing in prod.
  return (_req: any, res: any, _next: any, options: any) => {
    try {
      res.setHeader("X-RateLimit-Scope", scope);
    } catch {
      // ignore
    }
    res.status(options.statusCode).send(options.message);
  };
}

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  // Admin auth has its own dedicated limits; do not let global traffic block login/refresh.
  // Use originalUrl, because req.path can differ depending on express' routing/baseUrl.
  skip: (req) => String(req.originalUrl || req.url || "").startsWith("/api/admin/auth/"),
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("global"),
});

export const authRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("auth"),
});

export const authLoginRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  // Count only failed attempts so normal work in admin UI does not block login.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("auth-login"),
});

export const authSessionRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(env.AUTH_RATE_LIMIT_MAX * 6, 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("auth-session"),
});

export const checkoutCreateRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("checkout-create"),
});

export const promoValidateRateLimit = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("promo-validate"),
});

export const activationRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("activation"),
});

// Activation page polls status frequently (every ~2s), so reads must be lenient.
export const activationReadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("activation-read"),
});

// Token validation happens on input changes; keep it reasonably high but separate from polling reads.
export const activationValidateRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("activation-validate"),
});

// Writes (start/restart) should remain strict to prevent abuse.
export const activationWriteRateLimit = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: withScope("activation-write"),
});
