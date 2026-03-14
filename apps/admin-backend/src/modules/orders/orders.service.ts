import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/app-error";
import { ordersRepository } from "./orders.repository";
import { writeAuditLog } from "../audit/audit.service";
import { sendOrderPaidEmail, sendTelegramNotification } from "../notifications/notifications.service";
import { paymentsService } from "../payments/payments.service";
import { env } from "../../config/env";
import { paymentWebhookService } from "../payments/payment-webhook.service";
import { activationStore, type ActivationRecord } from "./activation.store";
import { deliverProduct } from "./delivery.service";
import { resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { manualCredentialsStore } from "../products/manual-credentials.store";
import { toVpnMePayload, vpnService } from "../../services/vpn.service";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const MAX_CLIENT_TOKEN_LENGTH = 500_000;
const MAX_ACTIVATION_START_ATTEMPTS = 3;
const MIN_STORED_CLIENT_TOKEN_TTL_HOURS = 24 * 7;
const STORED_CLIENT_TOKEN_TTL_HOURS = Math.max(
  MIN_STORED_CLIENT_TOKEN_TTL_HOURS,
  Number(env.ACTIVATION_STORED_TOKEN_TTL_HOURS || MIN_STORED_CLIENT_TOKEN_TTL_HOURS)
);
const STORED_CLIENT_TOKEN_TTL_MS = STORED_CLIENT_TOKEN_TTL_HOURS * 60 * 60 * 1000;
const activationOrderLocks = new Map<string, Promise<void>>();
const ORDER_FILE_LOCK_TIMEOUT_MS = 45_000;
const ORDER_FILE_LOCK_STALE_MS = 2 * 60 * 1000;
const ORDER_FILE_LOCK_POLL_MS = 120;
const activationLockDir = path.join(resolveRuntimeDir(), "order-locks");
const DEFAULT_SUPPORT_URL = "https://t.me/gptishkasupp";
const DEFAULT_SUPPORT_EMAIL = "support@gptishka.shop";

function resolveSupportEmail() {
  const raw = String(env.SMTP_FROM || "").trim();
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return String(emailMatch?.[0] || DEFAULT_SUPPORT_EMAIL).toLowerCase();
}

function assertTokenActivationDeliveryMode(activationInfo: any) {
  const deliveryMode = String(activationInfo?.deliveryMode || "activation").trim().toLowerCase();
  if (deliveryMode === "activation") return;
  if (deliveryMode === "vpn") {
    throw new AppError("This product is delivered as VPN access. Token activation is not required.", 409);
  }
  throw new AppError("This product is delivered via login/password. Token activation is not required.", 409);
}

async function withActivationOrderLock<T>(orderId: string, job: () => Promise<T>) {
  const key = String(orderId || "").trim() || "__empty_order__";
  const previous = activationOrderLocks.get(key) || Promise.resolve();

  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });

  const slot = previous.then(() => wait);
  activationOrderLocks.set(key, slot);
  await previous;
  let releaseFileLock: () => void = () => {};

  try {
    releaseFileLock = await acquireActivationOrderFileLock(key);
    return await job();
  } finally {
    try {
      releaseFileLock();
      release();
    } finally {
      if (activationOrderLocks.get(key) === slot) {
        activationOrderLocks.delete(key);
      }
    }
  }
}

function normalizeActivationRecordForRead(record: ActivationRecord | null | undefined) {
  if (!record) return null;
  const cleaned = cleanupExpiredStoredClientToken(record);
  if (cleaned.changed) {
    activationStore.upsert(cleaned.record);
    return cleaned.record;
  }
  return record;
}

async function acquireActivationOrderFileLock(orderId: string) {
  fs.mkdirSync(activationLockDir, { recursive: true });
  const lockPath = path.join(activationLockDir, `${orderLockFileKey(orderId)}.lock`);
  const startedAt = Date.now();

  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), orderId });
      try {
        fs.writeFileSync(fd, payload, "utf8");
      } finally {
        fs.closeSync(fd);
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          fs.unlinkSync(lockPath);
        } catch (error: any) {
          if (String(error?.code || "") !== "ENOENT") {
            // Ignore best-effort lock cleanup errors.
          }
        }
      };
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code !== "EEXIST") throw error;

      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - Number(stat.mtimeMs || 0) > ORDER_FILE_LOCK_STALE_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        // Lock file disappeared between checks; retry immediately.
      }

      if (Date.now() - startedAt > ORDER_FILE_LOCK_TIMEOUT_MS) {
        throw new AppError("Activation is busy. Please retry in a few seconds.", 429);
      }

      await sleep(ORDER_FILE_LOCK_POLL_MS + Math.floor(Math.random() * 60));
    }
  }
}

function orderLockFileKey(orderId: string) {
  return crypto.createHash("sha1").update(String(orderId || "").trim()).digest("hex");
}

