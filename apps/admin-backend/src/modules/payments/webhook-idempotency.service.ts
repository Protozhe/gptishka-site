import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/app-error";

const DEFAULT_STALE_WEBHOOK_AFTER_MS = 10 * 60 * 1000;

type PaymentWebhookRecord = {
  data?: unknown;
  [key: string]: unknown;
};

type WebhookProcessResult = {
  orderId?: unknown;
  [key: string]: unknown;
};

export type PaymentWebhookIdentity = {
  provider: string;
  eventKey: string;
  orderId?: string;
  paymentId?: string;
  status: string;
  payloadHash: string;
};

type PaymentWebhookEventClient = {
  paymentWebhookEvent: {
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    deleteMany(args: any): Promise<any>;
    delete(args: any): Promise<any>;
  };
};

export type RunPaymentWebhookOnceOptions = {
  client?: PaymentWebhookEventClient;
  now?: () => Date;
  staleAfterMs?: number;
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildPaymentWebhookIdentity(providerRaw: unknown, payload: unknown): PaymentWebhookIdentity {
  const provider = normalizeProvider(providerRaw);
  const root = isRecord(payload) ? payload : {};
  const nested = isRecord(root.data) ? root.data : {};

  const explicitEventId = firstString(
    root.event_id,
    root.eventId,
    root.webhook_id,
    root.webhookId,
    nested.event_id,
    nested.eventId,
    nested.webhook_id,
    nested.webhookId
  );
  const orderId = firstString(root.orderId, root.order_id, nested.orderId, nested.order_id);
  const paymentId = firstString(
    root.paymentId,
    root.payment_id,
    root.invoiceId,
    root.invoice_id,
    root.id,
    nested.paymentId,
    nested.payment_id,
    nested.invoiceId,
    nested.invoice_id,
    nested.id
  );
  const status = (firstString(root.status, root.event, nested.status, nested.event) || "unknown").toLowerCase();
  const payloadHash = sha256(stableStringify(payload));
  const eventKey = explicitEventId
    ? `event:${explicitEventId}`
    : `fallback:${sha256([provider, paymentId, orderId, status, payloadHash].join("|"))}`;

  return {
    provider,
    eventKey,
    orderId: orderId || undefined,
    paymentId: paymentId || undefined,
    status,
    payloadHash,
  };
}

export async function runPaymentWebhookOnce<T extends WebhookProcessResult>(
  providerRaw: unknown,
  payload: unknown,
  processWebhook: () => Promise<T>,
  options: RunPaymentWebhookOnceOptions = {}
): Promise<T | { ok: true; duplicate: true; orderId?: string }> {
  const identity = buildPaymentWebhookIdentity(providerRaw, payload);
  const client = options.client || prisma;
  const now = options.now || (() => new Date());
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_WEBHOOK_AFTER_MS;

  let event: { id: string };
  try {
    event = await createPaymentWebhookEvent(client, identity);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await client.paymentWebhookEvent.update({
        where: uniqueWebhookEventWhere(identity),
        data: { duplicateCount: { increment: 1 } },
        select: { orderId: true, processedAt: true, createdAt: true },
      });

      if (existing.processedAt) {
        return { ok: true, duplicate: true, orderId: existing.orderId || undefined };
      }

      const createdAtMs = new Date(existing.createdAt).getTime();
      if (!Number.isFinite(createdAtMs) || now().getTime() - createdAtMs < staleAfterMs) {
        throw new AppError("Payment webhook is already being processed", 409);
      }

      const staleCutoff = new Date(now().getTime() - staleAfterMs);
      const cleanup = await client.paymentWebhookEvent.deleteMany({
        where: {
          provider: identity.provider,
          eventKey: identity.eventKey,
          processedAt: null,
          createdAt: { lte: staleCutoff },
        },
      });
      if (cleanup.count !== 1) {
        throw new AppError("Payment webhook is already being processed", 409);
      }

      try {
        event = await createPaymentWebhookEvent(client, identity);
      } catch (retryError) {
        if (isUniqueConstraintError(retryError)) {
          throw new AppError("Payment webhook is already being processed", 409);
        }
        throw retryError;
      }
    } else {
      throw error;
    }
  }

  try {
    const result = await processWebhook();
    const resultOrderId = firstString(result?.orderId);
    await client.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        orderId: resultOrderId || identity.orderId,
        paymentId: identity.paymentId,
        status: identity.status,
        processedAt: new Date(),
      },
    });
    return result;
  } catch (error) {
    await client.paymentWebhookEvent.delete({ where: { id: event.id } }).catch(deleteError => {
      console.error("[payment-webhook] failed to delete idempotency row after processing error", deleteError);
    });
    throw error;
  }
}

function createPaymentWebhookEvent(client: PaymentWebhookEventClient, identity: PaymentWebhookIdentity) {
  return client.paymentWebhookEvent.create({
    data: {
      provider: identity.provider,
      eventKey: identity.eventKey,
      orderId: identity.orderId,
      paymentId: identity.paymentId,
      status: identity.status,
      payloadHash: identity.payloadHash,
    },
    select: { id: true },
  });
}

function uniqueWebhookEventWhere(identity: PaymentWebhookIdentity) {
  return {
    provider_eventKey: {
      provider: identity.provider,
      eventKey: identity.eventKey,
    },
  };
}

function normalizeProvider(providerRaw: unknown): string {
  return String(providerRaw || "gateway").trim().toLowerCase() || "gateway";
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRecord(value: unknown): value is PaymentWebhookRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
