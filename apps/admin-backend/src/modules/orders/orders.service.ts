import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/app-error";
import { ordersRepository } from "./orders.repository";
import { writeAuditLog } from "../audit/audit.service";
import { sendOrderPaidEmail, sendTelegramNotification } from "../notifications/notifications.service";
import { paymentsService } from "../payments/payments.service";
import { env } from "../../config/env";
import { paymentWebhookService } from "../payments/payment-webhook.service";
import { resolveLavaCredentials } from "../payments/lava.credentials";
import { activationStore, type ActivationRecord } from "./activation.store";
import { deliverProduct } from "./delivery.service";
import { buildActivationSiteEndpointUrl, readActivationSiteUrlFromOrderDetails } from "../../common/utils/activation-site";
import { resolveOrderDeliveryType, resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { canonicalProductKey } from "../../common/utils/product-key";
import { manualCredentialsStore } from "../products/manual-credentials.store";
import { toVpnMePayload, vpnService } from "../../services/vpn.service";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const MAX_CLIENT_TOKEN_LENGTH = 500_000;
const MAX_ACTIVATION_START_ATTEMPTS = 3;
const ACTIVATION_OUTSTOCK_MAX_RETRIES = Math.min(
  120,
  Math.max(1, Number(env.ACTIVATION_OUTSTOCK_MAX_RETRIES || 40))
);
const ACTIVATION_OUTSTOCK_RETRY_DELAY_MS = Math.min(
  10_000,
  Math.max(500, Number(env.ACTIVATION_OUTSTOCK_RETRY_DELAY_MS || 2_000))
);
const SXZFD_GROK_API_TIMEOUT_MS = 25_000;
const SXZFD_GROK_MAX_START_ATTEMPTS = Math.min(3, ACTIVATION_OUTSTOCK_MAX_RETRIES);
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
const DEFAULT_SUPPORT_URL = "https://quickplus.vip/public/grok/";
const DEFAULT_CLAUDE_MAX20X_SUPPORT_URL = "https://quickplus.vip/public/max20x/";
const DEFAULT_GROK_1M_SUPPORT_URL = "https://vip.sxzfd.com/grok";
const DEFAULT_SUPPORT_EMAIL = "";

function isSupportLikeDeliveryType(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "support" || normalized === "support_claude";
}

function resolveSupportActivationFlowByDeliveryType(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "support_claude") return "claude_token";
  return "grok_token";
}

function isSxzfdGrokSupportProduct(productKey?: string | null) {
  const key = String(productKey || "").trim().toLowerCase();
  return (
    key.includes("supergrok-1-month") ||
    key.includes("grok-1-month") ||
    key.includes("supergrok-1-sdk4") ||
    /(^|-)supergrok-1($|-)/.test(key)
  );
}

function isQuickplusMax20xClaudeCdk(cdk?: string | null) {
  return /^YYY-[A-Z0-9]+$/i.test(String(cdk || "").trim());
}

function resolveSupportEmail() {
  const raw = String(env.SMTP_FROM || "").trim();
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return String(emailMatch?.[0] || DEFAULT_SUPPORT_EMAIL).toLowerCase();
}

function normalizePaymentChannel(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "gateway" || raw === "enot.io") return "enot";
  return raw;
}

function assertTokenActivationDeliveryMode(activationInfo: any) {
  const deliveryMode = String(activationInfo?.deliveryMode || "activation").trim().toLowerCase();
  if (deliveryMode === "activation") return;
  if (deliveryMode === "support") return;
  if (deliveryMode === "vpn") {
    throw new AppError("This product is delivered as VPN access. Token activation is not required.", 409);
  }
  if (deliveryMode === "credentials") {
    throw new AppError("This product is delivered via login/password. Token activation is not required.", 409);
  }
  throw new AppError("This product does not require token activation.", 409);
}

