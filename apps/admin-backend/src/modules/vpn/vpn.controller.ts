import crypto from "crypto";
import { OrderStatus } from "@prisma/client";
import { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import { asyncHandler } from "../../common/http/async-handler";
import { prisma } from "../../config/prisma";
import { deliverProduct } from "../orders/delivery.service";
import { resolveVpnProvisionPayload, toVpnMePayload, vpnService } from "../../services/vpn.service";

function assertOrderId(orderId: string) {
  const value = String(orderId || "").trim();
  if (!/^[a-z0-9]{10,64}$/i.test(value)) {
    throw new AppError("Invalid order id", 400);
  }
}

async function resolveVpnAccessByOrder(orderId: string, orderToken?: string) {
  assertOrderId(orderId);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { product: true },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  });
  if (!order) throw new AppError("Order not found", 404);

  const expectedTokenHash = String(order.redeemTokenHash || "").trim();
  if (expectedTokenHash) {
    const provided = String(orderToken || "").trim();
    if (!provided) throw new AppError("Activation link token is required", 401);
    const providedHash = crypto.createHash("sha256").update(provided).digest("hex");
    if (providedHash !== expectedTokenHash) throw new AppError("Invalid activation link token", 403);
  }

  if (order.status !== OrderStatus.PAID) {
    throw new AppError("Order is not paid yet", 409);
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

export const exportVpnCsv = asyncHandler(async (_req: Request, res: Response) => {
  const users = await vpnService.listVpnUsers();
  const header = ["telegramId", "uuid", "expiresAt", "serverId", "plan", "isActive"];
  const rows = users.map((row) => {
    const isActiveNow = Boolean(row.isActive) && row.expiresAt.getTime() > Date.now();
    return [
      row.telegramId || "",
      row.uuid,
      row.expiresAt.toISOString(),
      row.serverId,
      row.plan,
      isActiveNow ? "true" : "false",
    ]
      .map(toCsvCell)
      .join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=vpn-export.csv");
  res.send(csv);
});
