import crypto from "crypto";
import { OrderStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import { sha256 } from "../../common/utils/hash";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { writeAuditLog } from "../audit/audit.service";
import { sendCustomerMagicLinkEmail } from "../notifications/notifications.service";
import { telegramSender } from "../telegram/telegram.sender";

const DEFAULT_ACCOUNT_NEXT_PATH = "/account.html";
const SESSION_ACTIVITY_PING_MS = 5 * 60 * 1000;

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function resolvePublicOrigin() {
  try {
    return new URL(env.PAYMENT_SUCCESS_URL).origin;
  } catch {
    try {
      return new URL(env.APP_URL).origin;
    } catch {
      return "https://gptishka.shop";
    }
  }
}

function sanitizeNextPath(value: string) {
  const fallback = DEFAULT_ACCOUNT_NEXT_PATH;
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const parsed = new URL(raw);
    const origin = resolvePublicOrigin().toLowerCase();
    if (parsed.origin.toLowerCase() !== origin) return fallback;
    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return fallback;
  }
}

function buildMagicLinkUrl(token: string) {
  const url = new URL("/api/account/auth/magic", resolvePublicOrigin());
  url.searchParams.set("token", String(token || "").trim());
  return url.toString();
}

function maskAccessLink(value: string) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length <= 16) return `${key.slice(0, 4)}...${key.slice(-4)}`;
  return `${key.slice(0, 10)}...${key.slice(-8)}`;
}

function normalizeTelegramId(value: string | number | null | undefined) {
  const raw = String(value || "").trim();
  return raw.replace(/[^\d-]/g, "");
}

function maskTelegramId(value: string) {
  const id = normalizeTelegramId(value);
  if (!id) return "";
  if (id.length <= 4) return "***";
  if (id.length <= 8) return `${id.slice(0, 2)}***${id.slice(-2)}`;
  return `${id.slice(0, 4)}***${id.slice(-3)}`;
}

function resolveTelegramBotUsername() {
  return String(env.TELEGRAM_BOT_USERNAME || "")
    .trim()
    .replace(/^@+/, "");
}

function buildTelegramDeepLink(token: string) {
  const botUsername = resolveTelegramBotUsername();
  if (!botUsername) {
    throw new AppError("Telegram bot username is not configured", 409);
  }
  return `https://t.me/${encodeURIComponent(botUsername)}?start=link_${encodeURIComponent(token)}`;
}

function buildTelegramLoginDeepLink(token: string) {
  const botUsername = resolveTelegramBotUsername();
  if (!botUsername) {
    throw new AppError("Telegram bot username is not configured", 409);
  }
  return `https://t.me/${encodeURIComponent(botUsername)}?start=login_${encodeURIComponent(token)}`;
}

function resolveVpnStatus(isActive: boolean, expiresAt: Date) {
  const now = Date.now();
  const expiresTs = Number(new Date(expiresAt).getTime());
  if (!isActive) return "disabled";
  if (!Number.isFinite(expiresTs) || expiresTs <= now) return "expired";
  return "active";
}

function resolveDaysLeft(expiresAt: Date) {
  const expiresTs = Number(new Date(expiresAt).getTime());
  if (!Number.isFinite(expiresTs)) return null;
  return Math.ceil((expiresTs - Date.now()) / (24 * 60 * 60 * 1000));
}

async function ensureNotificationPreference(customerId: string) {
  const id = String(customerId || "").trim();
  if (!id) throw new AppError("Customer not found", 404);
  return prisma.customerNotificationPreference.upsert({
    where: { customerId: id },
    update: {},
    create: { customerId: id },
  });
}

async function resolveAccountEligibilityByEmail(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return {
      email,
      hasPaidOrder: false,
      hasLinkedAccess: false,
      eligible: false,
    };
  }

  const [hasPaidOrder, hasLinkedAccess] = await Promise.all([
    prisma.order.count({
      where: { email, status: OrderStatus.PAID },
      take: 1,
    }),
    prisma.vpnAccess.count({
      where: {
        OR: [{ email }, { order: { email, status: OrderStatus.PAID } }],
      },
      take: 1,
    }),
  ]);

  return {
    email,
    hasPaidOrder: hasPaidOrder > 0,
    hasLinkedAccess: hasLinkedAccess > 0,
    eligible: hasPaidOrder > 0 || hasLinkedAccess > 0,
  };
}

