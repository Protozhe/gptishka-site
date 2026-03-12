import crypto from "crypto";
import { OrderStatus } from "@prisma/client";
import { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import { asyncHandler } from "../../common/http/async-handler";
import { prisma } from "../../config/prisma";
import { deliverProduct } from "../orders/delivery.service";
import { ordersService } from "../orders/orders.service";
import { resolveVpnProvisionPayload, toVpnMePayload, vpnService } from "../../services/vpn.service";

function assertOrderId(orderId: string) {
  const value = String(orderId || "").trim();
  if (!/^[a-z0-9]{10,64}$/i.test(value)) {
    throw new AppError("Invalid order id", 400);
  }
}

async function resolveVpnAccessByOrder(orderId: string, orderToken?: string) {
  assertOrderId(orderId);
  const loadOrder = () =>
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true },
          orderBy: { id: "asc" },
          take: 1,
        },
      },
    });

  let order = await loadOrder();
  if (!order) throw new AppError("Order not found", 404);

  const expectedTokenHash = String(order.redeemTokenHash || "").trim();
  if (expectedTokenHash) {
    const provided = String(orderToken || "").trim();
    if (!provided) throw new AppError("Activation link token is required", 401);
    const providedHash = crypto.createHash("sha256").update(provided).digest("hex");
    if (providedHash !== expectedTokenHash) throw new AppError("Invalid activation link token", 403);
  }

  if (order.status !== OrderStatus.PAID) {
    if (order.status === OrderStatus.PENDING) {
      await ordersService.reconcilePublicStatus(order.id);
      order = await loadOrder();
    }
    if (!order || order.status !== OrderStatus.PAID) {
      throw new AppError("Order is not paid yet", 409);
    }
  }

  const firstItem = order.items[0];
  const vpnProvision = resolveVpnProvisionPayload(firstItem?.product || null);
  if (!vpnProvision) {
    throw new AppError("This order does not contain VPN delivery", 409);
  }

  let access = await vpnService.getLatestByOrderOrIdentity({
    orderId: order.id,
    email: order.email,
  });
  if (!access) {
    await deliverProduct(order);
    access = await vpnService.getLatestByOrderOrIdentity({
      orderId: order.id,
      email: order.email,
    });
  }

  if (!access) {
    access = await vpnService.createVpnUser({
      orderId: order.id,
      email: order.email,
      plan: vpnProvision.plan,
      durationDays: vpnProvision.durationDays,
      source: vpnProvision.source,
    });
  }

  return access;
}

function toCsvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toIsoOrEmpty(value: Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function toBoolQuery(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toPositiveLimit(value: unknown, fallback = 200, max = 5000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

async function loadVpnAccessAuditRows(limit = 200) {
  return prisma.vpnAccess.findMany({
    take: limit,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      order: {
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          items: {
            take: 1,
            orderBy: { id: "asc" },
            select: {
              productRaw: true,
              quantity: true,
              product: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                },
              },
            },
          },
          payments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              provider: true,
              providerRef: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
}

function mapAuditRow(row: Awaited<ReturnType<typeof loadVpnAccessAuditRows>>[number]) {
  const isActiveNow = Boolean(row.isActive) && row.expiresAt.getTime() > Date.now();
  const firstItem = row.order?.items?.[0];
  const lastPayment = row.order?.payments?.[0];
  const orderAmount = row.order?.totalAmount != null ? String(row.order.totalAmount) : "";

  return {
    telegramId: row.telegramId || "",
    email: row.email || "",
    orderId: row.orderId || "",
    orderStatus: row.order?.status || "",
    orderCreatedAt: toIsoOrEmpty(row.order?.createdAt),
    orderAmount,
    orderCurrency: row.order?.currency || "",
    paymentMethod: row.order?.paymentMethod || "",
    paymentProvider: lastPayment?.provider || "",
    paymentRef: lastPayment?.providerRef || "",
    paymentStatus: lastPayment?.status || "",
    paymentCreatedAt: toIsoOrEmpty(lastPayment?.createdAt),
    productSlug: firstItem?.product?.slug || "",
    productTitle: firstItem?.product?.title || "",
    productRaw: firstItem?.productRaw || "",
    quantity: firstItem?.quantity ?? "",
    uuid: row.uuid,
    accessLink: row.accessLink,
    plan: row.plan,
    source: row.source,
    serverId: row.serverId,
    expiresAt: row.expiresAt.toISOString(),
    isActive: isActiveNow ? "true" : "false",
    trafficUsedBytes: String(row.trafficUsedBytes ?? 0n),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const getVpnMe = asyncHandler(async (req: Request, res: Response) => {
  const orderId = String(req.query.order_id || req.query.orderId || "").trim();
  const orderToken = String(req.query.t || req.query.orderToken || "").trim();
  const telegramId = String(req.query.telegramId || req.query.telegram_id || "").trim();

  if (orderId) {
    const access = await resolveVpnAccessByOrder(orderId, orderToken);
    return res.json(toVpnMePayload(access));
  }

  if (telegramId) {
    const access = await vpnService.getByTelegramId(telegramId);
    return res.json(toVpnMePayload(access));
  }

  throw new AppError("Either order_id (with token) or telegramId is required", 400);
});

export const listVpnAccessAudit = asyncHandler(async (req: Request, res: Response) => {
  const limit = toPositiveLimit(req.query.limit, 200, 5000);
  const rows = await loadVpnAccessAuditRows(limit);
  const items = rows.map(mapAuditRow);
  return res.json({
    items,
    count: items.length,
    limit,
  });
});

export const exportVpnCsv = asyncHandler(async (req: Request, res: Response) => {
  const limit = toPositiveLimit(req.query.limit, 5000, 20000);
  const includeAccessLink = toBoolQuery(req.query.includeAccessLink ?? "1");

  const rows = (await loadVpnAccessAuditRows(limit)).map(mapAuditRow);
  const header = [
    // Backward-compatible leading columns:
    "telegramId",
    "uuid",
    "expiresAt",
    "serverId",
    "plan",
    "isActive",

    // Extended audit columns:
    "email",
    "orderId",
    "source",
    "trafficUsedBytes",
    "orderStatus",
    "orderCreatedAt",
    "orderAmount",
    "orderCurrency",
    "paymentMethod",
    "paymentProvider",
    "paymentRef",
    "paymentStatus",
    "paymentCreatedAt",
    "productSlug",
    "productTitle",
    "productRaw",
    "quantity",
    "createdAt",
    "updatedAt",
    ...(includeAccessLink ? ["accessLink"] : []),
  ];

  const csvRows = rows.map((row) => {
    const line = [
      row.telegramId,
      row.uuid,
      row.expiresAt,
      row.serverId,
      row.plan,
      row.isActive,

      row.email,
      row.orderId,
      row.source,
      row.trafficUsedBytes,
      row.orderStatus,
      row.orderCreatedAt,
      row.orderAmount,
      row.orderCurrency,
      row.paymentMethod,
      row.paymentProvider,
      row.paymentRef,
      row.paymentStatus,
      row.paymentCreatedAt,
      row.productSlug,
      row.productTitle,
      row.productRaw,
      row.quantity,
      row.createdAt,
      row.updatedAt,
      ...(includeAccessLink ? [row.accessLink] : []),
    ];
    return line.map(toCsvCell).join(",");
  });

  const csv = [header.join(","), ...csvRows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=vpn-export.csv");
  res.send(csv);
});
