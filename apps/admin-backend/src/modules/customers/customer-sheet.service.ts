import { OrderStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { activationStore } from "../orders/activation.store";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function formatPurchaseDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function inferTerm(details: JsonRecord | null, productTitle: string) {
  const selection = asRecord(details?.selection);
  const explicit = firstText(selection?.duration, selection?.period, selection?.plan, details?.term);
  if (explicit) return explicit;

  const titleMatch = productTitle.match(/(?:на\s+)?(\d+)\s*(месяц(?:а|ев)?|мес\.?|дн(?:я|ей)?|год(?:а|лет)?|кредит(?:а|ов)?)/i);
  return titleMatch ? `${titleMatch[1]} ${titleMatch[2]}` : "";
}

export async function syncWebsiteCustomerToSheet(orderId: string) {
  if (!env.CUSTOMER_SHEET_SYNC_URL || !env.CUSTOMER_SHEET_SYNC_TOKEN) {
    return { ok: false, skipped: true, reason: "not_configured" } as const;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: { product: { select: { title: true, slug: true } } },
      },
    },
  });

  if (!order) return { ok: false, skipped: true, reason: "order_not_found" } as const;
  if (order.status !== OrderStatus.PAID) return { ok: false, skipped: true, reason: "order_not_paid" } as const;
  if (String(order.source || "").trim().toLowerCase() !== "site") {
    return { ok: false, skipped: true, reason: "not_site_order" } as const;
  }

  const details = asRecord(order.orderDetails);
  const contact = asRecord(details?.contact);
  const firstItem = order.items[0];
  const productTitle = firstText(
    asRecord(details?.product)?.title,
    firstItem?.product?.title,
    firstItem?.productRaw
  );
  const activation = activationStore.findByOrderId(order.id);
  const payload = JSON.stringify({
    token: env.CUSTOMER_SHEET_SYNC_TOKEN,
    platform: "site",
    order_id: order.id,
    email: firstText(order.email, contact?.email),
    key: firstText(activation?.cdk),
    buyer_username: firstText(contact?.telegram, order.telegramUsername),
    date: formatPurchaseDate(order.updatedAt || order.createdAt),
    term: inferTerm(details, productTitle),
    product: productTitle,
  });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(env.CUSTOMER_SHEET_SYNC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        signal: controller.signal,
      });
      const raw = await response.text();
      let result: { ok?: boolean; error?: string } = {};
      try {
        result = JSON.parse(raw) as { ok?: boolean; error?: string };
      } catch {
        throw new Error(`Customer sheet returned HTTP ${response.status}`);
      }
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || `Customer sheet returned HTTP ${response.status}`);
      }
      console.info(`[customer-sheet] synced order=${order.id} attempt=${attempt}`);
      return { ok: true } as const;
    } catch (error) {
      lastError = error;
      if (attempt === 1) console.warn(`[customer-sheet] retry order=${order.id}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Customer sheet sync failed");
}