async function issueMagicLinkForCustomer(input: {
  customerId: string;
  email: string;
  nextPath: string;
  ip?: string;
  userAgent?: string;
}) {
  const now = new Date();
  const token = createOpaqueToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(now.getTime() + env.CUSTOMER_MAGIC_LINK_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.customerMagicLinkToken.updateMany({
      where: {
        customerId: input.customerId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        consumedAt: now,
        consumedIp: String(input.ip || "").trim() || null,
        consumedUserAgent: String(input.userAgent || "").trim() || null,
      },
    }),
    prisma.customerMagicLinkToken.create({
      data: {
        customerId: input.customerId,
        tokenHash,
        nextPath: input.nextPath,
        expiresAt,
      },
    }),
  ]);

  const magicUrl = buildMagicLinkUrl(token);
  const sent = await sendCustomerMagicLinkEmail(input.email, {
    magicUrl,
    expiresAt,
    nextPath: input.nextPath,
  });

  return {
    sent,
    expiresAt,
    magicUrl,
  };
}

export const accountService = {
  sanitizeNextPath,

  async requestMagicLink(input: { email: string; next?: string; ip?: string; userAgent?: string }) {
    const email = normalizeEmail(input.email);
    const nextPath = sanitizeNextPath(String(input.next || ""));
    const eligibility = await resolveAccountEligibilityByEmail(email);
    if (!eligibility.eligible) {
      return { ok: true, sent: false, eligible: false };
    }

    const customer = await prisma.customer.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    const issued = await issueMagicLinkForCustomer({
      customerId: customer.id,
      email,
      nextPath,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { ok: true, sent: issued.sent, eligible: true };
  },

  async requestTelegramAuthToken(input: { ip?: string; userAgent?: string }) {
    const token = createOpaqueToken();
    const tokenHash = sha256(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.CUSTOMER_TELEGRAM_AUTH_TTL_MINUTES * 60 * 1000);

    await prisma.customerTelegramAuthToken.create({
      data: {
        tokenHash,
        expiresAt,
        requestIp: String(input.ip || "").trim() || null,
        requestUserAgent: String(input.userAgent || "").trim() || null,
      },
    });

    return {
      token,
      deepLinkUrl: buildTelegramLoginDeepLink(token),
      expiresAt,
      botUsername: resolveTelegramBotUsername() || null,
    };
  },

  async getTelegramAuthTokenStatus(rawToken: string) {
    const token = String(rawToken || "").trim();
    if (!token) return { status: "invalid" as const };

    const row = await prisma.customerTelegramAuthToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        expiresAt: true,
        approvedAt: true,
        consumedAt: true,
      },
    });
    if (!row) return { status: "invalid" as const };
    if (row.consumedAt) return { status: "consumed" as const };
    if (row.expiresAt <= new Date()) return { status: "expired" as const };
    if (row.approvedAt) return { status: "approved" as const };
    return { status: "pending" as const };
  },

  async approveTelegramAuthToken(input: {
    rawToken: string;
    telegramId: string;
    telegramUsername?: string | null;
    firstName?: string | null;
  }) {
    const rawToken = String(input.rawToken || "").trim();
    const telegramId = normalizeTelegramId(input.telegramId);
    if (!rawToken) throw new AppError("Telegram login token is required", 400);
    if (!telegramId) throw new AppError("Telegram id is required", 400);

    const now = new Date();
    const tokenHash = sha256(rawToken);
    const tokenRow = await prisma.customerTelegramAuthToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        consumedAt: true,
        expiresAt: true,
      },
    });
    if (!tokenRow || tokenRow.consumedAt || tokenRow.expiresAt <= now) {
      throw new AppError("Telegram login token is invalid or expired", 401);
    }

    const telegramLink = await prisma.telegramLink.findFirst({
      where: {
        telegramId,
        isActive: true,
        unlinkedAt: null,
      },
      include: {
        customer: true,
      },
    });
    if (!telegramLink) {
      throw new AppError("Этот Telegram не привязан к аккаунту. Привяжите Telegram в личном кабинете.", 401);
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.customerTelegramAuthToken.updateMany({
        where: {
          id: tokenRow.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          approvedAt: now,
          customerId: telegramLink.customerId,
          telegramId,
        },
      });
      if (updated.count !== 1) {
        throw new AppError("Telegram login token is invalid or expired", 401);
      }
    });

    await writeAuditLog({
      entityType: "customer_account",
      entityId: telegramLink.customerId,
      action: "customer_login_telegram_approved",
      after: {
        customerEmail: telegramLink.customer.email,
        telegramId,
        telegramUsername: String(input.telegramUsername || "").replace(/^@+/, "") || null,
        firstName: String(input.firstName || "").trim() || null,
      },
    });

    return {
      customerId: telegramLink.customerId,
      customerEmail: telegramLink.customer.email,
      telegramId,
    };
  },

  async consumeTelegramAuthToken(rawToken: string, requestMeta: { ip?: string; userAgent?: string }) {
    const token = String(rawToken || "").trim();
    if (!token) return { ready: false as const, status: "invalid" as const };

    const now = new Date();
    const tokenHash = sha256(token);
    const loginToken = await prisma.customerTelegramAuthToken.findUnique({
      where: { tokenHash },
      include: { customer: true },
    });
    if (!loginToken) return { ready: false as const, status: "invalid" as const };
    if (loginToken.consumedAt) return { ready: false as const, status: "consumed" as const };
    if (loginToken.expiresAt <= now) return { ready: false as const, status: "expired" as const };
    if (!loginToken.approvedAt || !loginToken.customerId || !loginToken.customer) {
      return { ready: false as const, status: "pending" as const };
    }
    const approvedCustomer = loginToken.customer;

    const sessionToken = createOpaqueToken();
    const sessionTokenHash = sha256(sessionToken);
    const sessionExpiresAt = new Date(now.getTime() + env.CUSTOMER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.customerTelegramAuthToken.updateMany({
        where: {
          id: loginToken.id,
          consumedAt: null,
          expiresAt: { gt: now },
          approvedAt: { not: null },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new AppError("Telegram login token was already consumed", 409);
      }

      await tx.customer.update({
        where: { id: loginToken.customerId as string },
        data: {
          emailVerifiedAt: approvedCustomer.emailVerifiedAt || now,
        },
      });

      await tx.customerSession.create({
        data: {
          customerId: loginToken.customerId as string,
          tokenHash: sessionTokenHash,
          userAgent: String(requestMeta.userAgent || "").trim() || null,
          ip: String(requestMeta.ip || "").trim() || null,
          expiresAt: sessionExpiresAt,
        },
      });
    });

    return {
      ready: true as const,
      status: "authorized" as const,
      sessionToken,
      nextPath: DEFAULT_ACCOUNT_NEXT_PATH,
      customer: {
        id: approvedCustomer.id,
        email: approvedCustomer.email,
      },
      sessionExpiresAt,
    };
  },

  async consumeMagicLinkToken(token: string, requestMeta: { ip?: string; userAgent?: string }) {
    const rawToken = String(token || "").trim();
    if (!rawToken) throw new AppError("Invalid magic link", 401);

    const tokenHash = sha256(rawToken);
    const now = new Date();
    const link = await prisma.customerMagicLinkToken.findUnique({
      where: { tokenHash },
      include: { customer: true },
    });

    if (!link || link.consumedAt || link.expiresAt <= now) {
      throw new AppError("Magic link is invalid or expired", 401);
    }

    const sessionToken = createOpaqueToken();
    const sessionTokenHash = sha256(sessionToken);
    const sessionExpiresAt = new Date(now.getTime() + env.CUSTOMER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.customerMagicLinkToken.updateMany({
        where: {
          id: link.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          consumedAt: now,
          consumedIp: String(requestMeta.ip || "").trim() || null,
          consumedUserAgent: String(requestMeta.userAgent || "").trim() || null,
        },
      });
      if (consumed.count !== 1) {
        throw new AppError("Magic link is invalid or expired", 401);
      }

      await tx.customer.update({
        where: { id: link.customerId },
        data: {
          emailVerifiedAt: link.customer.emailVerifiedAt || now,
        },
      });

      await tx.customerSession.create({
        data: {
          customerId: link.customerId,
          tokenHash: sessionTokenHash,
          userAgent: String(requestMeta.userAgent || "").trim() || null,
          ip: String(requestMeta.ip || "").trim() || null,
          expiresAt: sessionExpiresAt,
        },
      });
    });

    return {
      sessionToken,
      nextPath: sanitizeNextPath(String(link.nextPath || "")),
      customer: {
        id: link.customer.id,
        email: link.customer.email,
      },
      sessionExpiresAt,
    };
  },

  async resolveSession(rawSessionToken: string) {
    const token = String(rawSessionToken || "").trim();
    if (!token) return null;

    const session = await prisma.customerSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { customer: true },
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt <= new Date()) return null;

    if (Date.now() - Number(new Date(session.lastSeenAt).getTime()) > SESSION_ACTIVITY_PING_MS) {
      void prisma.customerSession
        .update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => undefined);
    }

    return session;
  },

  async logout(rawSessionToken: string) {
    const token = String(rawSessionToken || "").trim();
    if (!token) return;
    await prisma.customerSession.updateMany({
      where: {
        tokenHash: sha256(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  },

  async logoutAll(customerId: string) {
    const id = String(customerId || "").trim();
    if (!id) return;
    await prisma.customerSession.updateMany({
      where: {
        customerId: id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  },

  async getAccountOverview(customerId: string) {
    const id = String(customerId || "").trim();
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        telegramLink: true,
      },
    });
    if (!customer) throw new AppError("Customer not found", 404);
    const notificationPreference = await ensureNotificationPreference(customer.id);
    const linkedTelegram = customer.telegramLink && customer.telegramLink.isActive ? customer.telegramLink : null;

    const accesses = await prisma.vpnAccess.findMany({
      where: {
        OR: [
          { email: customer.email },
          { order: { email: customer.email, status: OrderStatus.PAID } },
        ],
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ expiresAt: "desc" }, { updatedAt: "desc" }],
      take: 30,
    });

    const subscriptions = accesses.map((item) => ({
      id: item.id,
      plan: item.plan,
      source: item.source,
      uuid: item.uuid,
      orderId: item.orderId || item.order?.id || null,
      status: resolveVpnStatus(item.isActive, item.expiresAt),
      isActive: item.isActive,
      expiresAt: item.expiresAt,
      daysLeft: resolveDaysLeft(item.expiresAt),
      keyPreview: maskAccessLink(item.accessLink),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const activeNow = subscriptions.find((item) => item.status === "active") || null;

    return {
      customer: {
        id: customer.id,
        email: customer.email,
        locale: customer.locale,
        timezone: customer.timezone,
      },
      notificationPreferences: {
        emailEnabled: notificationPreference.emailEnabled,
        reminder7d: notificationPreference.reminder7d,
        reminder3d: notificationPreference.reminder3d,
        reminder1d: notificationPreference.reminder1d,
        reminderExpired: notificationPreference.reminderExpired,
        marketingEmailEnabled: notificationPreference.marketingEmailEnabled,
        transactionalEmailEnabled: notificationPreference.transactionalEmailEnabled,
        emailStatus: notificationPreference.emailStatus,
        lastEmailSentAt: notificationPreference.lastEmailSentAt,
      },
      telegram: {
        linked: Boolean(linkedTelegram),
        botUsername: resolveTelegramBotUsername() || null,
        link: linkedTelegram
          ? {
              telegramIdMasked: maskTelegramId(linkedTelegram.telegramId),
              telegramUsername: linkedTelegram.telegramUsername ? `@${linkedTelegram.telegramUsername}` : null,
              firstName: linkedTelegram.firstName || null,
              linkedAt: linkedTelegram.linkedAt,
              lastError: linkedTelegram.lastError || null,
            }
          : null,
      },
      activeSubscription: activeNow,
      subscriptions,
    };
  },

  async getNotificationPreferences(customerId: string) {
    const id = String(customerId || "").trim();
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new AppError("Customer not found", 404);
    const pref = await ensureNotificationPreference(customer.id);
    return {
      emailEnabled: pref.emailEnabled,
      reminder7d: pref.reminder7d,
      reminder3d: pref.reminder3d,
      reminder1d: pref.reminder1d,
      reminderExpired: pref.reminderExpired,
      marketingEmailEnabled: pref.marketingEmailEnabled,
      transactionalEmailEnabled: pref.transactionalEmailEnabled,
      emailStatus: pref.emailStatus,
      lastEmailSentAt: pref.lastEmailSentAt,
    };
  },

  async updateNotificationPreferences(
    customerId: string,
    input: Partial<{
      emailEnabled: boolean;
      reminder7d: boolean;
      reminder3d: boolean;
      reminder1d: boolean;
      reminderExpired: boolean;
      marketingEmailEnabled: boolean;
      transactionalEmailEnabled: boolean;
    }>
  ) {
    const id = String(customerId || "").trim();
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new AppError("Customer not found", 404);
    const pref = await ensureNotificationPreference(customer.id);
    const patch: Record<string, unknown> = {};
    if (typeof input.emailEnabled === "boolean") patch.emailEnabled = input.emailEnabled;
    if (typeof input.reminder7d === "boolean") patch.reminder7d = input.reminder7d;
    if (typeof input.reminder3d === "boolean") patch.reminder3d = input.reminder3d;
    if (typeof input.reminder1d === "boolean") patch.reminder1d = input.reminder1d;
    if (typeof input.reminderExpired === "boolean") patch.reminderExpired = input.reminderExpired;
    if (typeof input.marketingEmailEnabled === "boolean") patch.marketingEmailEnabled = input.marketingEmailEnabled;
    if (typeof input.transactionalEmailEnabled === "boolean") patch.transactionalEmailEnabled = input.transactionalEmailEnabled;

    const updated =
      Object.keys(patch).length > 0
        ? await prisma.customerNotificationPreference.update({
            where: { id: pref.id },
            data: patch,
          })
        : pref;

    return {
      emailEnabled: updated.emailEnabled,
      reminder7d: updated.reminder7d,
      reminder3d: updated.reminder3d,
      reminder1d: updated.reminder1d,
      reminderExpired: updated.reminderExpired,
      marketingEmailEnabled: updated.marketingEmailEnabled,
      transactionalEmailEnabled: updated.transactionalEmailEnabled,
      emailStatus: updated.emailStatus,
      lastEmailSentAt: updated.lastEmailSentAt,
    };
  },

  async getTelegramStatus(customerId: string) {
    const id = String(customerId || "").trim();
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        telegramLink: true,
      },
    });
    if (!customer) throw new AppError("Customer not found", 404);
    const link = customer.telegramLink;
    const linked = Boolean(link && link.isActive && !link.unlinkedAt);

    return {
      linked,
      botUsername: resolveTelegramBotUsername() || null,
      link: linked
        ? {
            telegramIdMasked: maskTelegramId(String(link?.telegramId || "")),
            telegramUsername: link?.telegramUsername ? `@${String(link.telegramUsername).replace(/^@+/, "")}` : null,
            firstName: link?.firstName || null,
            linkedAt: link?.linkedAt || null,
            isActive: Boolean(link?.isActive),
            lastError: link?.lastError || null,
          }
        : null,
    };
  },

  async requestTelegramLinkToken(input: { customerId: string; ip?: string; userAgent?: string }) {
    const customerId = String(input.customerId || "").trim();
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("Customer not found", 404);

    const token = createOpaqueToken();
    const tokenHash = sha256(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.TELEGRAM_LINK_TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction([
      prisma.telegramLinkToken.updateMany({
        where: {
          customerId,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      }),
      prisma.telegramLinkToken.create({
        data: {
          customerId,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const deepLinkUrl = buildTelegramDeepLink(token);
    await writeAuditLog({
      entityType: "customer_account",
      entityId: customerId,
      action: "customer_request_telegram_link",
      after: {
        customerEmail: customer.email,
        expiresAt,
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      deepLinkUrl,
      expiresAt,
      botUsername: resolveTelegramBotUsername(),
    };
  },

  async unlinkTelegram(input: { customerId: string; ip?: string; userAgent?: string }) {
    const customerId = String(input.customerId || "").trim();
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { telegramLink: true },
    });
    if (!customer) throw new AppError("Customer not found", 404);

    if (!customer.telegramLink || !customer.telegramLink.isActive) {
      return { linked: false };
    }

    await prisma.telegramLink.update({
      where: { customerId },
      data: {
        isActive: false,
        unlinkedAt: new Date(),
        lastError: null,
      },
    });

    await writeAuditLog({
      entityType: "customer_account",
      entityId: customerId,
      action: "customer_unlink_telegram",
      before: {
        telegramId: customer.telegramLink.telegramId,
        telegramUsername: customer.telegramLink.telegramUsername,
      },
      after: { linked: false },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { linked: false };
  },

  async consumeTelegramLinkToken(input: {
    rawToken: string;
    telegramId: string;
    telegramUsername?: string | null;
    firstName?: string | null;
  }) {
    const rawToken = String(input.rawToken || "").trim();
    const telegramId = normalizeTelegramId(input.telegramId);
    if (!rawToken) throw new AppError("Telegram link token is required", 400);
    if (!telegramId) throw new AppError("Telegram id is required", 400);

    const tokenHash = sha256(rawToken);
    const now = new Date();
    const linkToken = await prisma.telegramLinkToken.findUnique({
      where: { tokenHash },
      include: { customer: true },
    });

    if (!linkToken || linkToken.consumedAt || linkToken.expiresAt <= now) {
      throw new AppError("Telegram link token is invalid or expired", 401);
    }

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.telegramLinkToken.updateMany({
        where: {
          id: linkToken.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          consumedAt: now,
        },
      });
      if (consumed.count !== 1) {
        throw new AppError("Telegram link token is invalid or expired", 401);
      }

      await tx.telegramLink.updateMany({
        where: {
          telegramId,
          isActive: true,
          customerId: { not: linkToken.customerId },
        },
        data: {
          isActive: false,
          unlinkedAt: now,
          lastError: "relinked_to_another_customer",
        },
      });

      await tx.telegramLink.upsert({
        where: { customerId: linkToken.customerId },
        update: {
          telegramId,
          telegramUsername: String(input.telegramUsername || "").replace(/^@+/, "") || null,
          firstName: String(input.firstName || "").trim() || null,
          linkedAt: now,
          isActive: true,
          unlinkedAt: null,
          lastError: null,
        },
        create: {
          customerId: linkToken.customerId,
          telegramId,
          telegramUsername: String(input.telegramUsername || "").replace(/^@+/, "") || null,
          firstName: String(input.firstName || "").trim() || null,
          linkedAt: now,
          isActive: true,
        },
      });
    });

    await writeAuditLog({
      entityType: "customer_account",
      entityId: linkToken.customerId,
      action: "customer_link_telegram",
      after: {
        customerEmail: linkToken.customer.email,
        telegramId,
        telegramUsername: String(input.telegramUsername || "").replace(/^@+/, "") || null,
      },
    });

    return {
      customerId: linkToken.customerId,
      customerEmail: linkToken.customer.email,
      telegramId,
      telegramUsername: String(input.telegramUsername || "").replace(/^@+/, "") || null,
    };
  },

  async markTelegramLinkInactive(input: { customerId: string; reason: string }) {
    const customerId = String(input.customerId || "").trim();
    if (!customerId) return;
    await prisma.telegramLink.updateMany({
      where: { customerId, isActive: true },
      data: {
        isActive: false,
        unlinkedAt: new Date(),
        lastError: String(input.reason || "").slice(0, 500),
      },
    });
  },

  async revealVpnAccessKey(input: { customerId: string; vpnAccessId: string; ip?: string; userAgent?: string }) {
    const customerId = String(input.customerId || "").trim();
    const vpnAccessId = String(input.vpnAccessId || "").trim();
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("Customer not found", 404);

    const access = await prisma.vpnAccess.findFirst({
      where: {
        id: vpnAccessId,
        OR: [
          { email: customer.email },
          { order: { email: customer.email, status: OrderStatus.PAID } },
        ],
      },
      select: {
        id: true,
        accessLink: true,
        expiresAt: true,
        plan: true,
        isActive: true,
      },
    });
    if (!access) throw new AppError("VPN access not found", 404);

    await writeAuditLog({
      entityType: "customer_vpn_access",
      entityId: access.id,
      action: "customer_reveal_key",
      after: {
        customerId,
        customerEmail: customer.email,
        expiresAt: access.expiresAt,
        plan: access.plan,
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      id: access.id,
      accessLink: access.accessLink,
      expiresAt: access.expiresAt,
      isActive: access.isActive,
      plan: access.plan,
    };
  },

  async adminLookup(input: { email?: string; orderId?: string; vpnAccessId?: string }) {
    const email = normalizeEmail(String(input.email || ""));
    const orderId = String(input.orderId || "").trim();
    const vpnAccessId = String(input.vpnAccessId || "").trim();

    if (!email && !orderId && !vpnAccessId) {
      throw new AppError("Email, orderId or vpnAccessId is required", 400);
    }

    const customer = email
      ? await prisma.customer.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            locale: true,
            timezone: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : null;

    const orderWhere: Record<string, unknown> = {};
    if (orderId) orderWhere.id = orderId;
    if (email) orderWhere.email = email;
    const orders =
      Object.keys(orderWhere).length > 0
        ? await prisma.order.findMany({
            where: orderWhere,
            select: {
              id: true,
              email: true,
              status: true,
              totalAmount: true,
              currency: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: [{ createdAt: "desc" }],
            take: 30,
          })
        : [];

    const vpnFilters: Record<string, unknown>[] = [];
    if (vpnAccessId) vpnFilters.push({ id: vpnAccessId });
    if (orderId) vpnFilters.push({ orderId });
    if (email) vpnFilters.push({ OR: [{ email }, { order: { email } }] });
    const vpnWhere =
      vpnFilters.length === 0
        ? undefined
        : vpnFilters.length === 1
        ? vpnFilters[0]
        : { AND: vpnFilters };
    const vpnAccesses = vpnWhere
      ? await prisma.vpnAccess.findMany({
          where: vpnWhere,
          select: {
            id: true,
            email: true,
            orderId: true,
            plan: true,
            source: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
            order: {
              select: {
                id: true,
                email: true,
                status: true,
              },
            },
          },
          orderBy: [{ expiresAt: "desc" }, { updatedAt: "desc" }],
          take: 50,
        })
      : [];

    const eligibility = email ? await resolveAccountEligibilityByEmail(email) : null;
    const telegramLink = customer
      ? await prisma.telegramLink.findUnique({
          where: { customerId: customer.id },
          select: {
            telegramId: true,
            telegramUsername: true,
            firstName: true,
            linkedAt: true,
            unlinkedAt: true,
            isActive: true,
            lastError: true,
            updatedAt: true,
          },
        })
      : null;
    const telegramEvents = customer
      ? await prisma.customerNotificationEvent.findMany({
          where: {
            customerId: customer.id,
            channel: "telegram",
          },
          select: {
            id: true,
            type: true,
            channel: true,
            status: true,
            sentAt: true,
            attempts: true,
            lastError: true,
            createdAt: true,
            updatedAt: true,
            dedupeKey: true,
            vpnAccessId: true,
          },
          orderBy: [{ createdAt: "desc" }],
          take: 30,
        })
      : [];

    return {
      query: {
        email: email || null,
        orderId: orderId || null,
        vpnAccessId: vpnAccessId || null,
      },
      customer,
      telegram: telegramLink
        ? {
            isActive: telegramLink.isActive,
            telegramId: telegramLink.telegramId,
            telegramIdMasked: maskTelegramId(telegramLink.telegramId),
            telegramUsername: telegramLink.telegramUsername ? `@${telegramLink.telegramUsername}` : null,
            firstName: telegramLink.firstName,
            linkedAt: telegramLink.linkedAt,
            unlinkedAt: telegramLink.unlinkedAt,
            lastError: telegramLink.lastError,
            updatedAt: telegramLink.updatedAt,
          }
        : null,
      eligibility,
      orders,
      telegramEvents,
      vpnAccesses: vpnAccesses.map((item) => ({
        id: item.id,
        email: item.email,
        orderId: item.orderId || item.order?.id || null,
        orderEmail: item.order?.email || null,
        orderStatus: item.order?.status || null,
        plan: item.plan,
        source: item.source,
        isActive: item.isActive,
        status: resolveVpnStatus(item.isActive, item.expiresAt),
        expiresAt: item.expiresAt,
        daysLeft: resolveDaysLeft(item.expiresAt),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  },

  async adminSendMagicLink(input: {
    email: string;
    next?: string;
    ip?: string;
    userAgent?: string;
    requestedByUserId?: string | null;
  }) {
    const email = normalizeEmail(input.email);
    if (!email) throw new AppError("Email is required", 400);
    const nextPath = sanitizeNextPath(String(input.next || ""));
    const eligibility = await resolveAccountEligibilityByEmail(email);
    if (!eligibility.eligible) {
      throw new AppError("No eligible paid order or linked VPN access found for this email", 404);
    }

    const customer = await prisma.customer.upsert({
      where: { email },
      update: {},
      create: { email },
    });
    const issued = await issueMagicLinkForCustomer({
      customerId: customer.id,
      email,
      nextPath,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    await writeAuditLog({
      userId: input.requestedByUserId || undefined,
      entityType: "customer_account",
      entityId: customer.id,
      action: "admin_resend_magic_link",
      after: {
        email,
        nextPath,
        sent: issued.sent,
        expiresAt: issued.expiresAt,
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      customerId: customer.id,
      email,
      nextPath,
      sent: issued.sent,
      expiresAt: issued.expiresAt,
    };
  },

  async adminSendTelegramTestMessage(input: {
    customerId?: string;
    email?: string;
    message?: string;
    requestedByUserId?: string | null;
    ip?: string;
    userAgent?: string;
  }) {
    const customerId = String(input.customerId || "").trim();
    const email = normalizeEmail(String(input.email || ""));
    if (!customerId && !email) {
      throw new AppError("customerId or email is required", 400);
    }

    const customer = customerId
      ? await prisma.customer.findUnique({ where: { id: customerId } })
      : await prisma.customer.findUnique({ where: { email } });
    if (!customer) throw new AppError("Customer not found", 404);

    const telegramLink = await prisma.telegramLink.findUnique({
      where: { customerId: customer.id },
    });
    if (!telegramLink || !telegramLink.isActive) {
      throw new AppError("Active telegram link not found for customer", 404);
    }

    const text =
      String(input.message || "").trim() ||
      "Тестовое уведомление GPTishka: Telegram-канал привязан корректно.";

    const sendResult = await telegramSender.sendTextMessage({
      telegramId: telegramLink.telegramId,
      text,
    });

    const eventDedupe = `telegram_test:${customer.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    await prisma.customerNotificationEvent.create({
      data: {
        customerId: customer.id,
        type: "admin_test",
        channel: "telegram",
        dedupeKey: eventDedupe,
        status: sendResult.ok ? "sent" : sendResult.retryable ? "failed" : "skipped",
        sentAt: sendResult.ok ? new Date() : null,
        attempts: 1,
        lastError: sendResult.ok ? null : `${sendResult.code}:${sendResult.description}`.slice(0, 900),
        payload: {
          text,
          source: "admin_test",
        },
      },
    });

    if (!sendResult.ok && sendResult.deactivateLink) {
      await prisma.telegramLink.updateMany({
        where: { customerId: customer.id, isActive: true },
        data: {
          isActive: false,
          unlinkedAt: new Date(),
          lastError: `${sendResult.code}:${sendResult.description}`.slice(0, 500),
        },
      });
    }

    await writeAuditLog({
      userId: input.requestedByUserId || undefined,
      entityType: "customer_account",
      entityId: customer.id,
      action: "admin_send_telegram_test_message",
      after: {
        email: customer.email,
        telegramId: telegramLink.telegramId,
        sendResult,
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      customerId: customer.id,
      email: customer.email,
      sendResult,
    };
  },

  async adminLinkOrderToCustomer(input: {
    orderId: string;
    email: string;
    syncOrderEmail?: boolean;
    syncVpnAccessEmail?: boolean;
    requestedByUserId?: string | null;
    ip?: string;
    userAgent?: string;
  }) {
    const orderId = String(input.orderId || "").trim();
    const email = normalizeEmail(input.email);
    if (!orderId) throw new AppError("Order id is required", 400);
    if (!email) throw new AppError("Email is required", 400);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });
    if (!order) throw new AppError("Order not found", 404);
    if (order.status !== OrderStatus.PAID) {
      throw new AppError("Only paid orders can be linked", 409, { orderStatus: order.status });
    }

    const syncOrderEmail = Boolean(input.syncOrderEmail);
    const syncVpnAccessEmail = input.syncVpnAccessEmail !== false;

    const customer = await prisma.customer.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    const txResult = await prisma.$transaction(async (tx) => {
      let orderEmailUpdated = false;
      if (syncOrderEmail && order.email !== email) {
        await tx.order.update({
          where: { id: order.id },
          data: { email },
        });
        orderEmailUpdated = true;
      }

      const vpnEmailUpdate = syncVpnAccessEmail
        ? await tx.vpnAccess.updateMany({
            where: {
              orderId: order.id,
              OR: [{ email: null }, { email: { not: email } }],
            },
            data: { email },
          })
        : { count: 0 };

      return {
        orderEmailUpdated,
        updatedVpnAccessCount: vpnEmailUpdate.count,
      };
    });

    await writeAuditLog({
      userId: input.requestedByUserId || undefined,
      entityType: "customer_account",
      entityId: customer.id,
      action: "admin_link_order_to_customer",
      before: {
        orderId: order.id,
        orderEmail: order.email,
        orderStatus: order.status,
      },
      after: {
        email,
        syncOrderEmail,
        syncVpnAccessEmail,
        orderEmailUpdated: txResult.orderEmailUpdated,
        updatedVpnAccessCount: txResult.updatedVpnAccessCount,
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      customerId: customer.id,
      email,
      orderId: order.id,
      orderStatus: order.status,
      orderEmailUpdated: txResult.orderEmailUpdated,
      updatedVpnAccessCount: txResult.updatedVpnAccessCount,
    };
  },

  async adminLinkVpnAccessToCustomer(input: {
    vpnAccessId: string;
    email: string;
    syncOrderEmail?: boolean;
    requestedByUserId?: string | null;
    ip?: string;
    userAgent?: string;
  }) {
    const vpnAccessId = String(input.vpnAccessId || "").trim();
    const email = normalizeEmail(input.email);
    if (!vpnAccessId) throw new AppError("VPN access id is required", 400);
    if (!email) throw new AppError("Email is required", 400);

    const access = await prisma.vpnAccess.findUnique({
      where: { id: vpnAccessId },
      select: {
        id: true,
        email: true,
        orderId: true,
        order: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
    });
    if (!access) throw new AppError("VPN access not found", 404);
    if (access.order && access.order.status !== OrderStatus.PAID) {
      throw new AppError("VPN access order is not paid", 409, { orderStatus: access.order.status });
    }

    const customer = await prisma.customer.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    const syncOrderEmail = Boolean(input.syncOrderEmail);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.vpnAccess.update({
        where: { id: access.id },
        data: { email },
      });

      let orderEmailUpdated = false;
      if (syncOrderEmail && access.orderId && access.order && access.order.email !== email) {
        await tx.order.update({
          where: { id: access.orderId },
          data: { email },
        });
        orderEmailUpdated = true;
      }

      return { orderEmailUpdated };
    });

    await writeAuditLog({
      userId: input.requestedByUserId || undefined,
      entityType: "customer_account",
      entityId: customer.id,
      action: "admin_link_vpn_access_to_customer",
      before: {
        vpnAccessId: access.id,
        vpnAccessEmail: access.email,
        orderId: access.orderId || null,
        orderEmail: access.order?.email || null,
      },
      after: {
        email,
        syncOrderEmail,
        orderEmailUpdated: updated.orderEmailUpdated,
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      customerId: customer.id,
      email,
      vpnAccessId: access.id,
      orderId: access.orderId || null,
      orderEmailUpdated: updated.orderEmailUpdated,
    };
  },
};
