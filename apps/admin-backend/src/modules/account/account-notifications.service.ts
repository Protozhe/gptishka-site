import { OrderStatus } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { telegramSender } from "../telegram/telegram.sender";
import { buildTelegramReminderText } from "../telegram/telegram.templates";

const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderType = "7d" | "3d" | "1d" | "expired";

type ReminderRule = {
  type: Exclude<ReminderType, "expired">;
  daysBefore: number;
  prefKey: "reminder7d" | "reminder3d" | "reminder1d";
};

type ActiveTelegramLink = {
  customerId: string;
  telegramId: string;
  isActive: boolean;
  lastError: string | null;
};

const REMINDER_RULES: ReminderRule[] = [
  { type: "7d", daysBefore: 7, prefKey: "reminder7d" },
  { type: "3d", daysBefore: 3, prefKey: "reminder3d" },
  { type: "1d", daysBefore: 1, prefKey: "reminder1d" },
];

let scheduler: NodeJS.Timeout | null = null;
let inProgress = false;

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function resolveSiteOrigin() {
  try {
    return new URL(env.APP_BASE_URL).origin;
  } catch {
    try {
      return new URL(env.PAYMENT_SUCCESS_URL).origin;
    } catch {
      return "https://gptishka.shop";
    }
  }
}

function resolveReminderWindow(
  expiresAt: Date,
  daysBefore: number,
  windowMinutes: number,
  now: Date
): { shouldSend: boolean; windowStart: Date; windowEnd: Date } {
  const target = Number(new Date(expiresAt).getTime()) - daysBefore * DAY_MS;
  const offset = windowMinutes * 60 * 1000;
  const windowStart = new Date(target - offset);
  const windowEnd = new Date(target + offset);
  const nowTs = Number(now.getTime());
  return {
    shouldSend: nowTs >= Number(windowStart.getTime()) && nowTs <= Number(windowEnd.getTime()),
    windowStart,
    windowEnd,
  };
}

function resolveExpiredWindow(expiresAt: Date, windowMinutes: number, now: Date) {
  const start = new Date(expiresAt);
  const end = new Date(Number(start.getTime()) + windowMinutes * 60 * 1000);
  const nowTs = Number(now.getTime());
  return {
    shouldSend: nowTs >= Number(start.getTime()) && nowTs <= Number(end.getTime()),
    windowStart: start,
    windowEnd: end,
  };
}

function buildDedupeKey(vpnAccessId: string, type: ReminderType, channel: string, expiresAt: Date) {
  return `vpn:${vpnAccessId}:${channel}:${type}:${Number(new Date(expiresAt).getTime())}`;
}

async function ensureCustomerByEmail(email: string) {
  return prisma.customer.upsert({
    where: { email },
    update: {},
    create: { email },
  });
}

async function ensureNotificationPreference(customerId: string) {
  return prisma.customerNotificationPreference.upsert({
    where: { customerId },
    update: {},
    create: { customerId },
  });
}

async function getTelegramLink(customerId: string): Promise<ActiveTelegramLink | null> {
  const link = await prisma.telegramLink.findUnique({
    where: { customerId },
    select: {
      customerId: true,
      telegramId: true,
      isActive: true,
      lastError: true,
    },
  });
  if (!link) return null;
  return {
    customerId: link.customerId,
    telegramId: link.telegramId,
    isActive: link.isActive,
    lastError: link.lastError,
  };
}

async function sendTelegramEvent(input: {
  customerId: string;
  vpnAccessId: string;
  type: ReminderType;
  plan: string;
  expiresAt: Date;
  daysLeft?: number | null;
  windowStart: Date;
  windowEnd: Date;
  telegramLink: ActiveTelegramLink | null;
}) {
  const dedupeKey = buildDedupeKey(input.vpnAccessId, input.type, "telegram", input.expiresAt);
  const event = await prisma.customerNotificationEvent.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      customerId: input.customerId,
      vpnAccessId: input.vpnAccessId,
      type: input.type,
      channel: "telegram",
      dedupeKey,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      status: "pending",
      payload: {
        plan: input.plan,
        expiresAt: input.expiresAt,
        daysLeft: input.daysLeft ?? null,
      },
    },
  });

  if (event.status === "sent" || event.status === "skipped") return;
  if (event.attempts >= env.ACCOUNT_NOTIFY_MAX_ATTEMPTS) {
    await prisma.customerNotificationEvent.update({
      where: { id: event.id },
      data: {
        status: "skipped",
        lastError: `max_attempts_reached_${env.ACCOUNT_NOTIFY_MAX_ATTEMPTS}`,
      },
    });
    return;
  }

  if (!input.telegramLink || !input.telegramLink.isActive) {
    await prisma.customerNotificationEvent.update({
      where: { id: event.id },
      data: {
        status: "skipped",
        lastError: "no_channel_telegram",
      },
    });
    return;
  }

  const renewUrl = `${resolveSiteOrigin()}/store/vpn`;
  const text = buildTelegramReminderText({
    type: input.type,
    planName: input.plan,
    expiresAt: input.expiresAt,
    renewUrl,
  });

  const sendResult = await telegramSender.sendTextMessage({
    telegramId: input.telegramLink.telegramId,
    text,
  });

  const nextAttempts = event.attempts + 1;
  if (sendResult.ok) {
    await prisma.$transaction([
      prisma.customerNotificationEvent.update({
        where: { id: event.id },
        data: {
          attempts: nextAttempts,
          status: "sent",
          sentAt: new Date(),
          lastError: null,
        },
      }),
      prisma.telegramLink.updateMany({
        where: {
          customerId: input.customerId,
          isActive: true,
        },
        data: {
          lastError: null,
        },
      }),
    ]);
    return;
  }

  const terminal = !sendResult.retryable || nextAttempts >= env.ACCOUNT_NOTIFY_MAX_ATTEMPTS;
  await prisma.$transaction([
    prisma.customerNotificationEvent.update({
      where: { id: event.id },
      data: {
        attempts: nextAttempts,
        status: terminal ? "skipped" : "failed",
        lastError: `${sendResult.code}:${sendResult.description}`.slice(0, 900),
      },
    }),
    prisma.telegramLink.updateMany({
      where: {
        customerId: input.customerId,
        isActive: true,
      },
      data: {
        lastError: `${sendResult.code}:${sendResult.description}`.slice(0, 500),
        ...(sendResult.deactivateLink
          ? {
              isActive: false,
              unlinkedAt: new Date(),
            }
          : {}),
      },
    }),
  ]);
}

