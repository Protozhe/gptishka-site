import { Router } from "express";
import { prisma } from "../../config/prisma";
import { asyncHandler } from "../../common/http/async-handler";
import { validateBody } from "../../common/middleware/validation";
import {
  createOrder,
  getOrderActivation,
  getOrderActivationTask,
  getPublicOrderStatus,
  reconcilePublicOrderStatus,
  restartOrderActivationWithNewKey,
  startOrderActivation,
  validateOrderActivationToken,
} from "./orders.controller";
import { createOrderSchema } from "./orders.schemas";
import { activationReadRateLimit, activationValidateRateLimit, activationWriteRateLimit, checkoutCreateRateLimit } from "../../common/security/rate-limit";

export const publicOrdersRouter = Router();

function maskEmail(email: string) {
  const safe = String(email || "").trim().toLowerCase();
  const atIndex = safe.indexOf("@");
  if (atIndex < 1) return "***@*****";

  const localRaw = safe.slice(0, atIndex).replace(/[^a-z0-9._+-]/gi, "");
  const local = localRaw || "user";
  const domainRaw = safe.slice(atIndex + 1);
  const domainParts = domainRaw.split(".").filter(Boolean);
  const topLevel = domainParts.length > 1 ? domainParts[domainParts.length - 1] : "";

  const visiblePrefix = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  const tailChar = local.slice(-1);
  const localMask = `${visiblePrefix}${"*".repeat(local.length > 5 ? 3 : 2)}${tailChar}`;
  const providerMaskLength = Math.max(5, Math.min(10, (domainParts[0] || "").length || 5));
  const providerMask = "*".repeat(providerMaskLength);

  return topLevel ? `${localMask}@${providerMask}.${topLevel}` : `${localMask}@${providerMask}`;
}

publicOrdersRouter.get(
  "/storefront-stats",
  asyncHandler(async (_req, res) => {
    const [sales, recentOrders] = await prisma.$transaction([
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.order.findMany({
        where: { status: "PAID" },
        select: { email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);

    const tickerEntries = recentOrders.map((order) => ({
      email: maskEmail(order.email),
      source: "real" as const,
    }));

    res.json({
      sales,
      tickerEntries,
      lastBuyers: tickerEntries.map((entry) => entry.email),
    });
  })
);

publicOrdersRouter.post("/create-order", checkoutCreateRateLimit, validateBody(createOrderSchema), createOrder);
publicOrdersRouter.post("/orders/create", checkoutCreateRateLimit, validateBody(createOrderSchema), createOrder);
publicOrdersRouter.post("/checkout", checkoutCreateRateLimit, validateBody(createOrderSchema), createOrder);
publicOrdersRouter.get("/orders/:orderId", getPublicOrderStatus);
publicOrdersRouter.get("/orders/:orderId/reconcile", reconcilePublicOrderStatus);
publicOrdersRouter.get("/orders/:orderId/activation", activationReadRateLimit, getOrderActivation);
publicOrdersRouter.post("/orders/:orderId/activation/validate-token", activationValidateRateLimit, validateOrderActivationToken);
publicOrdersRouter.post("/orders/:orderId/activation/start", activationWriteRateLimit, startOrderActivation);
publicOrdersRouter.post("/orders/:orderId/activation/restart-with-new-key", activationWriteRateLimit, restartOrderActivationWithNewKey);
publicOrdersRouter.get("/orders/:orderId/activation/task/:taskId", activationReadRateLimit, getOrderActivationTask);