function isSupportTokenActivationMode(activationInfo: any) {
  return String(activationInfo?.deliveryMode || "").trim().toLowerCase() === "support";
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
    const orderIds = (Array.isArray(result.items) ? result.items : [])
      .map((order: any) => String(order?.id || "").trim())
      .filter(Boolean);
    const activationSnapshot = activationStore.findByOrderIds(orderIds);
    const activationByOrder = new Map<string, ActivationRecord>();
    for (const orderId of orderIds) {
      const activation = normalizeActivationRecordForRead(activationSnapshot.get(orderId));
      if (activation) activationByOrder.set(orderId, activation);
    }

    const items = result.items.map((order: any) => {
      const activation = activationByOrder.get(String(order.id || ""));
      const firstItem = Array.isArray(order.items) ? order.items[0] : null;
      const product = firstItem?.product || null;
      const deliveryType = resolveOrderDeliveryType(order.orderDetails, product?.tags || []);
      const productId = String(firstItem?.productId || product?.id || "").trim() || null;
      const productSlug = String(product?.slug || "").trim() || null;
      const productTitle = String(product?.title || firstItem?.productRaw || "").trim();
      const quantity = Math.max(1, Number(firstItem?.quantity || 1));
      const unitPrice = firstItem?.price === undefined || firstItem?.price === null ? null : Number(firstItem.price);
      const recentPayments = Array.isArray(order.payments) ? order.payments : [];
      const latestPayment = recentPayments[0] || null;
      const latestPaymentPayload =
        latestPayment?.payload && typeof latestPayment.payload === "object" && !Array.isArray(latestPayment.payload)
          ? (latestPayment.payload as Record<string, unknown>)
          : null;
      const orderDetails =
        order.orderDetails && typeof order.orderDetails === "object" && !Array.isArray(order.orderDetails)
          ? (order.orderDetails as Record<string, unknown>)
          : null;
      const paymentOrderDetails =
        latestPaymentPayload?.orderDetails && typeof latestPaymentPayload.orderDetails === "object" && !Array.isArray(latestPaymentPayload.orderDetails)
          ? (latestPaymentPayload.orderDetails as Record<string, unknown>)
          : null;
      const checkoutDetails = orderDetails || paymentOrderDetails;
      const paymentProviderRaw = String(latestPayment?.provider || "").trim() || null;
      const paymentProvider = normalizePaymentChannel(paymentProviderRaw);
      const paymentMethodRequested = normalizePaymentChannel(order.paymentMethod);
      const paidPayment =
        recentPayments.find((payment: any) => String(payment?.status || "") === PaymentStatus.SUCCESS) || null;
      const paidAt = paidPayment ? paidPayment.processedAt || paidPayment.createdAt || null : null;
      const activationCompletedAt =
        activation && (activation.status === "success" || activation.status === "failed") ? activation.updatedAt : null;

      return {
        ...order,
        product: product
          ? {
              id: productId,
              slug: productSlug,
              title: productTitle,
              deliveryType,
              quantity,
              unitPrice,
            }
          : {
              id: productId,
              slug: productSlug,
              title: productTitle,
              deliveryType,
              quantity,
              unitPrice,
            },
        paymentStatus: latestPayment?.status || null,
        paymentProvider,
        paymentProviderRaw,
        checkoutDetails,
        paymentMethodRequested,
        paymentRef: latestPayment?.providerRef || null,
        paymentProcessedAt: latestPayment?.processedAt || null,
        paidAt,
        completedAt: activationCompletedAt,
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
              completedAt: activationCompletedAt,
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
    const deliveryMode = resolveOrderDeliveryType(order.orderDetails, firstItem?.product?.tags || []);
    const activation = normalizeActivationRecordForRead(activationStore.findByOrderId(id));
    const payments = await prisma.payment.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        status: true,
        processedAt: true,
        createdAt: true,
      },
    });
    const latestPayment = payments[0] || null;
    const paidPayment =
      payments.find((payment: any) => String(payment?.status || "") === PaymentStatus.SUCCESS) || null;

    return {
      status: order.status,
      paymentStatus: latestPayment?.status || null,
      paidAt: paidPayment ? paidPayment.processedAt || paidPayment.createdAt || null : null,
      planId,
      deliveryMode,
      emailMasked: maskEmail(order.email),
      finalAmount: Number(order.totalAmount),
      currency: order.currency,
      activationStatus: activation?.status || null,
      activationVerificationState: activation?.verificationState || null,
      activationTaskId: activation?.taskId || null,
      activationMessage: activation?.lastProviderMessage || null,
      activationUpdatedAt: activation?.updatedAt || null,
    };
  },

  async reconcilePublicStatus(id: string) {
    assertOrderId(id);
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        botType: true,
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
    const deliveryType = resolveOrderDeliveryType(fullOrder?.orderDetails, firstItem?.product?.tags || []);
    const isSupportTokenFlow = isSupportLikeDeliveryType(deliveryType);
    const supportActivationFlow = resolveSupportActivationFlowByDeliveryType(deliveryType);

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

    if (deliveryType === "manual_login") {
      await deliverProduct(order);
      const supportEmail = resolveSupportEmail();
      return {
        orderId: order.id,
        deliveryMode: "manual_login",
        status: "pending_manual",
        supportUrl: DEFAULT_SUPPORT_URL,
        supportEmail,
        message:
          "Заказ со входом принят. Менеджер обработает заявку вручную и подключит подписку на аккаунт, данные которого вы указали при оформлении.",
      };
    }

    if (deliveryType === "vpn") {
      await deliverProduct(order);
      const access = await vpnService.getLatestByOrderOrIdentity({
        orderId: order.id,
        email: order.email,
      });
      if (!access) {
        throw new AppError("VPN access is not issued yet", 409);
      }
      return {
        orderId: order.id,
        deliveryMode: "vpn",
        status: "vpn_ready",
        ...(await toVpnMePayload(access)),
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
      deliveryMode: isSupportTokenFlow ? "support" : "activation",
      activationFlow: isSupportTokenFlow ? supportActivationFlow : "chatgpt_token",
      product: current.productKey,
      status: current.status,
      taskId: current.taskId || null,
      verificationState: current.verificationState || "unknown",
      lastProviderMessage: current.lastProviderMessage || null,
      lastProviderCheckedAt: current.lastProviderCheckedAt || null,
      processingHint: isSupportTokenFlow
        ? "Activation usually takes 5-15 minutes after token submission."
        : null,
    };
  },

  async startActivation(orderId: string, token: string, orderToken?: string) {
    const activationInfo = (await this.getActivation(orderId, orderToken)) as any;
    assertTokenActivationDeliveryMode(activationInfo);
    return withActivationOrderLock(orderId, async () => startActivationUnsafe(orderId, token, orderToken));
  },

  async storeActivationClientToken(orderId: string, token: string, orderToken?: string) {
    const order = await assertOrderTokenAccess(orderId, orderToken);
    const orderWithItem = await getOrderWithFirstItem(order.id);
    const firstItem = orderWithItem?.items?.[0];
    const deliveryType = resolveOrderDeliveryType(orderWithItem?.orderDetails, firstItem?.product?.tags || []);
    const isSupportFlow = isSupportLikeDeliveryType(deliveryType);
    const tokenInfo = parseClientTokenInput(token);
    const tokenMeta = buildTokenMeta(tokenInfo);
    const reasons: string[] = [];

    if (!tokenInfo.raw) reasons.push("Token is required");
    if (tokenInfo.raw && tokenInfo.raw.length > MAX_CLIENT_TOKEN_LENGTH) reasons.push("Token is too long");

    if (tokenInfo.raw.startsWith("{")) {
      if (!tokenInfo.json) {
        reasons.push("Token JSON is invalid");
      } else if (tokenInfo.extracted === tokenInfo.raw) {
        reasons.push("Token JSON does not include accessToken/sessionToken/token");
      }
    }

    if (isSupportFlow) {
      const supportValidation = validateSupportSessionJwtToken(tokenInfo.extracted || tokenInfo.raw);
      reasons.push(...supportValidation.reasons);
    }

    const existing = normalizeActivationRecordForRead(activationStore.findByOrderId(order.id));
    if (
      existing &&
      (existing.status === "processing" || existing.status === "success") &&
      isTokenBoundToAnotherFingerprint(existing.tokenMeta, tokenMeta)
    ) {
      reasons.push("Order is already bound to another token");
    }

    if (reasons.length > 0) {
      throw new AppError(reasons[0] || "Invalid token", 400, { reasons });
    }

    const productKey = resolveActivationPoolProductKeyForOrder(orderWithItem);
    const activationSiteUrl = readActivationSiteUrlFromOrderDetails(orderWithItem?.orderDetails);
    const nowIso = new Date().toISOString();
    const storagePatch = buildStoredClientTokenPatch(tokenInfo.raw);
    const next: ActivationRecord = {
      orderId: order.id,
      email: order.email,
      productKey,
      activationSiteUrl: existing?.activationSiteUrl || activationSiteUrl || "",
      cdk: existing?.cdk || "",
      status: existing?.status || "issued",
      taskId: existing?.taskId || null,
      attempts: Math.max(0, Number(existing?.attempts || 0)),
      tokenValidationAttempts: Math.max(0, Number(existing?.tokenValidationAttempts || 0)) + 1,
      lastTokenValidatedAt: nowIso,
      tokenMeta,
      deviceId: existing?.deviceId || null,
      verificationState: existing?.verificationState || "unknown",
      lastProviderMessage:
        existing?.lastProviderMessage ||
        (order.status === OrderStatus.PAID ? "Client token stored" : "Client token stored before payment confirmation"),
      lastProviderCheckedAt: existing?.lastProviderCheckedAt || nowIso,
      lastProviderPayload: existing?.lastProviderPayload || null,
      issuedAt: existing?.issuedAt || nowIso,
      updatedAt: nowIso,
      ...storagePatch,
    };
    activationStore.upsert(next);

    return {
      ok: true,
      orderId: order.id,
      status: next.status,
      paid: order.status === OrderStatus.PAID,
      token: {
        kind: tokenMeta.kind,
        length: tokenMeta.length,
        storedAt: next.clientTokenStoredAt || null,
        expiresAt: next.clientTokenExpiresAt || null,
      },
    };
  },

  async validateActivationToken(orderId: string, token: string, orderToken?: string) {
    const activationInfo = (await this.getActivation(orderId, orderToken)) as any;
    assertTokenActivationDeliveryMode(activationInfo);

    const stored = await ensureActivationRecordForTokenFlow(orderId, orderToken, activationInfo);

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
    if (isSupportTokenActivationMode(activationInfo)) {
      const supportValidation = validateSupportSessionJwtToken(tokenInfo.extracted || tokenInfo.raw);
      reasons.push(...supportValidation.reasons);
    }

    if (!String(stored.cdk || "").trim()) {
      reasons.push("Activation key is not issued yet");
    } else {
      // Sanity: ensure we actually have a DB-issued CDK for this order/product.
      const issued = await prisma.licenseKey.findFirst({
        where: {
          orderId,
          productKey: stored.productKey,
          activationSiteUrl: stored.activationSiteUrl || "",
          status: "used",
        },
        select: { id: true },
      });
      if (!issued) {
        reasons.push("Activation key is not issued yet");
      }
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
      if (isSupportTokenActivationMode(activationInfo)) {
        const supportValidation = validateSupportSessionJwtToken(safeToken);
        if (supportValidation.reasons.length > 0) {
          throw new AppError(`Invalid token format: ${supportValidation.reasons.join("; ")}`, 400);
        }
      }
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

      const reserved = await activationStore.reserveCdkRecordForOrder({
        productKey,
        activationSiteUrl: current?.activationSiteUrl || "",
        orderId: order.id,
        email: order.email,
        excludeCdk: current?.cdk || undefined,
      });
      if (!reserved) {
        throw new AppError("No unused CDK key available", 409);
      }

      const nowIso = new Date().toISOString();
      activationStore.upsert({
        orderId: order.id,
        email: order.email,
        productKey,
        cdk: reserved.code,
        activationSiteUrl: reserved.activationSiteUrl || current?.activationSiteUrl || "",
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
    const isSupportFlow = isSupportTokenActivationMode(activationInfo);

    if (isSupportFlow) {
      let current = stored;
      const taskForStatus = String(current?.taskId || taskId || "").trim();
      const decryptedToken = decryptStoredClientToken(current);
      const supportAccountId = String(parseClientTokenInput(decryptedToken).extracted || "").trim();
      let quickplusStatusChecked = false;

      if (taskForStatus || supportAccountId) {
        try {
          const supportPayload = await fetchQuickplusSupportTaskPayload({
            taskId: taskForStatus,
            accountId: supportAccountId,
            cdk: String(current?.cdk || ""),
            productKey: String(current?.productKey || ""),
          });
          updateActivationFromProviderPayload(orderId, taskForStatus || taskId, supportPayload);
          quickplusStatusChecked = true;
        } catch (error) {
          updateActivationProviderCheckError(orderId, error);
        }
        current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || current;
      }

      // Secondary fallback: if provider status probe couldn't run/resolve, check CDK usage.
      if (!quickplusStatusChecked && String(current?.cdk || "").trim()) {
        const productCandidates = deriveActivationProviderProductCandidates({
          productSlug: String(activationInfo?.product?.slug || ""),
          productKey: String(current?.productKey || ""),
        });
        try {
          const checked = await fetchActivationCdkCheckPayload(String(current?.cdk || ""), productCandidates);
          updateActivationFromProviderCdkPayload(orderId, checked.productId, checked.payload);
        } catch (error) {
          updateActivationProviderCheckError(orderId, error);
        }
        current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || current;
      }

      const isSuccess = current?.status === "success";
      const isPending = current?.status === "processing" || current?.verificationState === "pending";
      return {
        pending: Boolean(isPending && !isSuccess),
        success: Boolean(isSuccess),
        message: String(current?.lastProviderMessage || ""),
        task_id: String(current?.taskId || taskId),
      };
    }

    if (String(taskId || "").startsWith("chongzhi-")) {
      let current = stored;
      if (String(current?.cdk || "").trim() && current?.status !== "success") {
        try {
          const checked = await fetchChongzhiCodeStatus(String(current?.cdk || ""), current?.activationSiteUrl || "");
          updateActivationFromChongzhiCodePayload(orderId, checked);
          current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || current;
        } catch (error) {
          updateActivationProviderCheckError(orderId, error);
          current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || current;
        }
      }

      const isSuccess = current?.status === "success";
      const isPending = current?.status === "processing" || current?.verificationState === "pending";
      return {
        pending: Boolean(isPending && !isSuccess),
        success: Boolean(isSuccess),
        message: String(current?.lastProviderMessage || ""),
        task_id: String(current?.taskId || taskId),
      };
    }
    const payload = await fetchActivationTaskPayload(taskId, stored?.deviceId || null);
    updateActivationFromProviderPayload(orderId, taskId, payload);

    let current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || stored;
    // Some providers may report terminal failure while CDK is already consumed.
    // In that case treat provider CDK state as the source of truth to avoid false negatives on storefront.
    if (current?.status === "failed" && String(current?.cdk || "").trim()) {
      const productCandidates = deriveActivationProviderProductCandidates({
        productSlug: String(activationInfo?.product?.slug || ""),
        productKey: String(current?.productKey || ""),
      });
      try {
        const checked = await fetchActivationCdkCheckPayload(String(current.cdk || ""), productCandidates);
        updateActivationFromProviderCdkPayload(orderId, checked.productId, checked.payload);
        current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || current;
      } catch (error) {
        updateActivationProviderCheckError(orderId, error);
        current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || current;
      }
    }

    const isSuccess = current?.status === "success";
    const isPending = current?.status === "processing" || current?.verificationState === "pending";
    const responseTaskId = String(current?.taskId || payload.task_id || taskId);
    const responseMessage = String(current?.lastProviderMessage || payload.message || "");

    return {
      pending: Boolean(isPending && !isSuccess),
      success: Boolean(isSuccess),
      message: responseMessage,
      task_id: responseTaskId,
    };
  },

  async getActivationClientToken(
    orderId: string,
    actor?: { userId?: string; ip?: string; userAgent?: string }
  ) {
    assertOrderId(orderId);
    const current = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
    if (!current) throw new AppError("Client token is not stored or expired", 404);

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

  async manuallyCompleteActivation(
    id: string,
    input?: { note?: string },
    actor?: { userId?: string; ip?: string; userAgent?: string }
  ) {
    assertOrderId(id);
    const order = await getOrderWithFirstItem(id);
    if (!order) throw new AppError("Order not found", 404);
    if (order.status !== OrderStatus.PAID) {
      throw new AppError("Only paid orders can be marked as activated", 409);
    }

    const existing = normalizeActivationRecordForRead(activationStore.findByOrderId(order.id));
    const nowIso = new Date().toISOString();
    const productKey = existing?.productKey || resolveActivationPoolProductKeyForOrder(order);
    const activationSiteUrl = existing?.activationSiteUrl || readActivationSiteUrlFromOrderDetails(order.orderDetails);
    const note = String(input?.note || "").trim().slice(0, 500);
    const message = note ? `Manual activation completed by admin: ${note}` : "Manual activation completed by admin";
    const before = existing
      ? {
          status: existing.status,
          verificationState: existing.verificationState || "unknown",
          taskId: existing.taskId || null,
          cdk: existing.cdk || "",
        }
      : null;

    const base: ActivationRecord = existing || {
      orderId: order.id,
      email: order.email,
      productKey,
      activationSiteUrl,
      cdk: "",
      status: "issued",
      taskId: null,
      attempts: 0,
      tokenValidationAttempts: 0,
      verificationState: "unknown",
      lastProviderMessage: null,
      lastProviderCheckedAt: null,
      lastProviderPayload: null,
      issuedAt: nowIso,
      updatedAt: nowIso,
    };

    const next: ActivationRecord = {
      ...base,
      orderId: order.id,
      email: order.email,
      productKey,
      status: "success",
      verificationState: "success",
      lastProviderMessage: message,
      lastProviderCheckedAt: nowIso,
      lastProviderPayload: {
        source: "admin-manual-complete",
        note: note || null,
        actorUserId: actor?.userId || null,
        completedAt: nowIso,
      },
      updatedAt: nowIso,
    };

    activationStore.upsert(next);

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "order",
      entityId: id,
      action: "activation_manual_complete",
      before,
      after: {
        status: next.status,
        verificationState: next.verificationState,
        taskId: next.taskId || null,
        cdk: next.cdk || "",
        note: note || null,
      },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return this.getById(id);
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
    const deliveryType = resolveOrderDeliveryType(order.orderDetails, product?.tags || []);
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

    if (deliveryType === "manual_login") {
      if (order.status === OrderStatus.PAID) {
        await deliverProduct(order);
      }

      return {
        orderId: order.id,
        orderStatus: order.status,
        emailMasked: maskEmail(order.email),
        deliveryMode: "manual_login",
        product: product
          ? {
              id: product.id,
              slug: product.slug,
              title: product.title,
            }
          : null,
        activation: null,
        credentials: null,
        certainty:
          order.status === OrderStatus.PAID
            ? {
                code: "MANUAL_LOGIN_PENDING",
                label: "Ручная заявка со входом",
              }
            : {
                code: "ORDER_NOT_PAID",
                label: "Заказ не оплачен",
              },
        isActivatedConfirmed: false,
      };
    }

    if (deliveryType === "vpn") {
      if (order.status === OrderStatus.PAID) {
        await deliverProduct(order);
      }

      const access = await vpnService.getLatestByOrderOrIdentity({
        orderId: order.id,
        email: order.email,
      });
      const vpnPayload = access ? await toVpnMePayload(access) : null;
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
      if (String(activation.taskId || "").startsWith("chongzhi-") && activation.cdk) {
        try {
          const checked = await fetchChongzhiCodeStatus(activation.cdk, activation.activationSiteUrl || "");
          updateActivationFromChongzhiCodePayload(id, checked);
        } catch (error) {
          updateActivationProviderCheckError(id, error);
        }
      } else if (activation.taskId) {
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
      deliveryMode: isSupportLikeDeliveryType(deliveryType) ? "support" : "activation",
      activationFlow: isSupportLikeDeliveryType(deliveryType)
        ? resolveSupportActivationFlowByDeliveryType(deliveryType)
        : "chatgpt_token",
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
      processingHint:
        isSupportLikeDeliveryType(deliveryType)
          ? "Activation usually takes 5-15 minutes after token submission."
          : null,
    };
  },

  async create(
    input: { email: string; productId: string; quantity: number; paymentMethod?: string; country?: string; promoCode?: string; orderDetails?: any },
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

    const telegramMatch = String(input.email || "")
      .trim()
      .toLowerCase()
      .match(/^tg_(claude|chatgpt|grok)_(-?\d+)@telegram\.local$/);
    const telegramContext = telegramMatch
      ? {
          source: "telegram",
          botType: telegramMatch[1],
          telegramUserId: telegramMatch[2],
          telegramChatId: telegramMatch[2],
        }
      : {};

    return paymentsService.createOrderWithPayment({
      email: input.email,
      productId: input.productId,
      quantity: input.quantity,
      paymentMethod: input.paymentMethod,
      country: input.country,
      promoCode: input.promoCode,
      orderDetails:
        input.orderDetails && typeof input.orderDetails === "object" && !Array.isArray(input.orderDetails)
          ? input.orderDetails
          : null,
      ip: meta?.ip,
      ...telegramContext,
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
  const order = await assertOrderTokenAccess(orderId, orderToken);

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

async function assertOrderTokenAccess(orderId: string, orderToken?: string) {
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
  botType: string | null;
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
        botType: true,
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
      const status = await probeLavaInvoiceStatus(order.id, providerRef, order.botType);
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

async function probeLavaInvoiceStatus(orderId: string, providerRef: string, botType?: string | null) {
  const credentials = resolveLavaCredentials({ botType });
  if (!credentials) return null;

  const payload = {
    shopId: credentials.shopId,
    orderId: String(orderId),
    invoiceId: String(providerRef),
  };
  const signature = signLavaPayload(payload, credentials.secretKey);

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

function resolveActivationPoolProductKeyForOrder(orderWithItem: Awaited<ReturnType<typeof getOrderWithFirstItem>>) {
  const firstItem = orderWithItem?.items?.[0];
  const product = firstItem?.product || null;
  const deliveryType = resolveOrderDeliveryType(orderWithItem?.orderDetails, product?.tags || []);
  const orderSource = String((orderWithItem as any)?.source || "").trim().toLowerCase();
  const isTelegramOrder = orderSource === "telegram";
  const productSlug = String(product?.slug || "").trim().toLowerCase();
  const productId = String(product?.id || "").trim().toLowerCase();
  const baseProductKey = canonicalProductKey(productSlug || productId || "chatgpt");
  if (!baseProductKey) return "chatgpt";
  if (String(deliveryType || "").trim().toLowerCase() === "support_claude") {
    const key = isTelegramOrder ? `tgbot-${baseProductKey}-sdk5` : `${baseProductKey}-sdk5`;
    return canonicalProductKey(key) || key;
  }
  if (isSupportLikeDeliveryType(deliveryType)) {
    const key = isTelegramOrder ? `tgbot-${baseProductKey}-sdk4` : `${baseProductKey}-sdk4`;
    return canonicalProductKey(key) || key;
  }
  return baseProductKey;
}

async function ensureActivationRecordForTokenFlow(orderId: string, orderToken?: string, activationInfo?: any) {
  const existing = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
  const order = await assertPaidOrderAccess(orderId, orderToken);
  const orderWithItem = await getOrderWithFirstItem(order.id);
  const productKey = resolveActivationPoolProductKeyForOrder(orderWithItem);
  const activationSiteUrl = readActivationSiteUrlFromOrderDetails(orderWithItem?.orderDetails);
  if (existing) {
    const needsTelegramPoolRemap =
      !String(existing.cdk || "").trim() &&
      String((orderWithItem as any)?.source || "").trim().toLowerCase() === "telegram" &&
      isSupportLikeDeliveryType(
        resolveOrderDeliveryType(orderWithItem?.orderDetails, orderWithItem?.items?.[0]?.product?.tags || [])
      ) &&
      !String(existing.productKey || "").startsWith("tgbot-");
    const needsActivationSitePatch =
      !String(existing.cdk || "").trim() &&
      String(existing.activationSiteUrl || "") !== String(activationSiteUrl || "");
    if (
      (needsTelegramPoolRemap && String(existing.productKey || "") !== String(productKey || "")) ||
      needsActivationSitePatch
    ) {
      const nowIso = new Date().toISOString();
      const patched = {
        ...existing,
        productKey: needsTelegramPoolRemap ? productKey : existing.productKey,
        activationSiteUrl,
        updatedAt: nowIso,
      } as ActivationRecord;
      activationStore.upsert(patched);
      return normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || patched;
    }
    return existing;
  }

  const nowIso = new Date().toISOString();
  const fallbackMessage =
    String(activationInfo?.deliveryMode || "").toLowerCase() === "support"
      ? "Waiting for SDK key assignment"
      : "Activation key is not issued yet";

  const skeleton: ActivationRecord = {
    orderId: order.id,
    email: order.email,
    productKey,
    activationSiteUrl,
    cdk: "",
    status: "issued",
    taskId: null,
    attempts: 0,
    tokenValidationAttempts: 0,
    verificationState: "unknown",
    lastProviderMessage: fallbackMessage,
    lastProviderCheckedAt: nowIso,
    lastProviderPayload: null,
    issuedAt: nowIso,
    updatedAt: nowIso,
  };
  activationStore.upsert(skeleton);
  return normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || skeleton;
}

async function startActivationUnsafe(orderId: string, token: string, orderToken?: string) {
  const activationInfo = await ordersService.getActivation(orderId, orderToken);
  assertTokenActivationDeliveryMode(activationInfo);
  let stored = await ensureActivationRecordForTokenFlow(orderId, orderToken, activationInfo);
  const tokenInfo = parseClientTokenInput(token);
  if (!tokenInfo.raw) throw new AppError("Token is required", 400);
  if (tokenInfo.raw.length > MAX_CLIENT_TOKEN_LENGTH) throw new AppError("Token is too long", 400);
  const isSupportFlow = isSupportTokenActivationMode(activationInfo);
  const isChongzhiProvider = String(env.ACTIVATION_PROVIDER || "nitro").trim().toLowerCase() === "chongzhi";
  if (!isSupportFlow && isChongzhiProvider && !tokenInfo.raw.startsWith("{")) {
    throw new AppError(
      "For this activation method, paste the full JSON from https://chatgpt.com/api/auth/session",
      400
    );
  }
  if (isSupportFlow) {
    const supportValidation = validateSupportSessionJwtToken(tokenInfo.extracted || tokenInfo.raw);
    if (supportValidation.reasons.length > 0) {
      throw new AppError(`Invalid token format: ${supportValidation.reasons.join("; ")}`, 400);
    }
  }
  const storagePatch = buildStoredClientTokenPatch(tokenInfo.raw);
  const nowIso = new Date().toISOString();
  const latestBeforeStart = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || stored;
  activationStore.upsert({
    ...latestBeforeStart,
    ...storagePatch,
    lastTokenValidatedAt: nowIso,
    tokenValidationAttempts: Math.max(0, Number(latestBeforeStart.tokenValidationAttempts || 0)) + 1,
    updatedAt: nowIso,
  });
  stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || latestBeforeStart;

  if (!String(stored.cdk || "").trim()) {
    const paidOrder = await assertPaidOrderAccess(orderId, orderToken);
    const reserved = await activationStore.reserveCdkRecordForOrder({
      productKey: String(stored.productKey || "chatgpt"),
      activationSiteUrl: stored.activationSiteUrl || "",
      orderId: paidOrder.id,
      email: paidOrder.email,
    });
    if (reserved) {
      const latest = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || stored;
      activationStore.upsert({
        ...latest,
        cdk: reserved.code,
        activationSiteUrl: reserved.activationSiteUrl || stored.activationSiteUrl || "",
        status: "issued",
        taskId: null,
        verificationState: "unknown",
        lastProviderMessage: "Activation key issued",
        lastProviderCheckedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || latest;
    }
  }
  if (!String(stored.cdk || "").trim()) {
    throw new AppError("Activation key is not issued yet", 409);
  }

  // Upstream provider appears to bind tasks to a device id; keep it stable.
  const deviceId = String(env.ACTIVATION_DEVICE_ID || "web").trim() || "web";

  const userCandidates = buildUpstreamUserCandidates(tokenInfo);
  const tokenMeta = buildTokenMeta(tokenInfo);

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
  const attempts = Math.max(0, Number(stored.attempts || 0));
  if (attempts >= MAX_ACTIVATION_START_ATTEMPTS) {
    throw new AppError("Activation attempts limit reached. Contact support.", 429);
  }

  let createResult = await startOutstockTaskWithRetry({
    cdk: stored.cdk,
    deviceId,
    userCandidates,
    supportFlow: isSupportFlow,
    activationFlow: String(activationInfo?.activationFlow || "").trim().toLowerCase(),
    productKey: String(stored.productKey || ""),
    activationSiteUrl: String(stored.activationSiteUrl || ""),
  });
  // For support-flow providers (SuperGrok/Claude), automatically rotate CDK once
  // when upstream reports "key already used"/validation-type errors.
  if (!createResult.ok && isSupportFlow && shouldRotateCdkAfterStartFailure(createResult)) {
    const paidOrder = await assertPaidOrderAccess(orderId, orderToken);
    const nextCdk = await activationStore.reserveCdkForOrder({
      productKey: String(stored.productKey || "chatgpt"),
      orderId: paidOrder.id,
      email: paidOrder.email,
    });
    if (nextCdk) {
      const latestForRotate = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || stored;
      activationStore.upsert({
        ...latestForRotate,
        cdk: nextCdk,
        status: "issued",
        taskId: null,
        verificationState: "unknown",
        lastProviderMessage: "Previous key rejected by provider. New key issued automatically.",
        lastProviderCheckedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || latestForRotate;
      createResult = await startOutstockTaskWithRetry({
        cdk: nextCdk,
        deviceId,
        userCandidates,
        supportFlow: isSupportFlow,
        activationFlow: String(activationInfo?.activationFlow || "").trim().toLowerCase(),
        productKey: String(stored.productKey || ""),
        activationSiteUrl: String(stored.activationSiteUrl || ""),
      });
    }
  }
  if (!createResult.ok) {
    throw new AppError("Activation start failed", 502, {
      upstreamStatus: createResult.status || 0,
      upstreamBody: String(createResult.body || "").slice(0, 2000),
      retries: createResult.tries,
    });
  }

  const taskId = String(createResult.taskId || "").trim();
  if (!taskId) throw new AppError("Activation task id is empty", 502);
  const nextStatus: ActivationRecord["status"] = createResult.immediateSuccess ? "success" : "processing";
  const nextVerificationState: NonNullable<ActivationRecord["verificationState"]> = createResult.immediateSuccess
    ? "success"
    : "pending";

  const latest = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId)) || stored;
  activationStore.upsert({
    ...latest,
    ...storagePatch,
    deviceId,
    tokenMeta,
    status: nextStatus,
    taskId,
    attempts: attempts + 1,
    verificationState: nextVerificationState,
    lastProviderMessage: String(createResult.message || "Activation request sent"),
    lastProviderCheckedAt: new Date().toISOString(),
    lastProviderPayload: createResult.providerPayload || null,
    updatedAt: new Date().toISOString(),
  });

  return { taskId };
}

async function startOutstockTaskWithRetry(input: {
  cdk: string;
  deviceId: string;
  userCandidates: any[];
  supportFlow?: boolean;
  activationFlow?: string;
  productKey?: string;
  activationSiteUrl?: string;
}) {
  if (input.supportFlow) {
    return startQuickplusSupportTaskWithRetry(input);
  }
  if (String(env.ACTIVATION_PROVIDER || "nitro").trim().toLowerCase() === "chongzhi") {
    return startChongzhiTaskWithRetry(input, {
      baseUrl: input.activationSiteUrl,
      sourceLabel: input.activationSiteUrl,
    });
  }
  let lastStatus = 0;
  let lastBody = "";
  let tries = 0;

  for (let attempt = 1; attempt <= ACTIVATION_OUTSTOCK_MAX_RETRIES; attempt += 1) {
    for (const candidate of input.userCandidates) {
      tries += 1;
      const response = await fetch("https://receipt-api.nitro.xin/stocks/public/outstock", {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "X-Device-Id": input.deviceId,
        },
        body: JSON.stringify({
          cdk: input.cdk,
          user: candidate,
        }),
      });

      if (response.ok) {
        const taskId = String((await response.text().catch(() => "")).trim() || "");
        return {
          ok: true as const,
          taskId,
          status: response.status,
          body: "",
          tries,
          immediateSuccess: false,
          message: "Activation request sent",
          providerPayload: null,
        };
      }

      lastStatus = response.status;
      lastBody = await response.text().catch(() => "");
      // If token was JSON, try alternate user shapes on 400 only.
      if (response.status !== 400) break;
    }

    if (!shouldRetryOutstockFailure(lastStatus, lastBody)) {
      break;
    }
    if (attempt >= ACTIVATION_OUTSTOCK_MAX_RETRIES) {
      break;
    }

    const pauseMs = Math.min(12_000, ACTIVATION_OUTSTOCK_RETRY_DELAY_MS + (attempt - 1) * 250);
    await sleep(pauseMs);
  }

  return {
    ok: false as const,
    taskId: "",
    status: lastStatus,
    body: lastBody,
    tries,
    immediateSuccess: false,
    message: "",
    providerPayload: null,
  };
}

async function startQuickplusSupportTaskWithRetry(input: {
  cdk: string;
  deviceId: string;
  userCandidates: any[];
  activationFlow?: string;
  productKey?: string;
}) {
  if (isSxzfdGrokSupportProduct(input.productKey)) {
    return startSxzfdGrokTaskWithRetry(input);
  }

  const accountId =
    input.userCandidates.find((candidate) => typeof candidate === "string" && /^[0-9a-f-]{36}$/i.test(String(candidate || "").trim())) ||
    input.userCandidates.find((candidate) => typeof candidate === "string" && String(candidate || "").trim());
  const accountIdRaw = String(accountId || "").trim();
  if (!accountIdRaw) {
    return {
      ok: false as const,
      taskId: "",
      status: 400,
      body: "Account ID is empty",
      tries: 0,
      immediateSuccess: false,
      message: "Account ID is empty",
      providerPayload: null,
    };
  }

  const activationFlow = String(input.activationFlow || "").trim().toLowerCase();
  const lowerProductKey = String(input.productKey || "").toLowerCase();
  const isClaudeFlow =
    activationFlow === "claude_token" || lowerProductKey.includes("claude") || lowerProductKey.endsWith("-sdk5");
  const quickplusTarget = resolveQuickplusSupportTarget({
    cdk: input.cdk,
    isClaudeFlow,
    productKey: input.productKey,
  });
  const apiUrl = quickplusTarget.apiUrl;
  const productType = quickplusTarget.productType;

  let lastStatus = 0;
  let lastBody = "";
  let lastMessage = "";
  let tries = 0;

  for (let attempt = 1; attempt <= ACTIVATION_OUTSTOCK_MAX_RETRIES; attempt += 1) {
    tries += 1;
    try {
      const activateCard = await quickplusApiCall(apiUrl, "activate_card", {
        card_code: input.cdk,
        product_type: productType,
      });
      if (!activateCard.success) {
        lastStatus = activateCard.status || 502;
        lastBody = activateCard.raw || "activate_card failed";
        lastMessage = String(activateCard.json?.message || "");
      } else {
        const bindUser = await quickplusApiCall(apiUrl, "bind_user", {
          card_code: input.cdk,
          claude_user_id: accountIdRaw,
          product_type: productType,
        });
        // If user is already bound for this card, provider may respond with success=false but valid state.
        const bindMessage = String(bindUser.json?.message || "").toLowerCase();
        const bindAlreadyBound = bindMessage.includes("already") && bindMessage.includes("bind");
        if (!bindUser.success && !bindAlreadyBound) {
          lastStatus = bindUser.status || 502;
          lastBody = bindUser.raw || "bind_user failed";
          lastMessage = String(bindUser.json?.message || "");
        } else {
          const startRecharge = await quickplusApiCall(apiUrl, "start_recharge", {
            claude_user_id: accountIdRaw,
            product_type: productType,
          });
          if (startRecharge.success) {
            const taskId = String(startRecharge.json?.data?.task_id || "").trim() || `quickplus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return {
              ok: true as const,
              taskId,
              status: startRecharge.status || 200,
              body: startRecharge.raw || "",
              tries,
              immediateSuccess: false,
              message: String(startRecharge.json?.message || "Activation request sent"),
              providerPayload: {
                source: quickplusTarget.source,
                activate: activateCard.json || null,
                bind: bindUser.json || null,
                recharge: startRecharge.json || null,
              },
            };
          }

          lastStatus = startRecharge.status || 502;
          lastBody = startRecharge.raw || "start_recharge failed";
          lastMessage = String(startRecharge.json?.message || "");
        }
      }
    } catch (error) {
      lastStatus = 0;
      lastBody = error instanceof Error ? error.message : String(error || "unknown error");
      lastMessage = "";
    }

    if (!shouldRetryOutstockFailure(lastStatus, `${lastBody}\n${lastMessage}`)) break;
    if (attempt >= ACTIVATION_OUTSTOCK_MAX_RETRIES) break;
    const pauseMs = Math.min(12_000, ACTIVATION_OUTSTOCK_RETRY_DELAY_MS + (attempt - 1) * 250);
    await sleep(pauseMs);
  }

  return {
    ok: false as const,
    taskId: "",
    status: lastStatus,
    body: lastBody,
    tries,
    immediateSuccess: false,
    message: lastMessage,
    providerPayload: null,
  };
}

async function startSxzfdGrokTaskWithRetry(input: {
  cdk: string;
  deviceId: string;
  userCandidates: any[];
  productKey?: string;
}) {
  const apiUrl = resolveSxzfdGrokApiUrl();
  const accountId =
    input.userCandidates.find((candidate) => typeof candidate === "string" && /^[0-9a-f-]{36}$/i.test(String(candidate || "").trim())) ||
    input.userCandidates.find((candidate) => typeof candidate === "string" && String(candidate || "").trim());
  const accountIdRaw = String(accountId || "").trim();
  if (!accountIdRaw) {
    return {
      ok: false as const,
      taskId: "",
      status: 400,
      body: "Grok account ID is empty",
      tries: 0,
      immediateSuccess: false,
      message: "Grok account ID is empty",
      providerPayload: null,
    };
  }

  let lastStatus = 0;
  let lastBody = "";
  let lastMessage = "";
  let tries = 0;

  for (let attempt = 1; attempt <= SXZFD_GROK_MAX_START_ATTEMPTS; attempt += 1) {
    tries += 1;
    try {
      const verify = await sxzfdGrokApiCall(apiUrl, "grok_verify_code", {
        cdk: input.cdk,
      });

      const verifyStatus = String(verify.json?.status || "").trim().toLowerCase();
      const verifyRechargeStatus = String(verify.json?.recharge_status || "").trim().toLowerCase();
      const verifyCanSubmit = verify.json?.can_submit;
      const verifyAlreadyCompleted = verify.success && verifyStatus === "used" && verifyRechargeStatus === "success";
      const verifyPending = verify.pending || verifyRechargeStatus === "pending" || verifyRechargeStatus === "processing";

      if (verifyAlreadyCompleted) {
        const taskId = String(verify.json?.order_id || verify.json?.task_id || "").trim() || makeSxzfdFallbackTaskId();
        return {
          ok: true as const,
          taskId,
          status: verify.status || 200,
          body: verify.raw || "",
          tries,
          immediateSuccess: true,
          message: String(verify.json?.message || "Activation completed"),
          providerPayload: {
            source: "vip.sxzfd.com/grok",
            verify: verify.json || null,
          },
        };
      }

      if (verifyPending) {
        const taskId = String(verify.json?.order_id || verify.json?.task_id || "").trim() || makeSxzfdFallbackTaskId();
        return {
          ok: true as const,
          taskId,
          status: verify.status || 200,
          body: verify.raw || "",
          tries,
          immediateSuccess: false,
          message: String(verify.json?.message || "Activation request is processing"),
          providerPayload: {
            source: "vip.sxzfd.com/grok",
            verify: verify.json || null,
          },
        };
      }

      if (!verify.success || verifyCanSubmit === false) {
        lastStatus = verify.status || 502;
        lastBody = verify.raw || "grok_verify_code failed";
        lastMessage = String(verify.json?.message || "");
      } else {
        const submit = await sxzfdGrokApiCall(apiUrl, "grok_submit_recharge", {
          cdk: input.cdk,
          grok_user_id: accountIdRaw,
        });

        if (submit.success || submit.pending) {
          const taskId = String(submit.json?.order_id || submit.json?.task_id || "").trim() || makeSxzfdFallbackTaskId();
          return {
            ok: true as const,
            taskId,
            status: submit.status || 200,
            body: submit.raw || "",
            tries,
            immediateSuccess: Boolean(submit.success && !submit.pending),
            message: String(submit.json?.message || "Activation request sent"),
            providerPayload: {
              source: "vip.sxzfd.com/grok",
              verify: verify.json || null,
              submit: submit.json || null,
            },
          };
        }

        lastStatus = submit.status || 502;
        lastBody = submit.raw || "grok_submit_recharge failed";
        lastMessage = String(submit.json?.message || "");
      }
    } catch (error) {
      lastStatus = 0;
      lastBody = error instanceof Error ? error.message : String(error || "unknown error");
      lastMessage = "";
    }

    if (!shouldRetryOutstockFailure(lastStatus, `${lastBody}\n${lastMessage}`)) break;
    if (attempt >= SXZFD_GROK_MAX_START_ATTEMPTS) break;
    const pauseMs = Math.min(4_000, ACTIVATION_OUTSTOCK_RETRY_DELAY_MS + (attempt - 1) * 250);
    await sleep(pauseMs);
  }

  return {
    ok: false as const,
    taskId: "",
    status: lastStatus,
    body: lastBody,
    tries,
    immediateSuccess: false,
    message: lastMessage,
    providerPayload: null,
  };
}

async function quickplusApiCall(apiUrl: string, action: string, data: Record<string, string>) {
  const timestamp = Date.now();
  const response = await fetch(`${apiUrl}?action=${encodeURIComponent(action)}&_t=${timestamp}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/plain, */*",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
    body: new URLSearchParams(data).toString(),
  });
  const raw = await response.text().catch(() => "");
  const json = tryParseJson(raw) as any;
  return {
    status: response.status,
    raw,
    json,
    success: Boolean(json?.success),
  };
}

function resolveQuickplusSupportTarget(input: { cdk?: string | null; isClaudeFlow?: boolean; productKey?: string | null }) {
  const lowerProductKey = String(input.productKey || "").toLowerCase();
  const isMax20xClaude = Boolean(input.isClaudeFlow && isQuickplusMax20xClaudeCdk(input.cdk));
  const base = String(
    isMax20xClaude
      ? env.ACTIVATION_CLAUDE_MAX20X_BASE_URL || DEFAULT_CLAUDE_MAX20X_SUPPORT_URL
      : env.ACTIVATION_SUPPORT_BASE_URL || DEFAULT_SUPPORT_URL
  )
    .trim()
    .replace(/\/+$/, "");
  const parsedBase = tryParseUrl(base);
  const origin = parsedBase?.origin || "https://quickplus.vip";
  const productType = isMax20xClaude
    ? "claude_max_20x"
    : input.isClaudeFlow
    ? "claude_pro"
    : lowerProductKey.includes("xpremium") || lowerProductKey.includes("x-premium")
    ? "x_premium"
    : "grok_pro";
  const source = isMax20xClaude ? "quickplus.vip/public/max20x" : "quickplus.vip/public/grok";

  return {
    apiUrl: `${origin}/api.php`,
    productType,
    source,
  };
}

function resolveSxzfdGrokApiUrl() {
  const base = String(env.ACTIVATION_GROK_1M_BASE_URL || DEFAULT_GROK_1M_SUPPORT_URL)
    .trim()
    .replace(/\/+$/, "");
  const parsedBase = tryParseUrl(base);
  const origin = parsedBase?.origin || "https://vip.sxzfd.com";
  return `${origin}/api.php`;
}

function makeSxzfdFallbackTaskId() {
  return `sxzfd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sxzfdGrokApiCall(apiUrl: string, action: string, data: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SXZFD_GROK_API_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      body: JSON.stringify({ action, ...data }),
      signal: controller.signal,
    });
    const raw = await response.text().catch(() => "");
    const json = tryParseJson(raw) as any;
    return {
      status: response.status,
      raw,
      json,
      success: Boolean(json?.success),
      pending: Boolean(json?.pending),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchQuickplusSupportTaskPayload(input: {
  taskId?: string;
  accountId?: string;
  productKey?: string;
  cdk?: string;
}) {
  if (isSxzfdGrokSupportProduct(input.productKey)) {
    return fetchSxzfdGrokTaskPayload({ cdk: input.cdk });
  }

  const lowerProductKey = String(input.productKey || "").toLowerCase();
  const isClaudeFlow = lowerProductKey.includes("claude") || lowerProductKey.endsWith("-sdk5");
  const quickplusTarget = resolveQuickplusSupportTarget({
    cdk: input.cdk,
    isClaudeFlow,
    productKey: input.productKey,
  });
  const url = new URL(quickplusTarget.apiUrl);
  url.searchParams.set("action", "status");
  url.searchParams.set("product_type", quickplusTarget.productType);

  const taskId = String(input.taskId || "").trim();
  const accountId = String(input.accountId || "").trim();
  if (taskId) url.searchParams.set("task_id", taskId);
  if (accountId) url.searchParams.set("claude_user_id", accountId);
  if (!taskId && !accountId) {
    throw new AppError("Support status check input is empty", 400);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" },
  });
  const raw = await response.text().catch(() => "");
  const json = tryParseJson(raw) as any;
  const data = json && typeof json.data === "object" ? json.data : null;
  const statusRaw = String(data?.status || "").trim().toLowerCase();
  const taskRaw = String(data?.task_id || taskId || "").trim();
  const message = String(data?.message || data?.error_message || json?.message || raw || "").trim();

  const pendingStatuses = new Set(["pending", "processing", "running", "queued", "in_progress", "created"]);
  const successStatuses = new Set(["success", "succeeded", "done", "completed", "finish", "finished", "active"]);
  const failedStatuses = new Set(["failed", "error", "deleted", "rejected", "expired", "canceled", "cancelled"]);

  const pending = pendingStatuses.has(statusRaw);
  const success = successStatuses.has(statusRaw);
  const failed = failedStatuses.has(statusRaw);
  const normalizedStatus = failed ? "failed" : statusRaw;

  return {
    pending,
    success,
    status: normalizedStatus,
    message,
    task_id: taskRaw,
    error: failed ? message || "Support task failed" : "",
    raw: {
      httpStatus: response.status,
      payload: json || null,
      provider: quickplusTarget.source,
      productType: quickplusTarget.productType,
    },
  };
}

async function fetchSxzfdGrokTaskPayload(input: { cdk?: string }) {
  const cdk = String(input.cdk || "").trim();
  if (!cdk) {
    throw new AppError("Support status check input is empty", 400);
  }

  const query = await sxzfdGrokApiCall(resolveSxzfdGrokApiUrl(), "query_code", {
    cdk,
    silent_log: 1,
  });
  const json = query.json as any;
  const localStatus = String(json?.status || "").trim().toLowerCase();
  const rechargeStatus = String(json?.recharge_status || "").trim().toLowerCase();
  const message = String(json?.message || query.raw || "").trim();
  const success =
    Boolean(json?.success) &&
    (rechargeStatus === "success" || rechargeStatus === "completed" || (localStatus === "used" && rechargeStatus === "success"));
  const pending =
    Boolean(json?.success) &&
    !success &&
    (query.pending ||
      localStatus === "locked" ||
      localStatus === "pending" ||
      localStatus === "processing" ||
      rechargeStatus === "pending" ||
      rechargeStatus === "processing" ||
      rechargeStatus === "running");
  const failed =
    (!success && !pending && Boolean(json) && !json?.success) ||
    ["failed", "fail", "error", "rejected", "expired", "canceled", "cancelled"].includes(rechargeStatus);
  const normalizedStatus = success ? "success" : pending ? "processing" : failed ? "failed" : rechargeStatus || localStatus;
  const taskId = String(json?.order_id || json?.task_id || "").trim();

  return {
    pending,
    success,
    status: normalizedStatus,
    message,
    task_id: taskId,
    error: failed ? message || "Support task failed" : "",
    raw: {
      httpStatus: query.status,
      payload: json || null,
      provider: "vip.sxzfd.com/grok",
    },
  };
}

function shouldRetryOutstockFailure(status: number, body: string) {
  const normalized = String(body || "").toLowerCase();
  if (status >= 500 || status === 429 || status === 408) return true;
  if (status === 400 || status === 404 || status === 409) {
    return (
      normalized.includes("stock not found") ||
      normalized.includes("out of stock") ||
      normalized.includes("record not found") ||
      normalized.includes("cdk not found") ||
      normalized.includes("get cdk failed") ||
      normalized.includes("temporary") ||
      normalized.includes("try again")
    );
  }
  return false;
}

async function startChongzhiTaskWithRetry(
  input: { cdk: string; deviceId: string; userCandidates: any[] },
  options?: { baseUrl?: string; sourceLabel?: string }
) {
  const base = String(options?.baseUrl || env.ACTIVATION_CHONGZHI_BASE_URL || "https://chongzhi.pro")
    .trim()
    .replace(/\/+$/, "");
  const pageUrl = buildActivationSiteEndpointUrl(base, "");
  const parsedBase = tryParseUrl(pageUrl);
  const origin = parsedBase?.origin || base;
  const refererBase = pageUrl || `${base}/`;
  const tokenCandidate =
    input.userCandidates.find((candidate) => typeof candidate === "string" && String(candidate || "").trim().startsWith("{")) ||
    input.userCandidates.find((candidate) => typeof candidate === "string" && String(candidate || "").trim());
  const tokenRaw = String(tokenCandidate || "").trim();
  if (!tokenRaw) {
    return {
      ok: false as const,
      taskId: "",
      status: 400,
      body: "Token payload is empty",
      tries: 0,
      immediateSuccess: false,
      message: "Token payload is empty",
      providerPayload: null,
    };
  }

  let lastStatus = 0;
  let lastBody = "";
  let lastMessage = "";
  let tries = 0;

  for (let attempt = 1; attempt <= ACTIVATION_OUTSTOCK_MAX_RETRIES; attempt += 1) {
    tries += 1;
    try {
      const homeResponse = await fetch(pageUrl || `${base}/`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      const setCookieHeader = homeResponse.headers.get("set-cookie") || "";
      const sessionMatch = setCookieHeader.match(/ios_gpt_session=([^;]+)/i);
      const session = String(sessionMatch?.[1] || "").trim();
      if (!session) {
        lastStatus = homeResponse.status || 502;
        lastBody = "ios_gpt_session not found";
      } else {
        const commonHeaders = {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Origin: origin,
          Referer: refererBase,
          Cookie: `ios_gpt_session=${session}`,
        } as Record<string, string>;

        const verifyResponse = await fetch(buildActivationSiteEndpointUrl(base, "api-verify.php") || `${base}/api-verify.php`, {
          method: "POST",
          headers: commonHeaders,
          body: JSON.stringify({ activation_code: input.cdk }),
        });
        const verifyRaw = await verifyResponse.text().catch(() => "");
        const verifyJson = tryParseJson(verifyRaw);
        const verifyOk = Boolean(verifyJson?.success);
        const codeStatus = String(verifyJson?.data?.code_status || "").trim().toLowerCase();

        if (!verifyResponse.ok || !verifyOk) {
          lastStatus = verifyResponse.status || 502;
          lastBody = verifyRaw || "verify failed";
        } else {
          let actionResponse: Response | null = null;
          let actionRaw = "";
          let actionJson: any = null;

          if (codeStatus === "used") {
            actionResponse = await fetch(buildActivationSiteEndpointUrl(base, "api-recharge-reuse.php") || `${base}/api-recharge-reuse.php`, {
              method: "POST",
              headers: commonHeaders,
              body: JSON.stringify({
                action: "update_token_and_recharge",
                card_code: input.cdk,
                json_data: tokenRaw,
              }),
            });
            actionRaw = await actionResponse.text().catch(() => "");
            actionJson = tryParseJson(actionRaw);
          } else {
            // Try iOS endpoint first, then Android endpoint.
            const endpoints = ["/simple-submit-recharge.php", "/simple-submit-rechargezero.php"];
            for (const endpoint of endpoints) {
              const resp = await fetch(buildActivationSiteEndpointUrl(base, endpoint) || `${base}${endpoint}`, {
                method: "POST",
                headers: commonHeaders,
                body: JSON.stringify({ user_data: tokenRaw }),
              });
              const raw = await resp.text().catch(() => "");
              const json = tryParseJson(raw);
              if (resp.ok && Boolean(json?.success)) {
                actionResponse = resp;
                actionRaw = raw;
                actionJson = json;
                break;
              }
              actionResponse = resp;
              actionRaw = raw;
              actionJson = json;
            }
          }

          if (actionResponse?.ok && Boolean(actionJson?.success)) {
            const taskId = `chongzhi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return {
              ok: true as const,
              taskId,
              status: actionResponse.status,
              body: actionRaw,
              tries,
              immediateSuccess: true,
              message: String(actionJson?.message || "Activation completed"),
              providerPayload: {
                source: String(options?.sourceLabel || pageUrl || "chongzhi.pro"),
                verify: verifyJson,
                recharge: actionJson,
              },
            };
          }

          lastStatus = actionResponse?.status || 502;
          lastBody = actionRaw || "recharge failed";
          lastMessage = String(actionJson?.message || actionJson?.error || "");

          try {
            const checked = await verifyChongzhiCodeStatus(base, input.cdk, commonHeaders);
            if (isChongzhiCodeUsed(checked)) {
              const taskId = `chongzhi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              return {
                ok: true as const,
                taskId,
                status: actionResponse?.status || 200,
                body: actionRaw,
                tries,
                immediateSuccess: true,
                message: String(actionJson?.message || "Activation completed. Code is marked as used by provider."),
                providerPayload: {
                  source: String(options?.sourceLabel || pageUrl || "chongzhi.pro"),
                  verify: verifyJson,
                  recharge: actionJson,
                  postCheck: checked.json,
                },
              };
            }
          } catch {
            // Keep the original provider failure; status checks can retry code verification later.
          }
        }
      }
    } catch (error) {
      lastStatus = 0;
      lastBody = error instanceof Error ? error.message : String(error || "unknown error");
    }

    if (!shouldRetryOutstockFailure(lastStatus, `${lastBody}\n${lastMessage}`)) break;
    if (attempt >= ACTIVATION_OUTSTOCK_MAX_RETRIES) break;
    const pauseMs = Math.min(12_000, ACTIVATION_OUTSTOCK_RETRY_DELAY_MS + (attempt - 1) * 250);
    await sleep(pauseMs);
  }

  return {
    ok: false as const,
    taskId: "",
    status: lastStatus,
    body: lastBody,
    tries,
    immediateSuccess: false,
    message: lastMessage,
    providerPayload: null,
  };
}

function tryParseUrl(raw: string) {
  try {
    return new URL(String(raw || "").trim());
  } catch {
    return null;
  }
}

function tryParseJson(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function fetchChongzhiCodeStatus(cdk: string, activationSiteUrl?: string | null) {
  const base = String(activationSiteUrl || env.ACTIVATION_CHONGZHI_BASE_URL || "https://chongzhi.pro")
    .trim()
    .replace(/\/+$/, "");
  const pageUrl = buildActivationSiteEndpointUrl(base, "");
  const parsedBase = tryParseUrl(pageUrl);
  const origin = parsedBase?.origin || base;
  const refererBase = pageUrl || `${base}/`;

  const homeResponse = await fetch(pageUrl || `${base}/`, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const setCookieHeader = homeResponse.headers.get("set-cookie") || "";
  const sessionMatch = setCookieHeader.match(/ios_gpt_session=([^;]+)/i);
  const session = String(sessionMatch?.[1] || "").trim();
  if (!session) {
    throw new AppError("Chongzhi status session not found", 502, { providerStatus: homeResponse.status || 0 });
  }

  return verifyChongzhiCodeStatus(base, cdk, {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: origin,
    Referer: refererBase,
    Cookie: `ios_gpt_session=${session}`,
  });
}

async function verifyChongzhiCodeStatus(base: string, cdk: string, headers: Record<string, string>) {
  const response = await fetch(buildActivationSiteEndpointUrl(base, "api-verify.php") || `${base}/api-verify.php`, {
    method: "POST",
    headers,
    body: JSON.stringify({ activation_code: cdk }),
  });
  const raw = await response.text().catch(() => "");
  const json = tryParseJson(raw);
  if (!response.ok || !json) {
    throw new AppError("Chongzhi status check failed", 502, {
      providerStatus: response.status || 0,
      providerBody: String(raw || "").slice(0, 2000),
    });
  }

  return {
    status: response.status,
    raw,
    json,
  };
}

function isChongzhiCodeUsed(payload: { json?: any } | null | undefined) {
  const codeStatus = String(payload?.json?.data?.code_status || payload?.json?.code_status || "").trim().toLowerCase();
  return codeStatus === "used";
}

function updateActivationFromChongzhiCodePayload(orderId: string, payload: { status?: number; json?: any; raw?: string }) {
  const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
  if (!stored) return;

  const nowIso = new Date().toISOString();
  const used = isChongzhiCodeUsed(payload);
  const codeStatus = String(payload?.json?.data?.code_status || payload?.json?.code_status || "").trim();
  const hasTask = Boolean(String(stored.taskId || "").trim());
  const nextStatus: ActivationRecord["status"] = used ? "success" : stored.status;
  const nextVerificationState: NonNullable<ActivationRecord["verificationState"]> = used
    ? "success"
    : hasTask
    ? "pending"
    : "unknown";
  const providerMessage = used
    ? "Provider check: Chongzhi activation code is marked as used"
    : hasTask
    ? `Provider check: Chongzhi activation code is not used yet${codeStatus ? ` (${codeStatus})` : ""}`
    : `Provider check: Chongzhi activation code is not used yet${codeStatus ? ` (${codeStatus})` : ""}. Activation has not been started (task is missing)`;

  activationStore.upsert({
    ...stored,
    status: nextStatus,
    verificationState: nextVerificationState,
    lastProviderMessage: providerMessage,
    lastProviderCheckedAt: nowIso,
    lastProviderPayload: {
      source: "chongzhi/api-verify",
      providerStatus: Number(payload?.status || 0),
      code_status: codeStatus || null,
      success: Boolean(payload?.json?.success),
      data: payload?.json?.data || null,
    },
    updatedAt: nowIso,
  });
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

function validateSupportSessionJwtToken(token: string) {
  const value = String(token || "").trim();
  const reasons: string[] = [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!value) {
    reasons.push("Account ID is required");
    return { reasons };
  }

  if (!uuidRegex.test(value)) {
    reasons.push("Account ID must be UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)");
  }

  return { reasons };
}

function shouldRotateCdkAfterStartFailure(result: { status?: number; body?: string; message?: string }) {
  const status = Number(result?.status || 0);
  const normalized = `${String(result?.body || "")}\n${String(result?.message || "")}`.toLowerCase();
  if (status === 0) return false;
  return (
    normalized.includes("already been used") ||
    normalized.includes("code has already been used") ||
    normalized.includes("this cdk has already been used") ||
    normalized.includes("already used") ||
    normalized.includes("已使用") ||
    normalized.includes("不能再次提交") ||
    normalized.includes("validation failed") ||
    normalized.includes("invalid cdk") ||
    normalized.includes("cdk invalid")
  );
}

function tryDecodeJwtPayloadObject(token: string): Record<string, unknown> | null {
  const t = String(token || "").trim();
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1] || "";
  if (!payload) return null;

  try {
    const json = Buffer.from(base64UrlToBase64(payload), "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tryDecodeJwtPayload(token: string): { exp?: number; iat?: number } | null {
  const parsed = tryDecodeJwtPayloadObject(token) as any;
  if (!parsed) return null;
  const exp = typeof parsed?.exp === "number" ? parsed.exp : undefined;
  const iat = typeof parsed?.iat === "number" ? parsed.iat : undefined;
  if (!exp && !iat) return null;
  return { exp, iat };
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
  status?: string;
  state?: string;
  error?: string;
  progress?: number;
  task_id?: string;
  cdk?: string;
}) {
  const stored = normalizeActivationRecordForRead(activationStore.findByOrderId(orderId));
  if (!stored) return;
  const nowIso = new Date().toISOString();
  const inferred = inferProviderTaskState(payload);
  let nextStatus: ActivationRecord["status"] = stored.status;
  let verificationState: NonNullable<ActivationRecord["verificationState"]> = stored.verificationState || "unknown";

  if (inferred.success) {
    nextStatus = "success";
    verificationState = "success";
  } else if (inferred.pending) {
    nextStatus = "processing";
    verificationState = "pending";
  } else if (inferred.failed) {
    nextStatus = "failed";
    verificationState = "failed";
  } else if (String(payload.task_id || taskId).trim() && stored.status === "issued") {
    // Unknown provider payload but task exists: keep flow in-progress, don't downgrade to failed.
    nextStatus = "processing";
    verificationState = verificationState === "unknown" ? "pending" : verificationState;
  }

  const nextMessage = String(inferred.message || payload.message || payload.error || stored.lastProviderMessage || "");
  activationStore.upsert({
    ...stored,
    status: nextStatus,
    verificationState,
    taskId: String(payload.task_id || taskId),
    lastProviderMessage: nextMessage,
    lastProviderCheckedAt: nowIso,
    lastProviderPayload: {
      pending: Boolean(inferred.pending),
      success: Boolean(inferred.success),
      failed: Boolean(inferred.failed),
      status: String(inferred.status || ""),
      message: nextMessage,
      task_id: String(payload.task_id || taskId),
      raw: payload,
    },
    updatedAt: nowIso,
  });
}

function inferProviderTaskState(payload: {
  pending?: boolean;
  success?: boolean;
  message?: string;
  status?: string;
  state?: string;
  error?: string;
}) {
  const toBool = (value: unknown): boolean | null => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "ok", "success"].includes(normalized)) return true;
      if (["false", "0", "no", "fail", "failed", "error"].includes(normalized)) return false;
    }
    return null;
  };

  const status = String(payload.status || payload.state || "").trim().toLowerCase();
  const pendingStatuses = new Set(["created", "prepared", "pending", "processing", "running", "queued", "in_progress"]);
  const successStatuses = new Set(["success", "succeeded", "done", "completed", "finish", "finished"]);
  const failedStatuses = new Set(["failed", "error", "cancel", "canceled", "cancelled", "rejected", "expired"]);

  const pendingFlag = toBool(payload.pending);
  const successFlag = toBool(payload.success);
  const messageText = String(payload.message || payload.error || "").trim();
  const messageLower = messageText.toLowerCase();
  const hasError = Boolean(String(payload.error || "").trim());
  const failedByMessage =
    messageLower.includes("already been used") ||
    messageLower.includes("already used") ||
    messageLower.includes("validation failed") ||
    messageLower.includes("redeem failed") ||
    messageLower.includes("stock not found") ||
    messageLower.includes("record not found") ||
    messageLower.includes("cdk not found") ||
    messageLower.includes("get cdk failed");

  const pending = pendingFlag === true || (!status ? false : pendingStatuses.has(status));
  const success = successFlag === true || (!status ? false : successStatuses.has(status)) || (status === "finish" && !hasError);
  const failed =
    (!success && !pending && (successFlag === false && hasError)) ||
    (!success && !pending && failedStatuses.has(status)) ||
    (!success && !pending && status === "finish" && hasError) ||
    (!success && !pending && failedByMessage);

  return {
    pending,
    success,
    failed,
    status,
    message: messageText,
  };
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
      label: "Р—Р°РєР°Р· РЅРµ РѕРїР»Р°С‡РµРЅ",
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
