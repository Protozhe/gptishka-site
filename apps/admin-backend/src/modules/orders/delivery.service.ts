import { Order } from "@prisma/client";
import { resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { canonicalProductKey } from "../../common/utils/product-key";
import { prisma } from "../../config/prisma";
import { resolveVpnProvisionPayload, vpnService } from "../../services/vpn.service";
import { manualCredentialsStore } from "../products/manual-credentials.store";
import { activationStore } from "./activation.store";

export async function deliverProduct(order: Order) {
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
  const product = firstItem?.product || null;
  const deliveryType = resolveProductDeliveryType(product?.tags || []);
  const vpnProvision = resolveVpnProvisionPayload(product);

  async function ensureBundleVpnAccess() {
    if (!vpnProvision || vpnProvision.source !== "bundle") return;
    const access = await vpnService.createVpnUser({
      orderId: order.id,
      email: order.email,
      plan: vpnProvision.plan,
      durationDays: vpnProvision.durationDays,
      source: "bundle",
    });
    console.info(
      `[delivery] bundle vpn access ready for order=${order.id} uuid=${access.uuid} plan=${access.plan} source=${access.source}`
    );
  }

  if (deliveryType === "credentials") {
    const productId = String(product?.id || firstItem?.productId || "").trim();
    if (!productId) {
      console.warn(`[delivery] credentials product id not resolved for order=${order.id}`);
      return;
    }

    const existing = manualCredentialsStore.findByOrderId(order.id);
    if (existing && existing.productId === productId) {
      console.info(`[delivery] credentials already assigned order=${order.id} credential=${existing.id}`);
      await ensureBundleVpnAccess();
      return;
    }

    const assigned = manualCredentialsStore.assignNextAvailable({
      productId,
      orderId: order.id,
      email: order.email,
    });

    if (!assigned) {
      console.warn(`[delivery] no credentials available for product=${productId} order=${order.id}`);
      return;
    }

    console.info(`[delivery] assigned credentials for order=${order.id} product=${productId}`);
    await ensureBundleVpnAccess();
    return;
  }

  if (deliveryType === "vpn") {
    if (!vpnProvision) {
      console.warn(`[delivery] vpn product config not resolved for order=${order.id}`);
      return;
    }

    const access = await vpnService.createVpnUser({
      orderId: order.id,
      email: order.email,
      plan: vpnProvision.plan,
      durationDays: vpnProvision.durationDays,
      source: vpnProvision.source,
    });

    console.info(
      `[delivery] vpn access ready for order=${order.id} uuid=${access.uuid} plan=${access.plan} source=${access.source}`
    );
    return;
  }

  activationStore.ensure();

  const existing = activationStore.findByOrderId(order.id);
  if (existing) {
    console.info(`[delivery] activation already exists order=${order.id} cdk=${existing.cdk}`);
    await ensureBundleVpnAccess();
    return;
  }

  const productSlug = String(product?.slug || "")
    .trim()
    .toLowerCase();
  const productId = String(product?.id || "").trim().toLowerCase();
  const productKey = canonicalProductKey(productSlug || productId);

  if (!productKey) {
    console.warn(`[delivery] product key not resolved for order=${order.id}`);
    return;
  }

  const cdk = await activationStore.reserveCdkForOrder({
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
  await ensureBundleVpnAccess();
}
