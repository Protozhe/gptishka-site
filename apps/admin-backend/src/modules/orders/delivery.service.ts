import { Order } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { activationStore } from "./activation.store";

export async function deliverProduct(order: Order) {
  activationStore.ensure();

  const existing = activationStore.findByOrderId(order.id);
  if (existing) {
    console.info(`[delivery] activation already exists order=${order.id} cdk=${existing.cdk}`);
    return;
  }

  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      items: {
        include: { product: true },
        take: 1,
      },
    },
  });
  if (!fullOrder) return;

  const firstItem = fullOrder.items[0];
  const productSlug = String(firstItem?.product?.slug || "")
    .trim()
    .toLowerCase();
  const productId = String(firstItem?.product?.id || "").trim().toLowerCase();
  const productKey = productSlug || productId;

  if (!productKey) {
    console.warn(`[delivery] product key not resolved for order=${order.id}`);
    return;
  }

  const cdk = activationStore.reserveCdkForOrder({
    productKey,
    orderId: order.id,
    email: order.email,
  });

  if (!cdk) {
    console.warn(`[delivery] no CDK available for product=${productKey} order=${order.id}`);
    return;
  }

  const nowIso = new Date().toISOString();
  activationStore.upsert({
    orderId: order.id,
    email: order.email,
    productKey,
    cdk,
    status: "issued",
    taskId: null,
    attempts: 0,
    verificationState: "unknown",
    lastProviderMessage: null,
    lastProviderCheckedAt: null,
    lastProviderPayload: null,
    issuedAt: nowIso,
    updatedAt: nowIso,
  });

  console.info(`[delivery] issued CDK for order ${order.id} (${order.email}) product=${productKey}`);
}
