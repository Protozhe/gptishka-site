import { Prisma, Product, VpnAccess } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppError } from "../common/errors/app-error";
import { resolveProductDeliveryType } from "../common/utils/product-delivery";
import { env } from "../config/env";
import { prisma } from "../config/prisma";

export type VpnSource = "vpn" | "bundle";

export type VpnProvisionPayload = {
  plan: string;
  durationDays: number;
  limitIp: number;
  source: VpnSource;
};

type CreateVpnUserInput = {
  orderId?: string | null;
  email?: string | null;
  telegramId?: string | null;
  plan: string;
  durationDays: number;
  limitIp?: number;
  source: VpnSource;
  serverId?: string | null;
};

const DIRECT_VPN_PLANS: Record<string, number> = {
  vpn_month: 30,
  vpn_halfyear: 180,
  vpn_year: 365,
};

const DEFAULT_VPN_DURATION_DAYS = 30;
const DEFAULT_VPN_LIMIT_IP = 1;
const XUI_COOKIE_TTL_MS = 10 * 60 * 1000;

const VPN_CATALOG_DEFAULTS = [
  {
    slug: "vpn_month",
    title: "VPN 1 месяц",
    titleEn: "VPN 1 month",
    description: "Срок: 30 дней",
    descriptionEn: "Duration: 30 days",
    modalDescription: "VLESS Reality. Подключение за 1 минуту.",
    modalDescriptionEn: "VLESS Reality. Connection in 1 minute.",
    price: 199,
    tags: ["vpn", "delivery:vpn", "vpn:days:30", "badge:new"],
  },
  {
    slug: "vpn_halfyear",
    title: "VPN 6 месяцев",
    titleEn: "VPN 6 months",
    description: "Срок: 180 дней",
    descriptionEn: "Duration: 180 days",
    modalDescription: "VLESS Reality. Подключение за 1 минуту.",
    modalDescriptionEn: "VLESS Reality. Connection in 1 minute.",
    price: 999,
    tags: ["vpn", "delivery:vpn", "vpn:days:180", "badge:popular"],
  },
  {
    slug: "vpn_year",
    title: "VPN 12 месяцев",
    titleEn: "VPN 12 months",
    description: "Срок: 365 дней",
    descriptionEn: "Duration: 365 days",
    modalDescription: "VLESS Reality. Подключение за 1 минуту.",
    modalDescriptionEn: "VLESS Reality. Connection in 1 minute.",
    price: 1699,
    tags: ["vpn", "delivery:vpn", "vpn:days:365", "badge:best"],
  },
] as const;

let xuiCookie = "";
let xuiCookieIssuedAt = 0;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizeEmail(value: string | null | undefined) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  return email || null;
}

