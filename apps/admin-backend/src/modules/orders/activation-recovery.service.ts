import { OrderStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import { createActivationRecoveryToken } from "../../common/security/activation-recovery-token";
import { resolveOrderDeliveryType } from "../../common/utils/product-delivery";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { writeAuditLog } from "../audit/audit.service";

type RecoveryLinkActor = {
  userId?: string;
  ip?: string;
  userAgent?: string;
};

function resolveSiteOrigin() {
  for (const candidate of [env.PAYMENT_SUCCESS_URL, env.APP_BASE_URL]) {
    try {
      return new URL(candidate).origin;
    } catch {
      // Try the next configured public URL.
    }
  }
  return "https://gptishka.shop";
}

export async function buildOrderActivationRecoveryLink(
  orderId: string,
  options?: { actor?: RecoveryLinkActor; audit?: boolean }
) {
  const id = String(orderId || "").trim();
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: true },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  });

  if (!order) throw new AppError("Order not found", 404);
  if (order.status !== OrderStatus.PAID) {
    throw new AppError("Activation link is available only for paid orders", 409);
  }

  const redeemTokenHash = String(order.redeemTokenHash || "").trim();
  const recoveryToken = redeemTokenHash
    ? createActivationRecoveryToken(order.id, redeemTokenHash)
    : "";
  const firstItem = order.items[0];
  const deliveryType = resolveOrderDeliveryType(order.orderDetails, firstItem?.product?.tags || []);
  const path = deliveryType === "vpn" ? "/store/vpn/activate" : "/redeem-start.html";
  const url = new URL(path, resolveSiteOrigin());
  url.searchParams.set("order_id", order.id);
  if (recoveryToken) url.searchParams.set("t", recoveryToken);

  if (options?.audit) {
    await writeAuditLog({
      userId: options.actor?.userId,
      entityType: "order",
      entityId: order.id,
      action: "activation_recovery_link_view",
      after: { deliveryType, revealed: true },
      ip: options.actor?.ip,
      userAgent: options.actor?.userAgent,
    });
  }

  return {
    orderId: order.id,
    activationUrl: url.toString(),
    deliveryType,
  };
}
