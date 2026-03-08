import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { storefrontTickerStore } from "./storefront-ticker.store";

const PUBLIC_TICKER_LIMIT = 12;
const ADMIN_PREVIEW_LIMIT = 150;

export function maskStorefrontEmail(email: string) {
  const safe = storefrontTickerStore.normalizeEmail(email);
  const atIndex = safe.indexOf("@");
  if (atIndex < 1) return "***@*****";

  const localRaw = safe.slice(0, atIndex).replace(/[^a-z0-9._+-]/gi, "");
  const local = localRaw || "user";
  const domainRaw = safe.slice(atIndex + 1);
  const domainParts = domainRaw.split(".").filter(Boolean);
  const topLevel = domainParts.length > 1 ? domainParts[domainParts.length - 1] : "";

  const visiblePrefix = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  const tailChar = local.slice(-1);
  const localMask = `${visiblePrefix}${"*".repeat(local.length > 5 ? 3 : 2)}${tailChar}`;
  const providerMaskLength = Math.max(5, Math.min(10, (domainParts[0] || "").length || 5));
  const providerMask = "*".repeat(providerMaskLength);

  return topLevel ? `${localMask}@${providerMask}.${topLevel}` : `${localMask}@${providerMask}`;
}

function buildPaidOrderWhereFilter() {
  const settings = storefrontTickerStore.get();
  const where: Prisma.OrderWhereInput = { status: "PAID" };
  const notClauses: Prisma.OrderWhereInput[] = [];

  if (settings.hiddenEmails.length) {
    notClauses.push({ email: { in: settings.hiddenEmails } });
  }
  if (settings.hiddenOrderIds.length) {
    notClauses.push({ id: { in: settings.hiddenOrderIds } });
  }
  if (notClauses.length) {
    where.NOT = notClauses;
  }

  return { where, settings };
}

export const storefrontTickerService = {
  async getPublicStats() {
    const { where } = buildPaidOrderWhereFilter();
    const [sales, recentOrders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PUBLIC_TICKER_LIMIT,
      }),
    ]);

    const tickerEntries = recentOrders.map((order) => ({
      orderId: order.id,
      email: maskStorefrontEmail(order.email),
      source: "real" as const,
      createdAt: order.createdAt.toISOString(),
    }));

    return {
      sales,
      tickerEntries,
      lastBuyers: tickerEntries.map((entry) => entry.email),
    };
  },

  async getAdminSettingsView() {
    const settings = storefrontTickerStore.get();
    const hiddenEmails = new Set(settings.hiddenEmails);
    const hiddenOrderIds = new Set(settings.hiddenOrderIds);

    const recentOrders = await prisma.order.findMany({
      where: { status: "PAID" },
      select: { id: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: ADMIN_PREVIEW_LIMIT,
    });

    const rows = recentOrders.map((order) => {
      const normalizedEmail = storefrontTickerStore.normalizeEmail(order.email);
      const hiddenByEmail = hiddenEmails.has(normalizedEmail);
      const hiddenByOrderId = hiddenOrderIds.has(order.id);
      return {
        orderId: order.id,
        email: order.email,
        emailMasked: maskStorefrontEmail(order.email),
        createdAt: order.createdAt.toISOString(),
        hiddenByEmail,
        hiddenByOrderId,
        hidden: hiddenByEmail || hiddenByOrderId,
      };
    });

    const visiblePreview = rows
      .filter((row) => !row.hidden)
      .slice(0, PUBLIC_TICKER_LIMIT)
      .map((row) => ({
        orderId: row.orderId,
        emailMasked: row.emailMasked,
        createdAt: row.createdAt,
      }));

    return {
      settings,
      rows,
      visiblePreview,
    };
  },

  async updateSettings(input: { hiddenEmails?: string[]; hiddenOrderIds?: string[] }) {
    return storefrontTickerStore.update(input);
  },
};
