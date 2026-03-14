import crypto from "crypto";
import { OrderStatus, Prisma } from "@prisma/client";
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

  let access = await vpnService.getLatestByOrder({
    orderId: order.id,
  });
  if (!access) {
    await deliverProduct(order);
    access = await vpnService.getLatestByOrder({
      orderId: order.id,
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

function toQueryString(value: unknown) {
  return String(value ?? "").trim();
}

function toActiveFilter(value: unknown): boolean | null {
  const normalized = toQueryString(value).toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "active"].includes(normalized)) return true;
  if (["0", "false", "no", "inactive", "disabled"].includes(normalized)) return false;
  return null;
}

function buildVpnAccessWhere(q: unknown, active: unknown, serverId: unknown): Prisma.VpnAccessWhereInput {
  const where: Prisma.VpnAccessWhereInput = {};
  const search = toQueryString(q);
  const activeFilter = toActiveFilter(active);
  const normalizedServerId = toQueryString(serverId);

  if (activeFilter !== null) {
    if (activeFilter) {
      where.isActive = true;
      where.expiresAt = { gt: new Date() };
    } else {
      where.OR = [{ isActive: false }, { expiresAt: { lte: new Date() } }];
    }
  }

  if (normalizedServerId) {
    where.serverId = normalizedServerId;
  }

  if (search) {
    const searchOr: Prisma.VpnAccessWhereInput[] = [
      { uuid: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { telegramId: { contains: search, mode: "insensitive" } },
      { orderId: { contains: search, mode: "insensitive" } },
      { plan: { contains: search, mode: "insensitive" } },
      { source: { contains: search, mode: "insensitive" } },
    ];

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  return where;
}

async function loadVpnAccessAuditRows(input?: {
  limit?: number;
  offset?: number;
  where?: Prisma.VpnAccessWhereInput;
}) {
  const limit = toPositiveLimit(input?.limit, 200, 5000);
  const offset = Math.max(0, Math.floor(Number(input?.offset) || 0));

  return prisma.vpnAccess.findMany({
    where: input?.where,
    take: limit,
    skip: offset,
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
    id: row.id,
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
  const page = toPositiveLimit(req.query.page, 1, 100_000);
  const limit = toPositiveLimit(req.query.limit, 50, 500);
  const offset = (page - 1) * limit;
  const where = buildVpnAccessWhere(req.query.q, req.query.active, req.query.serverId);

  const total = await prisma.vpnAccess.count({ where });
  const rows = await loadVpnAccessAuditRows({ limit, offset, where });

  const items = rows.map(mapAuditRow);
  return res.json({
    items,
    count: items.length,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const exportVpnCsv = asyncHandler(async (req: Request, res: Response) => {
  const limit = toPositiveLimit(req.query.limit, 5000, 20000);
  const includeAccessLink = toBoolQuery(req.query.includeAccessLink ?? "1");
  const where = buildVpnAccessWhere(req.query.q, req.query.active, req.query.serverId);
  const rows = (await loadVpnAccessAuditRows({ limit, where })).map(mapAuditRow);
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

export const getVpnAccessById = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  if (!id) throw new AppError("VPN access id is required", 422);
  const rows = await loadVpnAccessAuditRows({ limit: 1, where: { id } });
  if (!rows.length) throw new AppError("VPN access not found", 404);
  const mapped = mapAuditRow(rows[0]);
  res.json({
    item: mapped,
  });
});

export const revokeVpnAccess = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  if (!id) throw new AppError("VPN access id is required", 422);
  const reason = String((req.body as any)?.reason || "").trim() || "revoked_by_admin";
  const updated = await vpnService.revokeById(id, reason);
  res.json({
    item: toVpnMePayload(updated),
  });
});

export const regenerateVpnAccess = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  if (!id) throw new AppError("VPN access id is required", 422);
  const reason = String((req.body as any)?.reason || "").trim() || "regenerated_by_admin";
  const updated = await vpnService.regenerateKeyById(id, reason);
  res.json({
    item: toVpnMePayload(updated),
  });
});

export const setVpnAccessExpiry = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  if (!id) throw new AppError("VPN access id is required", 422);
  const expiresAtRaw = String((req.body as any)?.expiresAt || "").trim();
  if (!expiresAtRaw) throw new AppError("expiresAt is required", 422);
  const reason = String((req.body as any)?.reason || "").trim() || "expiry_updated_by_admin";
  const updated = await vpnService.setExpiryById(id, expiresAtRaw, reason);
  res.json({
    item: toVpnMePayload(updated),
  });
});

export const syncVpnAccessTraffic = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || "").trim();
  if (!id) throw new AppError("VPN access id is required", 422);
  const updated = await vpnService.syncTrafficById(id);
  res.json({
    item: toVpnMePayload(updated),
  });
});

export const syncExpiredVpnAccesses = asyncHandler(async (req: Request, res: Response) => {
  const limit = toPositiveLimit((req.body as any)?.limit, 200, 1000);
  const result = await vpnService.disableExpiredAccesses(limit);
  res.json(result);
});
