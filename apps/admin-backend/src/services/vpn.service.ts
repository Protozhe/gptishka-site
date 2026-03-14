import axios, { AxiosError } from "axios";
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
  source: VpnSource;
};

type CreateVpnUserInput = {
  orderId?: string | null;
  email?: string | null;
  telegramId?: string | null;
  plan: string;
  durationDays: number;
  source: VpnSource;
  serverId?: string | null;
};

const DIRECT_VPN_PLANS: Record<string, number> = {
  vpn_month: 30,
  vpn_halfyear: 180,
  vpn_year: 365,
};

const DEFAULT_VPN_DURATION_DAYS = 30;
const XUI_COOKIE_TTL_MS = 10 * 60 * 1000;

type VlessRealityConfig = {
  host: string;
  port: number;
  sni: string;
  fp: string;
  sid: string;
  pbk: string;
  name: string;
};

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

  const response = await axios.post(`${baseUrl}/login`, body.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new AppError("VPN panel login failed", 502, { upstreamStatus: response.status, upstreamBody: response.data });
  }

  const rawSetCookie = response.headers["set-cookie"];
  const setCookies = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [String(rawSetCookie)] : [];
  const cookie = setCookies
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

async function call3xUiPost(path: string, payload: unknown, canRetry = true): Promise<any> {
  if (!is3xUiConfigured()) return null;

  const cookie = await ensure3xUiCookie(false);
  const response = await axios.post(`${resolve3xUiBaseUrl()}${path}`, payload || {}, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    validateStatus: () => true,
  });

  if (response.status === 401 && canRetry) {
    await ensure3xUiCookie(true);
    return call3xUiPost(path, payload, false);
  }

  const json: any = response.data;
  const text = typeof response.data === "string" ? response.data : JSON.stringify(response.data || {});

  if (response.status < 200 || response.status >= 300) {
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

async function call3xUiGet(path: string, canRetry = true): Promise<any> {
  if (!is3xUiConfigured()) return null;

  const cookie = await ensure3xUiCookie(false);
  const response = await axios.get(`${resolve3xUiBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: cookie,
    },
    validateStatus: () => true,
  });

  if (response.status === 401 && canRetry) {
    await ensure3xUiCookie(true);
    return call3xUiGet(path, false);
  }

  const json: any = response.data;
  const text = typeof response.data === "string" ? response.data : JSON.stringify(response.data || {});

  if (response.status < 200 || response.status >= 300) {
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
}) {
  const totalGb = Math.max(0, Number(env.VPN_3XUI_CLIENT_TOTAL_GB || 0));
  const totalBytes = totalGb > 0 ? Math.floor(totalGb * 1024 * 1024 * 1024) : 0;

  return {
    id: input.uuid,
    alterId: 0,
    email: input.clientEmail,
    limitIp: 0,
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
  await call3xUiPost("/panel/api/inbounds/addClient", {
    id: Number(env.VPN_3XUI_INBOUND_ID),
    settings: JSON.stringify({ clients: [client] }),
  });
}

async function update3xUiClient(client: Record<string, unknown>) {
  if (!is3xUiConfigured()) return;
  try {
    await call3xUiPost("/panel/api/inbounds/updateClient", {
      id: Number(env.VPN_3XUI_INBOUND_ID),
      settings: JSON.stringify({ clients: [client] }),
    });
  } catch {
    // Some 3x-ui setups reject update for unknown client ids.
    await add3xUiClient(client);
  }
}

function resolveVlessRealityConfig(): VlessRealityConfig {
  return {
    host: String(env.VPN_VLESS_HOST || "vpn.gptishka.shop").trim() || "vpn.gptishka.shop",
    port: Number(env.VPN_VLESS_PORT || 443) || 443,
    sni: String(env.VPN_VLESS_SNI || "www.microsoft.com").trim() || "www.microsoft.com",
    fp: String(env.VPN_VLESS_FP || "chrome").trim() || "chrome",
    sid: String(env.VPN_VLESS_SID || "7a").trim() || "7a",
    pbk: String(env.VPN_VLESS_PBK || "").trim(),
    name: "GPTishka-vpn",
  };
}

function applyAccessLinkTemplate(template: string, uuid: string, cfg: VlessRealityConfig) {
  return String(template || "")
    .replace(/\{uuid\}/gi, uuid)
    .replace(/\{host\}/gi, cfg.host)
    .replace(/\{port\}/gi, String(cfg.port))
    .replace(/\{sni\}/gi, cfg.sni)
    .replace(/\{fp\}/gi, cfg.fp)
    .replace(/\{pbk\}/gi, cfg.pbk)
    .replace(/\{sid\}/gi, cfg.sid)
    .replace(/\{name\}/gi, cfg.name);
}

function buildVlessRealityLink(uuid: string) {
  const cfg = resolveVlessRealityConfig();
  const safeUuid = String(uuid || "").trim();
  const template = String(env.VPN_ACCESS_LINK_TEMPLATE || "").trim();
  if (template) {
    const fromTemplate = applyAccessLinkTemplate(template, safeUuid, cfg).trim();
    if (fromTemplate) return fromTemplate;
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

function buildAccessLink(input: { uuid: string; plan: string; serverId: string; email: string | null }) {
  return buildVlessRealityLink(input.uuid);
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

function toSafeBigInt(value: unknown, fallback = 0n) {
  if (typeof value === "bigint") return value >= 0n ? value : fallback;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 0) return fallback;
  try {
    return BigInt(Math.floor(asNumber));
  } catch {
    return fallback;
  }
}

function resolveClientEmailForAccess(row: Pick<VpnAccess, "email" | "telegramId" | "plan" | "uuid">) {
  return deriveClientEmail(row.email, row.telegramId, row.plan, row.uuid);
}

function parseJsonObject(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input !== "string") return {};
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function normalizeStatsUsage(entry: Record<string, unknown>) {
  const total = Number(entry.total ?? entry.usage ?? entry.traffic ?? -1);
  if (Number.isFinite(total) && total >= 0) return Math.floor(total);
  const up = Number(entry.up ?? entry.upload ?? entry.uplink ?? 0);
  const down = Number(entry.down ?? entry.download ?? entry.downlink ?? 0);
  const mixed = up + down;
  if (Number.isFinite(mixed) && mixed >= 0) return Math.floor(mixed);
  return 0;
}

function extractUsageFromInboundResponse(payload: any, clientEmail: string) {
  const root = parseJsonObject(payload);
  const obj = parseJsonObject(root.obj);
  const statsRaw = (obj.clientStats ?? obj.clientTraffic ?? obj.clientStatsList ?? root.clientStats) as unknown;
  const stats = Array.isArray(statsRaw) ? statsRaw : [];
  const target = String(clientEmail || "").trim().toLowerCase();
  if (!target || !stats.length) return 0;

  for (const item of stats) {
    const row = parseJsonObject(item);
    const email = String(row.email ?? row.clientEmail ?? "").trim().toLowerCase();
    if (!email || email !== target) continue;
    return normalizeStatsUsage(row);
  }

  return 0;
}

export function toVpnMePayload(access: VpnAccess) {
  return {
    uuid: access.uuid,
    accessLink: access.accessLink,
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
  const source: VpnSource = isPrimaryVpnDelivery ? "vpn" : "bundle";

  return {
    plan,
    durationDays,
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
      });

      await update3xUiClient(client);

      const updated = await prisma.vpnAccess.update({
        where: { id: existing.id },
        data: {
          orderId: orderId || existing.orderId || null,
          email: email || existing.email || null,
          telegramId: telegramId || existing.telegramId || null,
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
    options?: { durationDays?: number; plan?: string; source?: VpnSource; serverId?: string }
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

  async getById(id: string) {
    const row = await prisma.vpnAccess.findUnique({
      where: { id: String(id || "").trim() },
    });
    if (!row) throw new AppError("VPN access not found", 404);
    return row;
  },

  async revokeById(id: string, reason?: string | null) {
    const row = await this.getById(id);
    return this.disableVpnUser({
      uuid: row.uuid,
      reason: String(reason || "").trim() || "revoked_by_admin",
    });
  },

  async regenerateKeyById(id: string, reason?: string | null) {
    const row = await this.getById(id);
    const previousUuid = row.uuid;
    const newUuid = randomUUID();
    const clientEmail = resolveClientEmailForAccess({ ...row, uuid: newUuid });
    const nextIsActive = Boolean(row.isActive) && row.expiresAt.getTime() > Date.now();
    const nextClient = build3xUiClientPayload({
      uuid: newUuid,
      clientEmail,
      telegramId: row.telegramId,
      expiresAt: row.expiresAt,
      enabled: nextIsActive,
    });

    await add3xUiClient(nextClient);

    try {
      const oldClient = build3xUiClientPayload({
        uuid: previousUuid,
        clientEmail: resolveClientEmailForAccess(row),
        telegramId: row.telegramId,
        expiresAt: row.expiresAt,
        enabled: false,
      });
      await update3xUiClient(oldClient);
    } catch (error) {
      console.warn("[vpn] failed to disable old uuid during key regeneration", error);
    }

    const updated = await prisma.vpnAccess.update({
      where: { id: row.id },
      data: {
        uuid: newUuid,
        accessLink: buildAccessLink({
          uuid: newUuid,
          plan: row.plan,
          serverId: row.serverId,
          email: row.email,
        }),
        isActive: nextIsActive,
        disabledAt: nextIsActive ? null : row.disabledAt || new Date(),
      },
    });

    await writeVpnEvent({
      eventType: "regenerate",
      vpnAccessId: updated.id,
      telegramId: updated.telegramId,
      meta: {
        reason: String(reason || "").trim() || "regenerated_by_admin",
        previousUuid,
        nextUuid: newUuid,
      },
    });

    return updated;
  },

  async setExpiryById(id: string, expiresAtValue: string | Date, reason?: string | null) {
    const row = await this.getById(id);
    const nextExpiresAt = new Date(expiresAtValue);
    if (Number.isNaN(nextExpiresAt.getTime())) {
      throw new AppError("Invalid expiresAt date", 422);
    }

    const shouldBeActive = Boolean(row.isActive) && nextExpiresAt.getTime() > Date.now();
    const client = build3xUiClientPayload({
      uuid: row.uuid,
      clientEmail: resolveClientEmailForAccess(row),
      telegramId: row.telegramId,
      expiresAt: nextExpiresAt,
      enabled: shouldBeActive,
    });
    await update3xUiClient(client);

    const updated = await prisma.vpnAccess.update({
      where: { id: row.id },
      data: {
        expiresAt: nextExpiresAt,
        isActive: shouldBeActive,
        disabledAt: shouldBeActive ? null : row.disabledAt || new Date(),
      },
    });

    await writeVpnEvent({
      eventType: "set_expiry",
      vpnAccessId: updated.id,
      telegramId: updated.telegramId,
      meta: {
        reason: String(reason || "").trim() || "expiry_updated_by_admin",
        expiresAt: nextExpiresAt.toISOString(),
      },
    });

    return updated;
  },

  async syncTrafficById(id: string) {
    const row = await this.getById(id);
    if (!is3xUiConfigured()) {
      return row;
    }

    const inboundId = Number(env.VPN_3XUI_INBOUND_ID || 0);
    if (!inboundId) {
      return row;
    }

    let usage = 0;
    try {
      const inbound = await call3xUiGet(`/panel/api/inbounds/get/${inboundId}`);
      usage = extractUsageFromInboundResponse(inbound, resolveClientEmailForAccess(row));
    } catch (error) {
      const asAxios = error as AxiosError | undefined;
      console.warn("[vpn] failed to sync traffic", asAxios?.message || error);
      throw new AppError("Failed to sync VPN traffic from panel", 502);
    }

    const updated = await prisma.vpnAccess.update({
      where: { id: row.id },
      data: {
        trafficUsedBytes: toSafeBigInt(usage, row.trafficUsedBytes),
      },
    });

    await writeVpnEvent({
      eventType: "sync_traffic",
      vpnAccessId: updated.id,
      telegramId: updated.telegramId,
      meta: {
        trafficUsedBytes: String(updated.trafficUsedBytes),
      },
    });

    return updated;
  },

  async disableExpiredAccesses(limit = 200) {
    const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 0), 1000));
    const now = new Date();
    const rows = await prisma.vpnAccess.findMany({
      where: {
        isActive: true,
        expiresAt: { lte: now },
      },
      orderBy: [{ expiresAt: "asc" }, { updatedAt: "asc" }],
      take: safeLimit,
    });

    let disabled = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await this.disableVpnUser({
          uuid: row.uuid,
          reason: "expired_auto",
        });
        disabled += 1;
      } catch (error) {
        failed += 1;
        console.warn("[vpn] failed to disable expired access", row.id, error);
      }
    }

    return {
      checked: rows.length,
      disabled,
      failed,
    };
  },
};
