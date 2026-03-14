import { Router } from "express";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import {
  exportOrdersCsv,
  getStorefrontTickerSettings,
  getOrderActivationProof,
  getOrderActivationToken,
  getOrder,
  listOrders,
  manualConfirmOrder,
  refundOrder,
  updateStorefrontTickerSettings,
  updateOrderStatus,
} from "./orders.controller";
import {
  manualConfirmSchema,
  ordersQuerySchema,
  storefrontTickerSettingsSchema,
  updateOrderStatusSchema,
} from "./orders.schemas";

export const ordersRouter = Router();

ordersRouter.use(requireAuth);
ordersRouter.get("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateQuery(ordersQuerySchema), listOrders);
ordersRouter.get("/export/csv", allowRoles(["OWNER", "ADMIN"]), validateQuery(ordersQuerySchema), exportOrdersCsv);
ordersRouter.get("/storefront/ticker-settings", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getStorefrontTickerSettings);
ordersRouter.patch(
  "/storefront/ticker-settings",
  allowRoles(["OWNER", "ADMIN"]),
  validateBody(storefrontTickerSettingsSchema),
  updateStorefrontTickerSettings
);
ordersRouter.get("/:id/activation-proof", allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]), getOrderActivationProof);
ordersRouter.get("/:id/activation-token", allowRoles(["OWNER", "ADMIN", "SUPPORT"]), getOrderActivationToken);
ordersRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getOrder);
ordersRouter.patch("/:id/status", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(updateOrderStatusSchema), updateOrderStatus);
ordersRouter.post("/:id/manual-confirm", allowRoles(["OWNER", "ADMIN"]), validateBody(manualConfirmSchema), manualConfirmOrder);
ordersRouter.post("/:id/refund", allowRoles(["OWNER", "ADMIN"]), refundOrder);