function resolveRuntimeDir() {
  const fromEnv = String(process.env.GPTISHKA_RUNTIME_DIR || process.env.RUNTIME_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  const linuxDefault = "/var/lib/gptishka-runtime";
  if (process.platform === "linux" && fs.existsSync(linuxDefault)) return linuxDefault;
  return path.resolve(process.cwd(), "data");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export const ordersService = {
  async list(params: any) {
    const result = await ordersRepository.list(params);
    const activationByOrder = new Map(
      activationStore
        .list()
        .map((item) => normalizeActivationRecordForRead(item))
        .filter((item): item is ActivationRecord => Boolean(item))
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
              attempts: Number(activation.attempts || 0),
              tokenSeen: Boolean(String(activation.lastTokenValidatedAt || "").trim()),
              tokenValidationAttempts: Number(activation.tokenValidationAttempts || 0),
              lastTokenValidatedAt: activation.lastTokenValidatedAt || null,
              tokenStored: hasStoredClientToken(activation),
              tokenStoredAt: activation.clientTokenStoredAt || null,
              tokenExpiresAt: activation.clientTokenExpiresAt || null,
              tokenBound: Boolean(String(activation.tokenMeta?.fingerprint || "").trim()),
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
    const deliveryMode = resolveProductDeliveryType(firstItem?.product?.tags || []);
    return {
      status: order.status,
      planId,
      deliveryMode,
      emailMasked: maskEmail(order.email),
      finalAmount: Number(order.totalAmount),
      currency: order.currency,
    };
  },

  async reconcilePublicStatus(id: string) {
    assertOrderId(id);
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { providerRef: true, provider: true },
        },
      },
    });
    if (!order) throw new AppError("Order not found", 404);
    await tryReconcilePendingOrderPayment(id, order);

    return this.getPublicStatus(id);
  },

  async getActivation(orderId: string, orderToken?: string) {
    const order = await assertPaidOrderAccess(orderId, orderToken);
    const fullOrder = await getOrderWithFirstItem(order.id);
    const firstItem = fullOrder?.items?.[0];
    const deliveryType = resolveProductDeliveryType(firstItem?.product?.tags || []);
    if (deliveryType === "credentials") {
      await deliverProduct(order);
      const assigned = manualCredentialsStore.findByOrderId(order.id);
      const supportEmail = resolveSupportEmail();
      if (assigned && String(assigned.productId || "").trim() === String(firstItem?.productId || "").trim()) {
      return {
        orderId: order.id,
        deliveryMode: "credentials",
        status: "credentials_ready",
        credentials: {
          login: assigned.login,
          password: assigned.password,
        },
          supportUrl: DEFAULT_SUPPORT_URL,
          supportEmail,
          message: "Данные для входа доступны ниже.",
        };
      }

      return {
        orderId: order.id,
        deliveryMode: "credentials",
        status: "pending_manual",
        supportUrl: DEFAULT_SUPPORT_URL,
        supportEmail,
        message:
          "Свободные данные для входа сейчас отсутствуют. Напишите в поддержку или ожидайте письмо с данными на email.",
      };
    }

    if (deliveryType === "vpn") {
      await deliverProduct(order);
      const access = await vpnService.getLatestByOrder({
        orderId: order.id,
      });
      if (!access) {
        throw new AppError("VPN access is not issued yet", 409);
      }
      return {
        orderId: order.id,
        deliveryMode: "vpn",
        status: "vpn_ready",
        ...toVpnMePayload(access),
      };
    }

    const activation = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
    if (!activation) {
      await this.reconcilePublicStatus(orderId);
    }

    let current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
    if (!current) {
      // Fallback for orders paid before keys were uploaded/imported.
      await deliverProduct(order);
      current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
    }
    if (!current) {
      throw new AppError("Activation key is not issued yet", 409);
    }

    return {
      orderId: current.orderId,
      deliveryMode: "activation",
      product: current.productKey,
      status: current.status,
      taskId: current.taskId || null,
      verificationState: current.verificationState || "unknown",
      lastProviderMessage: current.lastProviderMessage || null,
      lastProviderCheckedAt: current.lastProviderCheckedAt || null,
    };
  },

  async startActivation(orderId: string, token: string, orderToken?: string) {
    const activationInfo = (await this.getActivation(orderId, orderToken)) as any;
    assertTokenActivationDeliveryMode(activationInfo);
    return withActivationOrderLock(orderId, async () => startActivationUnsafe(orderId, token, orderToken));
  },

  async validateActivationToken(orderId: string, token: string, orderToken?: string) {
    const activationInfo = (await this.getActivation(orderId, orderToken)) as any;
    assertTokenActivationDeliveryMode(activationInfo);

    const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
    if (!stored?.cdk) {
      throw new AppError("Activation key is not issued yet", 409);
    }

    const tokenInfo = parseClientTokenInput(token);
    const tokenMeta = buildTokenMeta(tokenInfo);
    const reasons: string[] = [];
    const nowIso = new Date().toISOString();

    if (!tokenInfo.raw) reasons.push("Token is required");
    if (tokenInfo.raw && tokenInfo.raw.length > MAX_CLIENT_TOKEN_LENGTH) reasons.push("Token is too long");
    if (isTokenBoundToAnotherFingerprint(stored.tokenMeta, tokenMeta)) reasons.push("Order is already bound to another token");

    if (tokenInfo.raw.startsWith("{")) {
      if (!tokenInfo.json) {
        reasons.push("Token JSON is invalid");
      } else if (tokenInfo.extracted === tokenInfo.raw) {
        reasons.push("Token JSON does not include accessToken/sessionToken/token");
      }
    }

    const jwt = tryDecodeJwtPayload(tokenInfo.extracted || "");
    if (jwt?.exp) {
      const expMs = Number(jwt.exp) * 1000;
      if (Number.isFinite(expMs) && expMs < Date.now() + 30_000) {
        reasons.push("Token is expired");
      }
    }

    // Sanity: ensure we actually have a DB-issued CDK for this order/product.
    const issued = await prisma.licenseKey.findFirst({
      where: { orderId, productKey: stored.productKey, status: "used" },
      select: { id: true },
    });
    if (!issued) {
      reasons.push("Activation key is not issued yet");
    }

    if (tokenInfo.raw) {
      const latest = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || stored;
      const storagePatch = buildStoredClientTokenPatch(tokenInfo.raw);
      activationStore.upsert({
        ...latest,
        ...storagePatch,
        lastTokenValidatedAt: nowIso,
        tokenValidationAttempts: Math.max(0, Number(latest.tokenValidationAttempts || 0)) + 1,
        updatedAt: nowIso,
      });
    }

    return {
      ok: reasons.length === 0,
      reasons,
      token: {
        kind: tokenMeta.kind,
        length: tokenMeta.length,
        jwt: jwt?.exp || jwt?.iat ? { exp: jwt.exp || null, iat: jwt.iat || null } : null,
      },
    };
  },

  async restartActivationWithNewKey(orderId: string, token: string, orderToken?: string) {
    return withActivationOrderLock(orderId, async () => {
      const order = await assertPaidOrderAccess(orderId, orderToken);

      const activationInfo = (await this.getActivation(orderId, orderToken)) as any;
      assertTokenActivationDeliveryMode(activationInfo);
      const current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
      if (current?.status === "success") {
        throw new AppError("Activation is already completed", 409);
      }
      if (current?.status === "processing") {
        throw new AppError("Activation is still processing", 409);
      }
      if (current?.status === "issued") {
        throw new AppError("Try current key first before requesting a new key", 409);
      }

      const tokenInfo = parseClientTokenInput(token);
      const safeToken = tokenInfo.extracted || tokenInfo.raw;
      if (!safeToken) throw new AppError("Token is required", 400);
      if (tokenInfo.raw.length > MAX_CLIENT_TOKEN_LENGTH) throw new AppError("Token is too long", 400);
      const nextTokenMeta = buildTokenMeta(tokenInfo);
      if (isTokenBoundToAnotherFingerprint(current?.tokenMeta, nextTokenMeta)) {
        throw new AppError("Order is already bound to another token", 409);
      }
      if (Math.max(0, Number(current?.attempts || 0)) >= MAX_ACTIVATION_START_ATTEMPTS) {
        throw new AppError("Activation attempts limit reached. Contact support.", 429);
      }

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
        excludeCdk: current?.cdk || undefined,
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
        tokenMeta: current?.tokenMeta || nextTokenMeta,
        status: "issued",
        taskId: null,
        attempts: Math.max(0, Number(current?.attempts || 0)),
        tokenValidationAttempts: Math.max(0, Number(current?.tokenValidationAttempts || 0)),
        lastTokenValidatedAt: current?.lastTokenValidatedAt || null,
        clientTokenCiphertext: current?.clientTokenCiphertext || null,
        clientTokenIv: current?.clientTokenIv || null,
        clientTokenAuthTag: current?.clientTokenAuthTag || null,
        clientTokenStoredAt: current?.clientTokenStoredAt || null,
        clientTokenExpiresAt: current?.clientTokenExpiresAt || null,
        verificationState: "unknown",
        lastProviderMessage: "New key issued. Waiting for activation start",
        lastProviderCheckedAt: nowIso,
        lastProviderPayload: null,
        issuedAt: nowIso,
        updatedAt: nowIso,
      });

      return startActivationUnsafe(orderId, safeToken, orderToken);
    });
  },

  async getActivationTask(orderId: string, taskId: string, orderToken?: string) {
    assertOrderId(orderId);
    const activationInfo = (await this.getActivation(orderId, orderToken)) as any;
    assertTokenActivationDeliveryMode(activationInfo);
    const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
    const payload = await fetchActivationTaskPayload(taskId, stored?.deviceId || null);
    updateActivationFromProviderPayload(orderId, taskId, payload);
    return {
      pending: Boolean(payload.pending),
      success: Boolean(payload.success),
      message: payload.message || "",
      task_id: String(payload.task_id || taskId),
    };
  },

  async getActivationClientToken(
    orderId: string,
    actor?: { userId?: string; ip?: string; userAgent?: string }
  ) {
    assertOrderId(orderId);
    const current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
    if (!current) throw new AppError("Activation data is not found for this order", 404);

    const cleaned = cleanupExpiredStoredClientToken(current);
    if (cleaned.changed) {
      activationStore.upsert(cleaned.record);
    }

    const token = decryptStoredClientToken(cleaned.record);
    if (!token) throw new AppError("Client token is not stored or expired", 404);

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "order",
      entityId: orderId,
      action: "activation_token_view",
      before: {
        tokenStoredAt: cleaned.record.clientTokenStoredAt || null,
        tokenExpiresAt: cleaned.record.clientTokenExpiresAt || null,
      },
      after: { revealed: true },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return {
      orderId,
      token,
      storedAt: cleaned.record.clientTokenStoredAt || null,
      expiresAt: cleaned.record.clientTokenExpiresAt || null,
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
    const product = order.items[0]?.product;
    const deliveryType = resolveProductDeliveryType(product?.tags || []);

    if (deliveryType === "credentials") {
      if (order.status === OrderStatus.PAID) {
        await deliverProduct(order);
      }
      const assigned = manualCredentialsStore.findByOrderId(id);
      const hasCredentials = Boolean(
        assigned &&
          String(assigned.productId || "").trim() === String(order.items[0]?.productId || "").trim()
      );
      const certainty =
        order.status !== OrderStatus.PAID
          ? {
              code: "ORDER_NOT_PAID",
              label: "Заказ не оплачен",
            }
          : hasCredentials
          ? {
              code: "CREDENTIALS_READY",
              label: "Логин и пароль выданы",
            }
          : {
              code: "CREDENTIALS_PENDING",
              label: "Ожидает ручной выдачи",
            };

      return {
        orderId: order.id,
        orderStatus: order.status,
        emailMasked: maskEmail(order.email),
        deliveryMode: "credentials",
        product: product
          ? {
              id: product.id,
              slug: product.slug,
              title: product.title,
            }
          : null,
        activation: null,
        credentials: hasCredentials
          ? {
              login: assigned!.login,
              password: assigned!.password,
              assignedAt: assigned!.assignedAt,
            }
          : null,
        certainty,
        isActivatedConfirmed: hasCredentials,
      };
    }

    if (deliveryType === "vpn") {
      if (order.status === OrderStatus.PAID) {
        await deliverProduct(order);
      }

      const access = await vpnService.getLatestByOrder({
        orderId: order.id,
      });
      const vpnPayload = access ? toVpnMePayload(access) : null;
      const certainty =
        order.status !== OrderStatus.PAID
          ? {
              code: "ORDER_NOT_PAID",
              label: "Order is not paid",
            }
          : vpnPayload
          ? {
              code: "VPN_READY",
              label: "VPN access is issued",
            }
          : {
              code: "VPN_PENDING",
              label: "VPN access is not issued yet",
            };

      return {
        orderId: order.id,
        orderStatus: order.status,
        emailMasked: maskEmail(order.email),
        deliveryMode: "vpn",
        product: product
          ? {
              id: product.id,
              slug: product.slug,
              title: product.title,
            }
          : null,
        activation: null,
        vpn: vpnPayload,
        certainty,
        isActivatedConfirmed: Boolean(vpnPayload?.isActive),
      };
    }

    let activation = normalizeActivationRecordForRead(activationStore.findByOrderId(id));
    if (!activation && order.status === OrderStatus.PAID) {
      await deliverProduct(order);
      activation = normalizeActivationRecordForRead(activationStore.findByOrderId(id));
    }

    if (activation && options?.forceCheck) {
      if (activation.taskId) {
        try {
          const payload = await fetchActivationTaskPayload(activation.taskId, activation.deviceId || null);
          updateActivationFromProviderPayload(id, activation.taskId, payload);
        } catch (error) {
          updateActivationProviderCheckError(id, error);
        }
      } else if (activation.cdk) {
        const productCandidates = deriveActivationProviderProductCandidates({
          productSlug: String(order.items[0]?.product?.slug || ""),
          productKey: String(activation.productKey || ""),
        });
        try {
          const checked = await fetchActivationCdkCheckPayload(activation.cdk, productCandidates);
          updateActivationFromProviderCdkPayload(id, checked.productId, checked.payload);
        } catch (error) {
          updateActivationProviderCheckError(id, error);
        }
      } else {
        updateActivationProviderCheckError(id, "Activation key is missing");
      }
      activation = normalizeActivationRecordForRead(activationStore.findByOrderId(id)) || activation;
    }

    const certainty = deriveActivationCertainty(order.status, activation?.status, activation?.verificationState);

    return {
      orderId: order.id,
      orderStatus: order.status,
      emailMasked: maskEmail(order.email),
      deliveryMode: "activation",
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
            tokenSeen: Boolean(String(activation.lastTokenValidatedAt || "").trim()),
            tokenValidationAttempts: Number(activation.tokenValidationAttempts || 0),
            lastTokenValidatedAt: activation.lastTokenValidatedAt || null,
            tokenStored: hasStoredClientToken(activation),
            tokenStoredAt: activation.clientTokenStoredAt || null,
            tokenExpiresAt: activation.clientTokenExpiresAt || null,
            lastProviderMessage: activation.lastProviderMessage || null,
            lastProviderCheckedAt: activation.lastProviderCheckedAt || null,
            tokenMeta: activation.tokenMeta
              ? {
                  kind: activation.tokenMeta.kind,
                  length: activation.tokenMeta.length,
                  fingerprint: activation.tokenMeta.fingerprint,
                }
              : null,
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
      if (order.status !== OrderStatus.PAID) {
        await deliverProduct(order as any);
      }
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
    await deliverProduct(order as any);

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

async function assertPaidOrderAccess(orderId: string, orderToken?: string) {
  assertOrderId(orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);

  const expected = String(order.redeemTokenHash || "").trim();
  if (expected) {
    const provided = String(orderToken || "").trim();
    if (!provided) throw new AppError("Activation link token is required", 401);
    const providedHash = crypto.createHash("sha256").update(provided).digest("hex");
    if (providedHash !== expected) throw new AppError("Invalid activation link token", 403);
  }

  if (order.status !== OrderStatus.PAID) {
    if (order.status === OrderStatus.PENDING) {
      await tryReconcilePendingOrderPayment(order.id);
    }

    const refreshed = await prisma.order.findUnique({ where: { id: order.id } });
    if (!refreshed) throw new AppError("Order not found", 404);
    if (refreshed.status !== OrderStatus.PAID) throw new AppError("Order is not paid yet", 409);
    return refreshed;
  }

  return order;
}

async function getOrderWithFirstItem(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { product: true },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  });
}

type PendingPaymentProbeOrder = {
  id: string;
  status: OrderStatus;
  payments: Array<{ providerRef: string | null; provider: string }>;
};

async function tryReconcilePendingOrderPayment(orderId: string, cachedOrder?: PendingPaymentProbeOrder) {
  const order =
    cachedOrder ||
    (await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { providerRef: true, provider: true },
        },
      },
    }));
  if (!order) return;
  if (order.status !== OrderStatus.PENDING) return;

  const payment = order.payments[0];
  const providerRef = String(payment?.providerRef || "").trim();
  const providerCode = String(payment?.provider || "").trim().toLowerCase();
  if (!providerRef) return;

  try {
    if (providerCode === "lava") {
      const status = await probeLavaInvoiceStatus(order.id, providerRef);
      if (!status) {
        console.warn(
          `[orders] pending payment reconcile no status confirmation order=${order.id} provider=${providerCode} ref=${providerRef}`
        );
        return;
      }
      await paymentWebhookService.handle({
        invoice_id: status.invoiceId,
        order_id: status.orderId || String(order.id),
        status: status.status,
        amount: status.amount ?? undefined,
        currency: status.currency || undefined,
      });
      return;
    }

    const status = await probeGatewayInvoiceStatus(order.id, providerRef);
    if (!status) {
      console.warn(
        `[orders] pending payment reconcile no status confirmation order=${order.id} provider=${providerCode} ref=${providerRef}`
      );
      return;
    }
    await paymentWebhookService.handle({
      invoice_id: status.invoiceId,
      order_id: status.orderId || String(order.id),
      status: status.status,
      amount: status.amount ?? undefined,
      currency: status.currency || undefined,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[orders] pending payment reconcile failed order=${order.id} provider=${providerCode}: ${reason}`);
    // Keep current order status if provider API is temporarily unavailable or verification fails.
  }
}

async function probeGatewayInvoiceStatus(orderId: string, providerRef: string) {
  const apiKey = env.ENOT_API_KEY || env.PAYMENT_SECRET;
  const shopId = env.ENOT_SHOP_ID || env.PAYMENT_SHOP_ID;
  if (!apiKey || !shopId) return null;

  const invoiceInfoUrl = new URL("/invoice/info", env.PAYMENT_API_BASE_URL);
  invoiceInfoUrl.searchParams.set("shop_id", String(shopId));
  invoiceInfoUrl.searchParams.set("invoice_id", providerRef);

  const response = await fetch(invoiceInfoUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });
  if (!response.ok) return null;

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
  if (!payload?.status_check || !info) return null;
  if (String(info.shop_id || "") !== String(shopId)) return null;
  if (String(info.order_id || "") !== String(orderId)) return null;

  return {
    invoiceId: String(info.invoice_id || providerRef),
    orderId: String(info.order_id || orderId),
    status: String(info.status || "").toLowerCase(),
    amount: info.invoice_amount ?? info.amount ?? null,
    currency: info.currency || "",
  };
}

async function probeLavaInvoiceStatus(orderId: string, providerRef: string) {
  const secretKey = String(env.LAVA_SECRET_KEY || "").trim();
  const shopId = String(env.LAVA_SHOP_ID || "").trim();
  if (!secretKey || !shopId) return null;

  const payload = {
    shopId,
    orderId: String(orderId),
    invoiceId: String(providerRef),
  };
  const signature = signLavaPayload(payload, secretKey);

  const response = await fetch(new URL(env.LAVA_STATUS_PATH, env.LAVA_API_BASE_URL).toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Signature: signature,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return null;

  const raw = (await response.json()) as {
    status_check?: boolean;
    data?: {
      id?: string | number;
      invoiceId?: string | number;
      invoice_id?: string | number;
      orderId?: string;
      order_id?: string;
      status?: string;
      amount?: number | string;
      sum?: number | string;
      currency?: string;
    };
  };
  const data = raw?.data;
  if (!raw?.status_check || !data) return null;

  const responseOrderId = String(data.orderId || data.order_id || "").trim();
  if (responseOrderId && responseOrderId !== String(orderId)) return null;

  return {
    invoiceId: String(data.invoiceId || data.invoice_id || data.id || providerRef),
    orderId: responseOrderId || String(orderId),
    status: String(data.status || "").toLowerCase(),
    amount: data.amount ?? data.sum ?? null,
    currency: String(data.currency || "").trim(),
  };
}

function signLavaPayload(payload: unknown, secret: string) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload), "utf8").digest("hex");
}

async function startActivationUnsafe(orderId: string, token: string, orderToken?: string) {
  await ordersService.getActivation(orderId, orderToken);
  const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
  if (!stored?.cdk) {
    throw new AppError("Activation key is not issued yet", 409);
  }
  const tokenInfo = parseClientTokenInput(token);
  if (!tokenInfo.raw) throw new AppError("Token is required", 400);
  if (tokenInfo.raw.length > MAX_CLIENT_TOKEN_LENGTH) throw new AppError("Token is too long", 400);
  const storagePatch = buildStoredClientTokenPatch(tokenInfo.raw);

  // Upstream provider appears to bind tasks to a device id; keep it stable.
  const deviceId = String(env.ACTIVATION_DEVICE_ID || "web").trim() || "web";

  const userCandidates = buildUpstreamUserCandidates(tokenInfo);
  const tokenMeta = buildTokenMeta(tokenInfo);
  const attempts = Math.max(0, Number(stored.attempts || 0));

  if (stored.status === "success") {
    throw new AppError("Activation is already completed", 409);
  }
  if (isTokenBoundToAnotherFingerprint(stored.tokenMeta, tokenMeta)) {
    throw new AppError("Order is already bound to another token", 409);
  }
  if (stored.status === "processing" && String(stored.taskId || "").trim()) {
    // Idempotent behavior for repeated clicks with the same token.
    return { taskId: String(stored.taskId || ""), reused: true };
  }
  if (stored.status === "failed" && attempts > 0) {
    throw new AppError("Previous activation attempt failed. Request a new key and retry.", 409);
  }
  if (attempts >= MAX_ACTIVATION_START_ATTEMPTS) {
    throw new AppError("Activation attempts limit reached. Contact support.", 429);
  }

  let createResponse: Response | null = null;
  let lastBody = "";
  for (const candidate of userCandidates) {
    createResponse = await fetch("https://receipt-api.nitro.xin/stocks/public/outstock", {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      },
      body: JSON.stringify({
        cdk: stored.cdk,
        user: candidate,
      }),
    });

    if (createResponse.ok) break;
    // Some upstream failures return empty body; keep best-effort diagnostics.
    lastBody = await createResponse.text().catch(() => "");
    // If token was JSON, try alternate shapes on 400 only.
    if (createResponse.status !== 400) break;
  }

  if (!createResponse || !createResponse.ok) {
    throw new AppError("Activation start failed", 502, {
      upstreamStatus: createResponse?.status || 0,
      upstreamBody: String(lastBody || "").slice(0, 2000),
    });
  }

  const taskId = String((await createResponse.text()).trim() || "");
  if (!taskId) throw new AppError("Activation task id is empty", 502);

  const latest = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || stored;
  activationStore.upsert({
    ...latest,
    ...storagePatch,
    deviceId,
    tokenMeta,
    status: "processing",
    taskId,
    attempts: attempts + 1,
    verificationState: "pending",
    lastProviderMessage: "Activation request sent",
    lastProviderCheckedAt: new Date().toISOString(),
    lastProviderPayload: null,
    updatedAt: new Date().toISOString(),
  });

  return { taskId };
}

function buildStoredClientTokenPatch(token: string) {
  const raw = String(token || "").trim();
  if (!raw) {
    return {
      clientTokenCiphertext: null,
      clientTokenIv: null,
      clientTokenAuthTag: null,
      clientTokenStoredAt: null,
      clientTokenExpiresAt: null,
    };
  }

  const encrypted = encryptClientToken(raw);
  const now = Date.now();
  return {
    ...encrypted,
    clientTokenStoredAt: new Date(now).toISOString(),
    clientTokenExpiresAt: new Date(now + STORED_CLIENT_TOKEN_TTL_MS).toISOString(),
  };
}

function hasStoredClientToken(record: ActivationRecord | null | undefined) {
  if (!record) return false;
  if (isStoredClientTokenExpired(record)) return false;
  return Boolean(
    String(record.clientTokenCiphertext || "").trim() &&
      String(record.clientTokenIv || "").trim() &&
      String(record.clientTokenAuthTag || "").trim()
  );
}

function cleanupExpiredStoredClientToken(record: ActivationRecord) {
  if (!isStoredClientTokenExpired(record)) {
    return { changed: false, record };
  }
  const next = {
    ...record,
    clientTokenCiphertext: null,
    clientTokenIv: null,
    clientTokenAuthTag: null,
    clientTokenStoredAt: null,
    clientTokenExpiresAt: null,
  };
  return { changed: true, record: next };
}

function isStoredClientTokenExpired(record: ActivationRecord | null | undefined) {
  const expiresAt = Date.parse(String(record?.clientTokenExpiresAt || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  return Date.now() > expiresAt;
}

function decryptStoredClientToken(record: ActivationRecord | null | undefined) {
  if (!record) return "";
  if (isStoredClientTokenExpired(record)) return "";
  const ciphertext = String(record.clientTokenCiphertext || "").trim();
  const iv = String(record.clientTokenIv || "").trim();
  const tag = String(record.clientTokenAuthTag || "").trim();
  if (!ciphertext || !iv || !tag) return "";

  try {
    const key = deriveClientTokenEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return String(plain || "").trim();
  } catch {
    return "";
  }
}

function encryptClientToken(raw: string) {
  const token = String(raw || "").trim();
  const key = deriveClientTokenEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    clientTokenCiphertext: ciphertext.toString("base64"),
    clientTokenIv: iv.toString("base64"),
    clientTokenAuthTag: tag.toString("base64"),
  };
}

function deriveClientTokenEncryptionKey() {
  const baseSecret = String(env.ACTIVATION_TOKEN_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET || "").trim();
  if (!baseSecret) throw new AppError("Activation token encryption key is not configured", 500);
  // Context-separated key derivation to avoid raw secret reuse across domains.
  return crypto.createHash("sha256").update(`gptishka:activation-token:v1:${baseSecret}`).digest();
}

async function fetchActivationTaskPayload(taskId: string, deviceId?: string | null) {
  const headers: Record<string, string> = { Accept: "application/json" };
  const did = String(deviceId || "").trim();
  if (did) headers["X-Device-Id"] = did;
  const response = await fetch(`https://receipt-api.nitro.xin/stocks/public/outstock/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers,
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

type ActivationCdkCheckPayload = {
  used?: boolean;
  app_name?: string;
  app_product_name?: string;
  [key: string]: unknown;
};

async function fetchActivationCdkCheckPayload(cdk: string, productCandidates: string[]) {
  const candidates = Array.from(new Set((productCandidates || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (candidates.length === 0) {
    throw new AppError("Activation provider product is not resolved", 502);
  }

  let lastError: unknown = null;
  for (const productId of candidates) {
    try {
      const payload = await fetchActivationCdkCheckPayloadByProduct(cdk, productId);
      return { productId, payload };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new AppError("Activation cdk check failed", 502);
}

async function fetchActivationCdkCheckPayloadByProduct(cdk: string, productId: string) {
  const response = await fetch("https://receipt-api.nitro.xin/cdks/public/check", {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "X-Product-ID": productId,
    },
    body: JSON.stringify({ code: cdk }),
  });

  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    throw new AppError("Activation cdk check request failed", 502, {
      providerStatus: response.status,
      providerBody: String(raw || "").slice(0, 2000),
      productId,
    });
  }

  if (!raw) return {} as ActivationCdkCheckPayload;
  try {
    return JSON.parse(raw) as ActivationCdkCheckPayload;
  } catch {
    throw new AppError("Activation cdk check payload is invalid", 502, {
      providerBody: String(raw || "").slice(0, 2000),
      productId,
    });
  }
}

function normalizeClientTokenInput(input: string) {
  // Backwards-compatible wrapper.
  return parseClientTokenInput(input).extracted || parseClientTokenInput(input).raw;
}

function parseClientTokenInput(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return { raw: "", extracted: "", json: null as Record<string, unknown> | null };
  if (!raw.startsWith("{")) return { raw, extracted: raw, json: null as Record<string, unknown> | null };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken.trim() : "";
    const sessionToken = typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : "";
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const extracted = accessToken || sessionToken || token || raw;
    return { raw, extracted, json: parsed };
  } catch {
    return { raw, extracted: raw, json: null as Record<string, unknown> | null };
  }
}

function buildUpstreamUserCandidates(tokenInfo: { raw: string; extracted: string; json: Record<string, unknown> | null }) {
  const out: any[] = [];

  // If client pasted ChatGPT session JSON, upstream providers may expect either:
  // 1) user: <object>
  // 2) user: "<json string>"
  // 3) user: "<short token string>"
  if (tokenInfo.json) {
    out.push(tokenInfo.json);
    out.push(tokenInfo.raw);
  }
  if (tokenInfo.extracted && tokenInfo.extracted !== tokenInfo.raw) out.push(tokenInfo.extracted);
  if (tokenInfo.raw) out.push(tokenInfo.raw);

  // De-dupe while preserving order.
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const v of out) {
    const key = typeof v === "string" ? `s:${v}` : `j:${safeStableJsonKey(v)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(v);
  }
  return unique;
}

function safeStableJsonKey(value: unknown) {
  try {
    // Do not include secrets in error details/logs; this is only for in-memory de-dupe.
    return JSON.stringify(Object.keys(value as any).sort());
  } catch {
    return "json";
  }
}

function buildTokenMeta(tokenInfo: { raw: string; extracted: string; json: Record<string, unknown> | null }) {
  const kind = (() => {
    if (!tokenInfo.json) return "raw" as const;
    const parsed = tokenInfo.json as any;
    if (typeof parsed?.accessToken === "string" && parsed.accessToken.trim()) return "json_accessToken" as const;
    if (typeof parsed?.sessionToken === "string" && parsed.sessionToken.trim()) return "json_sessionToken" as const;
    if (typeof parsed?.token === "string" && parsed.token.trim()) return "json_token" as const;
    return "json_unknown" as const;
  })();

  // Don't store raw token; store a short fingerprint for debugging correlation only.
  const fp = crypto.createHash("sha256").update(String(tokenInfo.extracted || "")).digest("hex").slice(0, 16);
  return { kind, length: Number(String(tokenInfo.raw || "").length), fingerprint: fp };
}

function isTokenBoundToAnotherFingerprint(
  current: { fingerprint?: string } | null | undefined,
  next: { fingerprint?: string } | null | undefined
) {
  const currentFp = String(current?.fingerprint || "").trim();
  const nextFp = String(next?.fingerprint || "").trim();
  if (!currentFp || !nextFp) return false;
  return currentFp !== nextFp;
}

function tryDecodeJwtPayload(token: string): { exp?: number; iat?: number } | null {
  const t = String(token || "").trim();
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1] || "";
  if (!payload) return null;

  try {
    const json = Buffer.from(base64UrlToBase64(payload), "base64").toString("utf8");
    const parsed = JSON.parse(json) as any;
    const exp = typeof parsed?.exp === "number" ? parsed.exp : undefined;
    const iat = typeof parsed?.iat === "number" ? parsed.iat : undefined;
    if (!exp && !iat) return null;
    return { exp, iat };
  } catch {
    return null;
  }
}

function base64UrlToBase64(value: string) {
  const s = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return s + pad;
}

function updateActivationFromProviderPayload(orderId: string, taskId: string, payload: {
  pending?: boolean;
  success?: boolean;
  message?: string;
  task_id?: string;
  cdk?: string;
}) {
  const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
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

function updateActivationFromProviderCdkPayload(orderId: string, productId: string, payload: ActivationCdkCheckPayload) {
  const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
  if (!stored) return;

  const nowIso = new Date().toISOString();
  const used = Boolean(payload?.used);
  const hasTask = Boolean(String(stored.taskId || "").trim());
  const nextStatus = used ? "success" : stored.status;
  const nextVerificationState = used ? "success" : hasTask ? "pending" : "unknown";
  const providerMessage = used
    ? `Provider check: CDK is marked as used (${productId})`
    : hasTask
    ? `Provider check: CDK is not used yet (${productId})`
    : `Provider check: CDK is not used yet (${productId}). Activation has not been started (task is missing)`;

  activationStore.upsert({
    ...stored,
    status: nextStatus,
    verificationState: nextVerificationState,
    lastProviderMessage: providerMessage,
    lastProviderCheckedAt: nowIso,
    lastProviderPayload: {
      source: "cdks/public/check",
      product_id: productId,
      used,
      ...payload,
    },
    updatedAt: nowIso,
  });
}

function updateActivationProviderCheckError(orderId: string, error: unknown) {
  const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
  if (!stored) return;

  const nowIso = new Date().toISOString();
  const message = summarizeProviderCheckError(error);
  activationStore.upsert({
    ...stored,
    lastProviderMessage: message,
    lastProviderCheckedAt: nowIso,
    lastProviderPayload: {
      source: "provider-check-error",
      message,
    },
    updatedAt: nowIso,
  });
}

function summarizeProviderCheckError(error: unknown) {
  if (error instanceof AppError) {
    const details = stringifyErrorDetails(error.details);
    return details ? `${error.message}: ${details}` : error.message;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Provider check failed";
}

function stringifyErrorDetails(details: unknown) {
  if (typeof details === "string") return details;
  if (details == null) return "";
  try {
    return JSON.stringify(details);
  } catch {
    return "";
  }
}

function deriveActivationProviderProductCandidates(input: { productSlug?: string; productKey?: string }) {
  const candidates: string[] = [];
  const add = (value: string) => {
    const normalized = normalizeProviderProductId(value);
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  const values = [input.productSlug, input.productKey].map((value) => String(value || "").trim().toLowerCase());
  for (const value of values) {
    if (!value) continue;
    add(value);
    if (value.includes("chatgpt")) add("chatgpt");
    if (value.includes("claude")) add("claude");
    if (value.includes("grok")) add("grok");
    if (value.includes("discord")) add("discord");
  }

  if (candidates.length === 0) candidates.push("chatgpt");
  return candidates;
}

function normalizeProviderProductId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
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