function normalizeTelegramId(value: string | number | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizePlan(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeServerId(value: string | null | undefined) {
  const normalized = String(value || env.VPN_SERVER_ID || "eu-1")
    .trim()
    .toLowerCase();
  return normalized || "eu-1";
}

function toPositiveDays(value: unknown, fallback = DEFAULT_VPN_DURATION_DAYS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function toLimitIp(value: unknown, fallback = DEFAULT_VPN_LIMIT_IP) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(16, Math.floor(parsed)));
}

function addDays(input: Date, days: number) {
  return new Date(input.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
}

function parseDaysTag(tags: string[] | null | undefined) {
  const list = Array.isArray(tags) ? tags : [];
  const daysTag = list
    .map((tag) => String(tag || "").trim().toLowerCase())
    .find(
      (tag) =>
        tag.startsWith("vpn:days:") ||
        tag.startsWith("vpn_days:") ||
        tag.startsWith("vpn-days:") ||
        tag.startsWith("days:")
    );
  if (!daysTag) return null;
  const value = Number(daysTag.split(":").pop() || "");
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parsePlanTag(tags: string[] | null | undefined) {
  const list = Array.isArray(tags) ? tags : [];
  const planTag = list
    .map((tag) => String(tag || "").trim().toLowerCase())
    .find((tag) => tag.startsWith("vpn:plan:") || tag.startsWith("vpn_plan:") || tag.startsWith("vpn-plan:"));
  if (!planTag) return "";
  const raw = planTag.split(":").pop() || "";
  return normalizePlan(raw);
}

function parseLimitIpTag(tags: string[] | null | undefined) {
  const list = Array.isArray(tags) ? tags : [];
  const limitTag = list
    .map((tag) => String(tag || "").trim().toLowerCase())
    .find(
      (tag) =>
        tag.startsWith("vpn:users:") ||
        tag.startsWith("vpn_users:") ||
        tag.startsWith("vpn-users:") ||
        tag.startsWith("vpn:limit_ip:") ||
        tag.startsWith("vpn:limit-ip:") ||
        tag.startsWith("users:")
    );
  if (!limitTag) return null;
  const value = Number(limitTag.split(":").pop() || "");
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function hasBundleVpnTag(tags: string[] | null | undefined) {
  const list = Array.isArray(tags) ? tags : [];
  return list
    .map((tag) => String(tag || "").trim().toLowerCase())
    .some((tag) => tag === "bundle:vpn" || tag === "vpn:bundle" || tag === "with:vpn" || tag === "with_vpn");
}

function is3xUiConfigured() {
  return Boolean(
    String(env.VPN_3XUI_BASE_URL || "").trim() &&
      String(env.VPN_3XUI_USERNAME || "").trim() &&
      String(env.VPN_3XUI_PASSWORD || "").trim() &&
      Number(env.VPN_3XUI_INBOUND_ID || 0) > 0
  );
}

function resolve3xUiBaseUrl() {
  return String(env.VPN_3XUI_BASE_URL || "").trim().replace(/\/+$/, "");
}

function extractSetCookies(response: Response) {
  const withGetSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie().filter(Boolean);
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

async function ensure3xUiCookie(forceRefresh = false) {
  if (!is3xUiConfigured()) return "";
  if (!forceRefresh && xuiCookie && Date.now() - xuiCookieIssuedAt < XUI_COOKIE_TTL_MS) {
    return xuiCookie;
  }

  const baseUrl = resolve3xUiBaseUrl();
  const body = new URLSearchParams({
    username: String(env.VPN_3XUI_USERNAME || "").trim(),
    password: String(env.VPN_3XUI_PASSWORD || "").trim(),
  });

  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new AppError("VPN panel login failed", 502, { upstreamStatus: response.status });
  }

  const cookie = extractSetCookies(response)
    .map((line) => String(line || "").split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");

  if (!cookie) {
    throw new AppError("VPN panel login did not return session cookie", 502);
  }

  xuiCookie = cookie;
  xuiCookieIssuedAt = Date.now();
  return xuiCookie;
}

async function call3xUi(path: string, payload: unknown, canRetry = true): Promise<any> {
  if (!is3xUiConfigured()) return null;

  const cookie = await ensure3xUiCookie(false);
  const response = await fetch(`${resolve3xUiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(payload || {}),
  });

  if (response.status === 401 && canRetry) {
    await ensure3xUiCookie(true);
    return call3xUi(path, payload, false);
  }

  const text = await response.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new AppError("VPN panel request failed", 502, {
      upstreamStatus: response.status,
      upstreamBody: String(text || "").slice(0, 2000),
    });
  }

  if (json && typeof json === "object" && json.success === false) {
    throw new AppError("VPN panel returned unsuccessful response", 502, {
      upstreamBody: String(json.msg || json.message || "unknown error").slice(0, 1000),
    });
  }

  return json;
}

function deriveClientEmail(email: string | null, telegramId: string | null, plan: string, uuid: string) {
  if (email) return email;
  if (telegramId) return `tg_${telegramId}@vpn.local`;
  const shortUuid = String(uuid || "").replace(/-/g, "").slice(0, 12);
  return `${plan || "vpn"}_${shortUuid}@vpn.local`;
}

function build3xUiClientPayload(input: {
  uuid: string;
  clientEmail: string;
  telegramId: string | null;
  expiresAt: Date;
  enabled: boolean;
  limitIp: number;
}) {
  const totalGb = Math.max(0, Number(env.VPN_3XUI_CLIENT_TOTAL_GB || 0));
  const totalBytes = totalGb > 0 ? Math.floor(totalGb * 1024 * 1024 * 1024) : 0;

  return {
    id: input.uuid,
    alterId: 0,
    email: input.clientEmail,
    limitIp: toLimitIp(input.limitIp, DEFAULT_VPN_LIMIT_IP),
    totalGB: totalBytes,
    expiryTime: input.expiresAt.getTime(),
    enable: input.enabled,
    tgId: input.telegramId || "",
    subId: String(input.uuid || "").replace(/-/g, "").slice(0, 16),
    reset: 0,
  };
}

async function add3xUiClient(client: Record<string, unknown>) {
  if (!is3xUiConfigured()) return;
  await call3xUi("/panel/api/inbounds/addClient", {
    id: Number(env.VPN_3XUI_INBOUND_ID),
    settings: JSON.stringify({ clients: [client] }),
  });
}

async function update3xUiClient(client: Record<string, unknown>) {
  if (!is3xUiConfigured()) return;
  try {
    await call3xUi("/panel/api/inbounds/updateClient", {
      id: Number(env.VPN_3XUI_INBOUND_ID),
      settings: JSON.stringify({ clients: [client] }),
    });
  } catch {
    // Some 3x-ui setups reject update for unknown client ids.
    await add3xUiClient(client);
  }
}

const DEFAULT_VLESS_REALITY_NAME = "GPTishka-vpn";

function resolveVlessRealityConfig() {
  const host = String(env.VPN_VLESS_HOST || "").trim() || "89.208.96.217";
  const port = Number(env.VPN_VLESS_PORT || 443) || 443;
  const sni = String(env.VPN_VLESS_SNI || "").trim() || "www.microsoft.com";
  const fp = String(env.VPN_VLESS_FP || "").trim() || "chrome";
  const sid = String(env.VPN_VLESS_SID || "").trim() || "7a";
  const pbk = String(env.VPN_VLESS_PBK || "").trim();
  return {
    host,
    port,
    sni,
    fp,
    sid,
    pbk,
    name: DEFAULT_VLESS_REALITY_NAME,
  };
}

function buildVlessRealityLink(uuid: string) {
  const safeUuid = String(uuid || "").trim();
  const cfg = resolveVlessRealityConfig();
  if (!cfg.host || !cfg.sni || !cfg.pbk || !cfg.sid) {
    throw new AppError("VPN VLESS configuration is incomplete", 500);
  }
  const query = new URLSearchParams();
  query.set("type", "tcp");
  query.set("security", "reality");
  query.set("sni", cfg.sni);
  query.set("fp", cfg.fp);
  query.set("pbk", cfg.pbk);
  query.set("sid", cfg.sid);
  return `vless://${safeUuid}@${cfg.host}:${cfg.port}?${query.toString()}#${cfg.name}`;
}

function normalizeAccessTemplateKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hasUnresolvedUuidPlaceholder(value: string) {
  return /\{\{\s*uuid\s*\}\}|\{\s*uuid\s*\}/i.test(String(value || ""));
}

function buildAccessLink(input: { uuid: string; plan: string; serverId: string; email: string | null }) {
  const template = String(env.VPN_ACCESS_LINK_TEMPLATE || "").trim();
  if (template) {
    const cfg = resolveVlessRealityConfig();
    const values: Record<string, string> = {
      uuid: String(input.uuid || "").trim(),
      email: String(input.email || "").trim(),
      plan: String(input.plan || "").trim(),
      serverId: String(input.serverId || "").trim(),
      host: cfg.host,
      port: String(cfg.port),
      sni: cfg.sni,
      fp: cfg.fp,
      pbk: cfg.pbk,
      sid: cfg.sid,
      name: cfg.name,
    };
    const valuesByKey = Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[normalizeAccessTemplateKey(key)] = String(value || "");
      return acc;
    }, {});

    const replaceToken = (match: string, rawKey: string) => {
      const key = normalizeAccessTemplateKey(rawKey);
      return key && Object.prototype.hasOwnProperty.call(valuesByKey, key) ? valuesByKey[key] : match;
    };

    const rendered = template
      .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, replaceToken)
      .replace(/\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, replaceToken);

    if (!hasUnresolvedUuidPlaceholder(rendered)) {
      return rendered;
    }
  }
  return buildVlessRealityLink(input.uuid);
}

function resolveAccessLinkForOutput(access: VpnAccess) {
  const stored = String(access.accessLink || "").trim();
  if (stored && !hasUnresolvedUuidPlaceholder(stored)) {
    return stored;
  }
  return buildAccessLink({
    uuid: access.uuid,
    plan: access.plan,
    serverId: access.serverId,
    email: access.email || null,
  });
}

function isAccessActiveNow(access: Pick<VpnAccess, "isActive" | "expiresAt">) {
  return Boolean(access.isActive) && access.expiresAt.getTime() > Date.now();
}

function trafficToNumber(value: bigint) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 0) return 0;
  return Math.floor(asNumber);
}

async function writeVpnEvent(params: {
  eventType: string;
  vpnAccessId?: string | null;
  telegramId?: string | null;
  meta?: unknown;
}) {
  try {
    await prisma.vpnEvent.create({
      data: {
        vpnAccessId: params.vpnAccessId || null,
        telegramId: normalizeTelegramId(params.telegramId) || null,
        eventType: String(params.eventType || "").trim() || "event",
        meta: params.meta === undefined ? undefined : asJson(params.meta),
      },
    });
  } catch (error) {
    console.warn("[vpn] failed to write event", error);
  }
}

export function toVpnMePayload(access: VpnAccess) {
  return {
    uuid: access.uuid,
    accessLink: resolveAccessLinkForOutput(access),
    expiresAt: access.expiresAt,
    plan: access.plan,
    trafficUsedBytes: trafficToNumber(access.trafficUsedBytes),
    isActive: isAccessActiveNow(access),
  };
}

export function resolveVpnProvisionPayload(product: Pick<Product, "slug" | "tags"> | null | undefined): VpnProvisionPayload | null {
  if (!product) return null;
  const tags = product.tags || [];
  const isPrimaryVpnDelivery = resolveProductDeliveryType(tags) === "vpn";
  const isVpnBundleAddon = hasBundleVpnTag(tags);
  if (!isPrimaryVpnDelivery && !isVpnBundleAddon) return null;

  const slug = normalizePlan(product.slug);
  const taggedPlan = parsePlanTag(tags);
  const plan = normalizePlan(taggedPlan || (isPrimaryVpnDelivery ? slug : "vpn_month") || "vpn_month") || "vpn_month";
  const directDays = slug ? DIRECT_VPN_PLANS[slug] : 0;
  const durationDays = toPositiveDays(parseDaysTag(tags) || DIRECT_VPN_PLANS[plan] || directDays, DEFAULT_VPN_DURATION_DAYS);
  const limitIp = toLimitIp(parseLimitIpTag(tags), DEFAULT_VPN_LIMIT_IP);
  const source: VpnSource = isPrimaryVpnDelivery ? "vpn" : "bundle";

  return {
    plan,
    durationDays,
    limitIp,
    source,
  };
}

async function findLatestByIdentity(input: {
  serverId: string;
  email?: string | null;
  telegramId?: string | null;
}) {
  const email = normalizeEmail(input.email);
  const telegramId = normalizeTelegramId(input.telegramId);
  const clauses: Prisma.VpnAccessWhereInput[] = [];
  if (email) clauses.push({ email });
  if (telegramId) clauses.push({ telegramId });
  if (!clauses.length) return null;

  return prisma.vpnAccess.findFirst({
    where: {
      serverId: input.serverId,
      OR: clauses,
    },
    orderBy: [{ expiresAt: "desc" }, { updatedAt: "desc" }],
  });
}

export const vpnService = {
  async ensureVpnCatalogProducts() {
    for (const product of VPN_CATALOG_DEFAULTS) {
      await prisma.product.upsert({
        where: { slug: product.slug },
        create: {
          slug: product.slug,
          title: product.title,
          titleEn: product.titleEn,
          description: product.description,
          descriptionEn: product.descriptionEn,
          modalDescription: product.modalDescription,
          modalDescriptionEn: product.modalDescriptionEn,
          price: product.price,
          oldPrice: null,
          currency: "RUB",
          category: "VPN",
          tags: [...product.tags],
          stock: null,
          isActive: true,
          isArchived: false,
        },
        update: {
          title: product.title,
          titleEn: product.titleEn,
          description: product.description,
          descriptionEn: product.descriptionEn,
          modalDescription: product.modalDescription,
          modalDescriptionEn: product.modalDescriptionEn,
          price: product.price,
          oldPrice: null,
          currency: "RUB",
          category: "VPN",
          tags: [...product.tags],
          isActive: true,
          isArchived: false,
        },
      });
    }
  },

  async createVpnUser(input: CreateVpnUserInput) {
    const orderId = String(input.orderId || "").trim() || null;
    const email = normalizeEmail(input.email);
    const telegramId = normalizeTelegramId(input.telegramId);
    const plan = normalizePlan(input.plan) || "vpn_month";
    const source: VpnSource = input.source === "bundle" ? "bundle" : "vpn";
    const serverId = normalizeServerId(input.serverId);
    const durationDays = toPositiveDays(input.durationDays, DEFAULT_VPN_DURATION_DAYS);
    const limitIp = toLimitIp(input.limitIp, DEFAULT_VPN_LIMIT_IP);

    if (orderId) {
      const existingByOrder = await prisma.vpnAccess.findFirst({
        where: { orderId, serverId },
        orderBy: { updatedAt: "desc" },
      });
      if (existingByOrder) return existingByOrder;
    }

    const existing = await findLatestByIdentity({ serverId, email, telegramId });
    if (existing) {
      const base = existing.expiresAt.getTime() > Date.now() ? existing.expiresAt : new Date();
      const expiresAt = addDays(base, durationDays);
      const clientEmail = deriveClientEmail(existing.email || email, telegramId || existing.telegramId, plan, existing.uuid);
      const client = build3xUiClientPayload({
        uuid: existing.uuid,
        clientEmail,
        telegramId: telegramId || existing.telegramId,
        expiresAt,
        enabled: true,
        limitIp,
      });

      await update3xUiClient(client);

      const updated = await prisma.vpnAccess.update({
        where: { id: existing.id },
        data: {
          orderId: orderId || existing.orderId || null,
          email: email || existing.email || null,
          telegramId: telegramId || existing.telegramId || null,
          accessLink: buildAccessLink({
            uuid: existing.uuid,
            plan,
            serverId,
            email: email || existing.email || null,
          }),
          plan,
          source,
          serverId,
          expiresAt,
          isActive: true,
          disabledAt: null,
        },
      });

      await writeVpnEvent({
        eventType: "extend",
        vpnAccessId: updated.id,
        telegramId: updated.telegramId,
        meta: {
          orderId,
          source,
          serverId,
          plan,
          durationDays,
          limitIp,
        },
      });

      return updated;
    }

    const uuid = randomUUID();
    const expiresAt = addDays(new Date(), durationDays);
    const clientEmail = deriveClientEmail(email, telegramId, plan, uuid);
    const accessLink = buildAccessLink({ uuid, plan, serverId, email });
    const client = build3xUiClientPayload({
      uuid,
      clientEmail,
      telegramId,
      expiresAt,
      enabled: true,
      limitIp,
    });

    await add3xUiClient(client);

    const created = await prisma.vpnAccess.create({
      data: {
        orderId,
        email,
        telegramId,
        uuid,
        accessLink,
        plan,
        source,
        serverId,
        expiresAt,
        isActive: true,
      },
    });

    await writeVpnEvent({
      eventType: "create",
      vpnAccessId: created.id,
      telegramId: created.telegramId,
        meta: {
          orderId,
          source,
          serverId,
          plan,
          durationDays,
          limitIp,
        },
      });

    return created;
  },

  async disableVpnUser(input: { uuid?: string | null; telegramId?: string | null; reason?: string | null }) {
    const uuid = String(input.uuid || "").trim();
    const telegramId = normalizeTelegramId(input.telegramId);

    const row = uuid
      ? await prisma.vpnAccess.findUnique({ where: { uuid } })
      : telegramId
      ? await prisma.vpnAccess.findFirst({
          where: { telegramId },
          orderBy: [{ expiresAt: "desc" }, { updatedAt: "desc" }],
        })
      : null;

    if (!row) {
      throw new AppError("VPN access not found", 404);
    }

    const clientEmail = deriveClientEmail(row.email, row.telegramId, row.plan, row.uuid);
    const client = build3xUiClientPayload({
      uuid: row.uuid,
      clientEmail,
      telegramId: row.telegramId,
      expiresAt: row.expiresAt,
      enabled: false,
      limitIp: DEFAULT_VPN_LIMIT_IP,
    });
    await update3xUiClient(client);

    const updated = await prisma.vpnAccess.update({
      where: { id: row.id },
      data: {
        isActive: false,
        disabledAt: new Date(),
      },
    });

    await writeVpnEvent({
      eventType: "disable",
      vpnAccessId: updated.id,
      telegramId: updated.telegramId,
      meta: { reason: String(input.reason || "").trim() || null },
    });

    return updated;
  },

  async extendVpnUserByTelegramId(
    telegramId: string | number,
    options?: { durationDays?: number; plan?: string; source?: VpnSource; serverId?: string; limitIp?: number }
  ) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);
    if (!normalizedTelegramId) {
      throw new AppError("telegramId is required", 400);
    }

    const existing = await prisma.vpnAccess.findFirst({
      where: { telegramId: normalizedTelegramId },
      orderBy: [{ expiresAt: "desc" }, { updatedAt: "desc" }],
    });
    if (!existing) {
      throw new AppError("VPN access not found for telegramId", 404);
    }

    return this.createVpnUser({
      telegramId: normalizedTelegramId,
      email: existing.email,
      durationDays: toPositiveDays(options?.durationDays, DEFAULT_VPN_DURATION_DAYS),
      plan: normalizePlan(options?.plan) || existing.plan,
      source: options?.source || (existing.source === "bundle" ? "bundle" : "vpn"),
      serverId: options?.serverId || existing.serverId,
      limitIp: options?.limitIp,
    });
  },

  async listVpnUsers(options?: { telegramId?: string; serverId?: string; activeOnly?: boolean }) {
    const telegramId = normalizeTelegramId(options?.telegramId);
    const serverId = options?.serverId ? normalizeServerId(options.serverId) : undefined;
    const where: Prisma.VpnAccessWhereInput = {
      ...(telegramId ? { telegramId } : {}),
      ...(serverId ? { serverId } : {}),
      ...(options?.activeOnly ? { isActive: true } : {}),
    };

    return prisma.vpnAccess.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  },

  async getByTelegramId(telegramId: string | number) {
    const normalizedTelegramId = normalizeTelegramId(telegramId);
    if (!normalizedTelegramId) throw new AppError("telegramId is required", 400);

    const row = await prisma.vpnAccess.findFirst({
      where: { telegramId: normalizedTelegramId },
      orderBy: [{ expiresAt: "desc" }, { updatedAt: "desc" }],
    });
    if (!row) throw new AppError("VPN access not found", 404);
    return row;
  },

  async getLatestByOrder(input: { orderId?: string | null; serverId?: string | null }) {
    const orderId = String(input.orderId || "").trim();
    if (!orderId) return null;

    const serverId = normalizeServerId(input.serverId);
    return prisma.vpnAccess.findFirst({
      where: { orderId, serverId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  },

  async getLatestByOrderOrIdentity(input: { orderId?: string | null; email?: string | null; telegramId?: string | null; serverId?: string | null }) {
    const orderId = String(input.orderId || "").trim();
    const serverId = normalizeServerId(input.serverId);
    if (orderId) {
      const byOrder = await prisma.vpnAccess.findFirst({
        where: { orderId, serverId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });
      if (byOrder) return byOrder;
    }
    return findLatestByIdentity({
      serverId,
      email: input.email,
      telegramId: input.telegramId,
    });
  },
};
