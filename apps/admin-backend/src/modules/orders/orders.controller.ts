import { Request, Response } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { ordersService } from "./orders.service";

function actor(req: Request) {
  return {
    userId: req.auth?.userId,
    ip: req.requestMeta?.ip,
    userAgent: req.requestMeta?.userAgent,
  };
}

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, ...filters } = req.query as any;
  const result = await ordersService.list({ page, limit, ...filters });
  res.json({
    items: result.items,
    total: result.total,
    page,
    limit,
    totalPages: Math.ceil(result.total / limit),
  });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.getById(String(req.params.id));
  res.json(data);
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.create(req.body, { ip: req.requestMeta?.ip });
  res.status(201).json(data);
});

export const getPublicOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.getPublicStatus(String(req.params.orderId || ""));
  res.json(data);
});

export const reconcilePublicOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.reconcilePublicStatus(String(req.params.orderId || ""));
  res.json(data);
});

export const getOrderActivation = asyncHandler(async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId || "");
  const orderToken = String((req.query as any)?.t || "");
  const data = await ordersService.getActivation(orderId, orderToken);
  res.json(data);
});

export const startOrderActivation = asyncHandler(async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId || "");
  const token = String((req.body as any)?.token || "");
  const orderToken = String((req.body as any)?.orderToken || (req.body as any)?.t || (req.query as any)?.t || "");
  const data = await ordersService.startActivation(orderId, token, orderToken);
  res.json(data);
});

export const validateOrderActivationToken = asyncHandler(async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId || "");
  const token = String((req.body as any)?.token || "");
  const orderToken = String((req.body as any)?.orderToken || (req.body as any)?.t || (req.query as any)?.t || "");
  const data = await ordersService.validateActivationToken(orderId, token, orderToken);
  res.json(data);
});

export const restartOrderActivationWithNewKey = asyncHandler(async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId || "");
  const token = String((req.body as any)?.token || "");
  const orderToken = String((req.body as any)?.orderToken || (req.body as any)?.t || (req.query as any)?.t || "");
  const data = await ordersService.restartActivationWithNewKey(orderId, token, orderToken);
  res.json(data);
});

export const getOrderActivationTask = asyncHandler(async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId || "");
  const taskId = String(req.params.taskId || "");
  const orderToken = String((req.query as any)?.t || "");
  const data = await ordersService.getActivationTask(orderId, taskId, orderToken);
  res.json(data);
});

export const getOrderActivationProof = asyncHandler(async (req: Request, res: Response) => {
  const orderId = String(req.params.id || "");
  const forceCheck = String(req.query.forceCheck || req.query.force || "") === "1";
  const data = await ordersService.getActivationProof(orderId, { forceCheck });
  res.json(data);
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.updateStatus(String(req.params.id), req.body.status, actor(req));
  res.json(data);
});

export const manualConfirmOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.manualConfirm(String(req.params.id), req.body, actor(req));
  res.json(data);
});

export const refundOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await ordersService.refund(String(req.params.id), actor(req));
  res.json(data);
});

export const exportOrdersCsv = asyncHandler(async (req: Request, res: Response) => {
  const result = await ordersService.list({
    page: 1,
    limit: 10000,
    ...req.query,
  });

  const header = [
    "id",
    "email",
    "status",
    "payment_method",
    "payment_id",
    "country",
    "ip",
    "total_amount",
    "currency",
    "created_at",
  ];

  const rows = result.items.map((o) =>
    [
      o.id,
      o.email,
      o.status,
      o.paymentMethod || "",
      o.paymentId || "",
      o.country || "",
      o.ip || "",
      o.totalAmount,
      o.currency,
      o.createdAt.toISOString(),
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=orders.csv");
  res.send(csv);
});
