import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/app-error";
import { ordersRepository } from "./orders.repository";
import { writeAuditLog } from "../audit/audit.service";
import { sendOrderPaidEmail, sendTelegramNotification } from "../notifications/notifications.service";
import { paymentsService } from "../payments/payments.service";
import { env } from "../../config/env";
import { paymentWebhookService } from "../payments/payment-webhook.service";
import { activationStore } from "./activation.store";
import { deliverProduct } from "./delivery.service";

const MAX_CLIENT_TOKEN_LENGTH = 500_000;

export const ordersService = {
  async list(params: any) {
    const result = await ordersRepository.list(params);
    const activationByOrder = new Map(
      activationStore
        .list()
        .map((item) => [String(item.orderId || ""), item] as const)
    );
    const items = result.items.map((order: any) => {
      const activation = activationByOrder.get(String(order.id || ""));
      return {
        ...order,
        activation: activation
          ? {
              status: activation.status,
              verificationState: activation.verificationState || "unknown",
              taskId: activation.taskId || null,
              lastProviderMessage: activation.lastProviderMessage || null,
              lastProviderCheckedAt: activation.lastProviderCheckedAt || null,
            }
          : null,
      };
    });
    return { ...result, items };
  },

  async getById(id: string) {
    const order = await ordersRepository.findById(id);
    if (!order) throw new AppError("Order not found", 404);
    return order;
  },

  async getPublicStatus(id: string) {
    assertOrderId(id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true },
          take: 1,
          orderBy: { id: "asc" },
        },
      },
    });
    if (!order) throw new AppError("Order not found", 404);

    const firstItem = order.items[0];
    const planId = firstItem?.product?.id || firstItem?.productId || null;

    return {
      status: order.status,
      planId,
      emailMasked: maskEmail(order.email),
      finalAmount: Number(order.totalAmount),
      currency: order.currency,
    };
  },

  async reconcilePublicStatus(id: string) {
    assertOrderId(id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!order) throw new AppError("Order not found", 404);

    if (order.status === OrderStatus.PAID || order.status === OrderStatus.FAILED || order.status === OrderStatus.REFUNDED) {
      return this.getPublicStatus(id);
    }

    const payment = order.payments[0];
    if (!payment?.providerRef) {
      return this.getPublicStatus(id);
    }

    const apiKey = env.ENOT_API_KEY || env.PAYMENT_SECRET;
    const shopId = env.ENOT_SHOP_ID || env.PAYMENT_SHOP_ID;
    if (!apiKey || !shopId) {
      return this.getPublicStatus(id);
    }

    try {
      const invoiceInfoUrl = new URL("/invoice/info", env.PAYMENT_API_BASE_URL);
      invoiceInfoUrl.searchParams.set("shop_id", String(shopId));
      invoiceInfoUrl.searchParams.set("invoice_id", String(payment.providerRef));

      const response = await fetch(invoiceInfoUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
      });
      if (!response.ok) {
        return this.getPublicStatus(id);
      }

      const payload = (await response.json()) as {
        status_check?: boolean;
        data?: {
          invoice_id?: string;
          order_id?: string;
          shop_id?: string;
          status?: string;
          currency?: string;
          invoice_amount?: number | string;
          amount?: number | string;
        };
      };

      const info = payload?.data;
      if (!payload?.status_check || !info) {
        return this.getPublicStatus(id);
      }
      if (String(info.shop_id || "") !== String(shopId)) {
        return this.getPublicStatus(id);
      }
      if (String(info.order_id || "") !== String(order.id)) {
        return this.getPublicStatus(id);
      }

      await paymentWebhookService.handle({
        invoice_id: String(info.invoice_id || payment.providerRef),
        order_id: String(order.id),
        status: String(info.status || "").toLowerCase(),
        amount: info.invoice_amount ?? info.amount ?? undefined,
        currency: info.currency || undefined,
      });
    } catch {
      // Keep current order status if provider API is temporarily unavailable.
    }

    return this.getPublicStatus(id);
  },

  async getActivation(orderId: string) {
    assertOrderId(orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError("Order not found", 404);
    if (order.status !== OrderStatus.PAID) throw new AppError("Order is not paid yet", 409);

    const activation = activationStore.findByOrderId(orderId);
    if (!activation) {
      await this.reconcilePublicStatus(orderId);
    }

    let current = activationStore.findByOrderId(orderId);
    if (!current) {
      // Fallback for orders paid before keys were uploaded/imported.
      await deliverProduct(order);
      current = activationStore.findByOrderId(orderId);
    }
    if (!current) {
      throw new AppError("Activation key is not issued yet", 409);
    }

    return {
      orderId: current.orderId,
      product: current.productKey,
      status: current.status,
      taskId: current.taskId || null,
      verificationState: current.verificationState || "unknown",
      lastProviderMessage: current.lastProviderMessage || null,
      lastProviderCheckedAt: current.lastProviderCheckedAt || null,
    };
  },

  async startActivation(orderId: string, token: string) {
    await this.getActivation(orderId);
    const stored = activationStore.findByOrderId(orderId);
    if (!stored?.cdk) {
      throw new AppError("Activation key is not issued yet", 409);
    }
    const safeToken = normalizeClientTokenInput(token);
    if (!safeToken) throw new AppError("Token is required", 400);
    if (safeToken.length > MAX_CLIENT_TOKEN_LENGTH) throw new AppError("Token is too long", 400);

    const createResponse = await fetch("https://receipt-api.nitro.xin/stocks/public/outstock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": "web",
      },
      body: JSON.stringify({
        cdk: stored.cdk,
        user: safeToken,
      }),
    });

    if (!createResponse.ok) {
      const details = await createResponse.text().catch(() => "");
      throw new AppError("Activation start failed", 502, details || null);
    }

    const taskId = String((await createResponse.text()).trim() || "");
    if (!taskId) throw new AppError("Activation task id is empty", 502);

    if (stored) {
      activationStore.upsert({
        ...stored,
        status: "processing",
        taskId,
        attempts: Math.max(0, Number(stored.attempts || 0)) + 1,
        verificationState: "pending",
        lastProviderMessage: "Activation request sent",
        lastProviderCheckedAt: new Date().toISOString(),
        lastProviderPayload: null,
        updatedAt: new Date().toISOString(),
      });
    }

    return { taskId };
  },

  async restartActivationWithNewKey(orderId: string, token: string) {
    assertOrderId(orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError("Order not found", 404);
    if (order.status !== OrderStatus.PAID) throw new AppError("Order is not paid yet", 409);

    await this.getActivation(orderId);
    const current = activationStore.findByOrderId(orderId);
    if (current?.status === "success") {
      throw new AppError("Activation is already completed", 409);
    }
    if (current?.status === "processing") {
      throw new AppError("Activation is still processing", 409);
    }
    if (current?.status === "issued") {
      throw new AppError("Try current key first before requesting a new one", 409);
    }

    const safeToken = normalizeClientTokenInput(token);
    if (!safeToken) throw new AppError("Token is required", 400);
    if (safeToken.length > MAX_CLIENT_TOKEN_LENGTH) throw new AppError("Token is too long", 400);

    const now = Date.now();
    const lastUpdated = current?.updatedAt ? Date.parse(current.updatedAt) : 0;
    if (lastUpdated && Number.isFinite(lastUpdated) && now - lastUpdated < 20_000) {
      throw new AppError("Retry is allowed no more than once every 20 seconds", 429);
    }
    const productKey = String(current?.productKey || "chatgpt");

    const nextCdk = await activationStore.reserveCdkForOrder({
      productKey,
      orderId: order.id,
      email: order.email,
    });
    if (!nextCdk) {
      throw new AppError("No unused CDK key available", 409);
    }

    const nowIso = new Date().toISOString();
    activationStore.upsert({
      orderId: order.id,
      email: order.email,
      productKey,
      cdk: nextCdk,
      status: "issued",
      taskId: null,
      attempts: Math.max(0, Number(current?.attempts || 0)),
      verificationState: "unknown",
      lastProviderMessage: "New key issued. Waiting for activation start",
      lastProviderCheckedAt: nowIso,
      lastProviderPayload: null,
      issuedAt: nowIso,
      updatedAt: nowIso,
    });

    return this.startActivation(orderId, safeToken);
  },

  async getActivationTask(orderId: string, taskId: string) {
    assertOrderId(orderId);
    await this.getActivation(orderId);
    const payload = await fetchActivationTaskPayload(taskId);
    updateActivationFromProviderPayload(orderId, taskId, payload);
    return {
      pending: Boolean(payload.pending),
      success: Boolean(payload.success),
      message: payload.message || "",
      task_id: String(payload.task_id || taskId),
    };
  },

  async getActivationProof(id: string, options?: { forceCheck?: boolean }) {
    assertOrderId(id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true },
          take: 1,
          orderBy: { id: "asc" },
        },
      },
    });
    if (!order) throw new AppError("Order not found", 404);

    let activation = activationStore.findByOrderId(id);
    if (!activation && order.status === OrderStatus.PAID) {
      await deliverProduct(order);
      activation = activationStore.findByOrderId(id);
    }

    if (activation?.taskId && options?.forceCheck) {
      const payload = await fetchActivationTaskPayload(activation.taskId);
      updateActivationFromProviderPayload(id, activation.taskId, payload);
      activation = activationStore.findByOrderId(id) || activation;
    }

    const product = order.items[0]?.product;
    const certainty = deriveActivationCertainty(order.status, activation?.status, activation?.verificationState);

    return {
      orderId: order.id,
      orderStatus: order.status,
      emailMasked: maskEmail(order.email),
      product: product
        ? {
            id: product.id,
            slug: product.slug,
            title: product.title,
          }
        : null,
      activation: activation
        ? {
            status: activation.status,
            verificationState: activation.verificationState || "unknown",
            taskId: activation.taskId || null,
            attempts: Number(activation.attempts || 0),
            lastProviderMessage: activation.lastProviderMessage || null,
            lastProviderCheckedAt: activation.lastProviderCheckedAt || null,
            updatedAt: activation.updatedAt,
          }
        : null,
      certainty,
      isActivatedConfirmed: certainty.code === "ACTIVATED_CONFIRMED_PROVIDER",
    };
  },

  async create(
    input: { email: string; productId: string; quantity: number; paymentMethod?: string; country?: string; promoCode?: string },
    meta?: { ip?: string }
  ) {
    const ip = String(meta?.ip || "").replace("::ffff:", "").trim();
    const localIpSet = new Set(["127.0.0.1", "::1", "localhost"]);
    const isLocalIp = localIpSet.has(ip);

    if (!isLocalIp || env.NODE_ENV === "production") {
      const antiFraudWindow = new Date(Date.now() - 15 * 60 * 1000);
      const suspiciousCount = await prisma.order.count({
        where: {
          ip: meta?.ip,
          createdAt: { gte: antiFraudWindow },
        },
      });

      if (meta?.ip && suspiciousCount >= 7) {
        throw new AppError("Anti-fraud check failed for this IP", 429);
      }
    }

    return paymentsService.createOrderWithPayment({
      email: input.email,
      productId: input.productId,
      quantity: input.quantity,
      paymentMethod: input.paymentMethod,
      country: input.country,
      promoCode: input.promoCode,
      ip: meta?.ip,
    });
  },

  async updateStatus(id: string, status: OrderStatus, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const order = await this.getById(id);
    const updated = await prisma.order.update({ where: { id }, data: { status } });

    if (status === OrderStatus.PAID) {
      await sendOrderPaidEmail(order.email, {
        orderId: order.id,
        amount: Number(order.totalAmount),
        currency: order.currency,
      });
      await sendTelegramNotification(`Order paid: ${order.id}, ${order.email}, ${order.totalAmount} ${order.currency}`);
    }

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "order",
      entityId: id,
      action: "status_update",
      before: { status: order.status },
      after: { status },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return updated;
  },

  async manualConfirm(id: string, input: { paymentId: string; paymentMethod: string }, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const order = await this.getById(id);

    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data: {
          status: OrderStatus.PAID,
          paymentId: input.paymentId,
          paymentMethod: input.paymentMethod,
        },
      }),
      prisma.payment.create({
        data: {
          orderId: id,
          provider: input.paymentMethod,
          providerRef: input.paymentId,
          status: PaymentStatus.SUCCESS,
          amount: order.totalAmount,
          currency: order.currency,
          processedAt: new Date(),
        },
      }),
    ]);

    await sendOrderPaidEmail(order.email, {
      orderId: order.id,
      amount: Number(order.totalAmount),
      currency: order.currency,
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "order",
      entityId: id,
      action: "manual_confirm",
      before: { status: order.status, paymentId: order.paymentId },
      after: { status: OrderStatus.PAID, paymentId: input.paymentId },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return this.getById(id);
  },

  async refund(id: string, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    return paymentsService.refund(id, actor);
  },
};

