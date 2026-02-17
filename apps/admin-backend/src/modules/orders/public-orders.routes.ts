import { Router } from "express";
import { validateBody } from "../../common/middleware/validation";
import {
  createOrder,
  getOrderActivation,
  getOrderActivationTask,
  getPublicOrderStatus,
  reconcilePublicOrderStatus,
  restartOrderActivationWithNewKey,
  startOrderActivation,
} from "./orders.controller";
import { createOrderSchema } from "./orders.schemas";
import { activationRateLimit, checkoutCreateRateLimit } from "../../common/security/rate-limit";

export const publicOrdersRouter = Router();

publicOrdersRouter.post("/create-order", checkoutCreateRateLimit, validateBody(createOrderSchema), createOrder);
publicOrdersRouter.post("/orders/create", checkoutCreateRateLimit, validateBody(createOrderSchema), createOrder);
publicOrdersRouter.post("/checkout", checkoutCreateRateLimit, validateBody(createOrderSchema), createOrder);
publicOrdersRouter.get("/orders/:orderId", getPublicOrderStatus);
publicOrdersRouter.get("/orders/:orderId/reconcile", reconcilePublicOrderStatus);
publicOrdersRouter.get("/orders/:orderId/activation", activationRateLimit, getOrderActivation);
publicOrdersRouter.post("/orders/:orderId/activation/start", activationRateLimit, startOrderActivation);
publicOrdersRouter.post("/orders/:orderId/activation/restart-with-new-key", activationRateLimit, restartOrderActivationWithNewKey);
publicOrdersRouter.get("/orders/:orderId/activation/task/:taskId", activationRateLimit, getOrderActivationTask);
