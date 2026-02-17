import { Router } from "express";
import { allowRoles, requireAuth } from "../auth/auth.middleware";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import {
  createOrder,
  exportOrdersCsv,
  getOrderActivationProof,
  getOrder,
  listOrders,
  manualConfirmOrder,
  refundOrder,
  updateOrderStatus,
} from "./orders.controller";
import {
  createOrderSchema,
  manualConfirmSchema,
  ordersQuerySchema,
  updateOrderStatusSchema,
} from "./orders.schemas";

export const ordersRouter = Router();

ordersRouter.post("/checkout", validateBody(createOrderSchema), createOrder);

ordersRouter.use(requireAuth);
ordersRouter.get("/", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateQuery(ordersQuerySchema), listOrders);
ordersRouter.get("/export/csv", allowRoles(["OWNER", "ADMIN"]), validateQuery(ordersQuerySchema), exportOrdersCsv);
ordersRouter.get("/:id/activation-proof", allowRoles(["OWNER", "ADMIN", "MANAGER", "SUPPORT"]), getOrderActivationProof);
ordersRouter.get("/:id", allowRoles(["OWNER", "ADMIN", "MANAGER"]), getOrder);
ordersRouter.patch("/:id/status", allowRoles(["OWNER", "ADMIN", "MANAGER"]), validateBody(updateOrderStatusSchema), updateOrderStatus);
ordersRouter.post("/:id/manual-confirm", allowRoles(["OWNER", "ADMIN"]), validateBody(manualConfirmSchema), manualConfirmOrder);
ordersRouter.post("/:id/refund", allowRoles(["OWNER", "ADMIN"]), refundOrder);