async function fetchActivationTaskPayload(taskId: string) {
  const response = await fetch(`https://receipt-api.nitro.xin/stocks/public/outstock/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new AppError("Activation status request failed", 502, details || null);
  }

  return (await response.json()) as {
    pending?: boolean;
    success?: boolean;
    message?: string;
    task_id?: string;
    cdk?: string;
  };
}

function normalizeClientTokenInput(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("{")) return raw;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sessionToken = typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : "";
    if (sessionToken) return sessionToken;

    const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken.trim() : "";
    if (accessToken) return accessToken;

    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    if (token) return token;
  } catch {
    // Keep original input if it's not valid JSON.
  }

  return raw;
}

function updateActivationFromProviderPayload(orderId: string, taskId: string, payload: {
  pending?: boolean;
  success?: boolean;
  message?: string;
  task_id?: string;
  cdk?: string;
}) {
  const stored = activationStore.findByOrderId(orderId);
  if (!stored) return;
  const nowIso = new Date().toISOString();
  const nextStatus = payload.pending ? "processing" : payload.success ? "success" : "failed";
  const verificationState = payload.pending ? "pending" : payload.success ? "success" : "failed";
  activationStore.upsert({
    ...stored,
    status: nextStatus,
    verificationState,
    taskId: String(payload.task_id || taskId),
    lastProviderMessage: String(payload.message || ""),
    lastProviderCheckedAt: nowIso,
    lastProviderPayload: {
      pending: Boolean(payload.pending),
      success: Boolean(payload.success),
      message: String(payload.message || ""),
      task_id: String(payload.task_id || taskId),
    },
    updatedAt: nowIso,
  });
}

function deriveActivationCertainty(
  orderStatus: OrderStatus,
  activationStatus?: "issued" | "processing" | "success" | "failed",
  verificationState?: "unknown" | "pending" | "success" | "failed"
) {
  if (orderStatus !== OrderStatus.PAID) {
    return {
      code: "ORDER_NOT_PAID",
      label: "Заказ не оплачен",
    };
  }
  if (!activationStatus) {
    return {
      code: "KEY_NOT_ISSUED",
      label: "CDK еще не выдан",
    };
  }
  if (activationStatus === "success" && verificationState === "success") {
    return {
      code: "ACTIVATED_CONFIRMED_PROVIDER",
      label: "Подтверждено провайдером активации",
    };
  }
  if (activationStatus === "failed" || verificationState === "failed") {
    return {
      code: "ACTIVATION_FAILED",
      label: "Активация завершилась ошибкой",
    };
  }
  if (activationStatus === "processing" || verificationState === "pending") {
    return {
      code: "ACTIVATION_IN_PROGRESS",
      label: "Активация в обработке",
    };
  }
  return {
    code: "ACTIVATION_UNCONFIRMED",
    label: "Нет подтверждения активации",
  };
}

function assertOrderId(orderId: string) {
  const value = String(orderId || "").trim();
  if (!/^[a-z0-9]{10,64}$/i.test(value)) {
    throw new AppError("Invalid order id", 400);
  }
}

function maskEmail(email: string) {
  const value = String(email || "").trim();
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at);
  if (local.length <= 2) return `${local[0] || "*"}***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}
