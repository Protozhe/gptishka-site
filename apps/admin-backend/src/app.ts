import express from "express";
import path from "path";
import { env } from "./config/env";
import { applySecurity } from "./common/security/apply-security";
import { globalRateLimit } from "./common/security/rate-limit";
import { attachRequestMeta } from "./common/middleware/request-meta";
import { authRouter } from "./modules/auth/auth.routes";
import { productsRouter } from "./modules/products/products.routes";
import { publicProductsRouter } from "./modules/products/public-products.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { analyticsRouter } from "./modules/analytics/analytics.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { usersRouter } from "./modules/users/users.routes";
import { promoCodesRouter } from "./modules/promocodes/promocodes.routes";
import { errorHandler, notFoundHandler } from "./common/errors/error-handler";
import { publicOrdersRouter } from "./modules/orders/public-orders.routes";
import { allowWebhookIp, verifyWebhookSignature } from "./common/security/webhook-security";
import { handlePaymentWebhook } from "./modules/payments/payment-webhook.controller";
import { publicPromoCodesRouter } from "./modules/promocodes/public-promocodes.routes";
import { partnerEarningsRouter, partnersRouter } from "./modules/partners/partners.routes";
import { publicEnotRouter } from "./modules/payments/public-enot.routes";
import { cdkKeysRouter } from "./modules/cdks/cdks.routes";
import { verifyAdminOrigin } from "./common/security/csrf-origin";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  applySecurity(app);
  app.use(globalRateLimit);
  const webhookStack = [allowWebhookIp, express.raw({ type: "application/json" }), verifyWebhookSignature, handlePaymentWebhook] as const;
  app.post("/api/public/webhook/payment", ...webhookStack);
  app.post("/api/webhooks/payment", ...webhookStack);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(attachRequestMeta);
  app.use(verifyAdminOrigin);

  const uploadsPath = path.join(process.cwd(), "apps", "admin-backend", "uploads");
  app.use("/uploads", express.static(uploadsPath));

  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "admin-backend", health: "/api/admin/health" });
  });

  app.get("/api/admin/health", (_req, res) => {
    res.json({ ok: true, service: "admin-backend", env: env.NODE_ENV });
  });

  app.use("/api/admin/auth", authRouter);
  app.use("/api/admin/products", productsRouter);
  app.use("/api/public", publicProductsRouter);
  app.use("/api/public", publicOrdersRouter);
  app.use("/api/payments/enot", publicEnotRouter);
  app.use("/api", publicOrdersRouter);
  app.use("/api", publicPromoCodesRouter);
  app.use("/api/admin/orders", ordersRouter);
  app.use("/api/admin/analytics", analyticsRouter);
  app.use("/api/admin/audit", auditRouter);
  app.use("/api/admin/users", usersRouter);
  app.use("/api/admin/promocodes", promoCodesRouter);
  app.use("/api/admin/partners", partnersRouter);
  app.use("/api/admin/partner-earnings", partnerEarningsRouter);
  app.use("/api/admin/cdks", cdkKeysRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