async function scanDueNotifications() {
  const now = new Date();
  const windowMs = env.ACCOUNT_NOTIFY_WINDOW_MINUTES * 60 * 1000;
  const horizonStart = new Date(Number(now.getTime()) - windowMs);
  const horizonEnd = new Date(Number(now.getTime()) + 7 * DAY_MS + windowMs);

  const accesses = await prisma.vpnAccess.findMany({
    where: {
      expiresAt: { gte: horizonStart, lte: horizonEnd },
      OR: [
        { email: { not: null } },
        {
          order: {
            is: {
              status: OrderStatus.PAID,
              email: { not: "" },
            },
          },
        },
      ],
    },
    include: {
      order: {
        select: {
          email: true,
          status: true,
        },
      },
    },
    orderBy: [{ expiresAt: "asc" }, { updatedAt: "desc" }],
    take: 2500,
  });

  const customerCache = new Map<string, Awaited<ReturnType<typeof ensureCustomerByEmail>>>();
  const prefCache = new Map<string, Awaited<ReturnType<typeof ensureNotificationPreference>>>();
  const telegramCache = new Map<string, ActiveTelegramLink | null>();

  for (const access of accesses) {
    const email = normalizeEmail(access.email || access.order?.email || "");
    if (!email) continue;

    let customer = customerCache.get(email);
    if (!customer) {
      customer = await ensureCustomerByEmail(email);
      customerCache.set(email, customer);
    }

    let pref = prefCache.get(customer.id);
    if (!pref) {
      pref = await ensureNotificationPreference(customer.id);
      prefCache.set(customer.id, pref);
    }

    if (!pref.emailEnabled) continue;

    let telegramLink = telegramCache.get(customer.id);
    if (telegramLink === undefined) {
      telegramLink = await getTelegramLink(customer.id);
      telegramCache.set(customer.id, telegramLink);
    }

    const expiresAt = new Date(access.expiresAt);
    const nowTs = Number(now.getTime());
    const expTs = Number(expiresAt.getTime());
    const daysLeft = Math.ceil((expTs - nowTs) / DAY_MS);

    for (const rule of REMINDER_RULES) {
      if (!access.isActive) continue;
      if (!pref[rule.prefKey]) continue;

      const match = resolveReminderWindow(expiresAt, rule.daysBefore, env.ACCOUNT_NOTIFY_WINDOW_MINUTES, now);
      if (!match.shouldSend) continue;

      await sendTelegramEvent({
        customerId: customer.id,
        vpnAccessId: access.id,
        type: rule.type,
        plan: access.plan,
        expiresAt,
        daysLeft: daysLeft >= 0 ? daysLeft : 0,
        windowStart: match.windowStart,
        windowEnd: match.windowEnd,
        telegramLink,
      });
    }

    if (pref.reminderExpired) {
      const expiredMatch = resolveExpiredWindow(expiresAt, env.ACCOUNT_NOTIFY_WINDOW_MINUTES, now);
      if (expiredMatch.shouldSend && (!access.isActive || expTs <= nowTs)) {
        await sendTelegramEvent({
          customerId: customer.id,
          vpnAccessId: access.id,
          type: "expired",
          plan: access.plan,
          expiresAt,
          daysLeft,
          windowStart: expiredMatch.windowStart,
          windowEnd: expiredMatch.windowEnd,
          telegramLink,
        });
      }
    }
  }
}

async function runCycle(reason: "startup" | "interval" | "manual" = "manual") {
  if (inProgress) return;
  inProgress = true;
  try {
    await scanDueNotifications();
  } catch (error) {
    console.error(`[account-notify] cycle failed (${reason})`, error);
  } finally {
    inProgress = false;
  }
}

export const accountNotificationsService = {
  async runOnce() {
    await runCycle("manual");
  },

  startScheduler() {
    if (!env.ACCOUNT_NOTIFICATIONS_ENABLED) {
      console.log("[account-notify] disabled by ACCOUNT_NOTIFICATIONS_ENABLED=false");
      return;
    }
    if (scheduler) return;

    console.log(
      `[account-notify] scheduler started. interval=${env.ACCOUNT_NOTIFY_SCAN_INTERVAL_MS}ms window=+/-${env.ACCOUNT_NOTIFY_WINDOW_MINUTES}m channel=telegram`
    );
    void runCycle("startup");
    scheduler = setInterval(() => {
      void runCycle("interval");
    }, env.ACCOUNT_NOTIFY_SCAN_INTERVAL_MS);
  },

  stopScheduler() {
    if (!scheduler) return;
    clearInterval(scheduler);
    scheduler = null;
  },
};

