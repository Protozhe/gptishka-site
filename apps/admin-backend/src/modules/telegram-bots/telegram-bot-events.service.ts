import { prisma } from "../../config/prisma";
import { activationStore } from "../orders/activation.store";

export type TelegramBotEventInput = {
  botType: string;
  eventType: string;
  orderId?: string | null;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  telegramChatId?: string | null;
  messageText?: string | null;
  callbackData?: string | null;
  meta?: Record<string, unknown> | null;
};

export const telegramBotEventsService = {
  async log(input: TelegramBotEventInput) {
    const botType = String(input.botType || "").trim().toLowerCase();
    const eventType = String(input.eventType || "").trim().toLowerCase();
    if (!botType || !eventType) return;

    try {
      await (prisma as any).telegramBotEvent.create({
        data: {
          botType,
          eventType,
          orderId: input.orderId ? String(input.orderId) : null,
          telegramUserId: input.telegramUserId ? String(input.telegramUserId) : null,
          telegramUsername: input.telegramUsername ? String(input.telegramUsername) : null,
          telegramChatId: input.telegramChatId ? String(input.telegramChatId) : null,
          messageText: input.messageText ? String(input.messageText).slice(0, 500) : null,
          callbackData: input.callbackData ? String(input.callbackData).slice(0, 500) : null,
          meta: input.meta || null,
        },
      });
    } catch (error) {
      console.warn("[tg-bot] failed to persist event", error);
    }
  },

  async getOverview(input: { botType?: string; days?: number }) {
    const days = Math.max(1, Math.min(30, Number(input.days || 7)));
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = {
      createdAt: { gte: from },
      ...(input.botType ? { botType: input.botType } : {}),
    };

    const [totalEvents, uniqueUsers, byEvent, byBot, recentOrders, funnelEvents] = await Promise.all([
      (prisma as any).telegramBotEvent.count({ where }),
      (prisma as any).telegramBotEvent.groupBy({ by: ["telegramUserId"], where, _count: { _all: true } }),
      (prisma as any).telegramBotEvent.groupBy({ by: ["eventType"], where, _count: { _all: true } }),
      (prisma as any).telegramBotEvent.groupBy({ by: ["botType"], where, _count: { _all: true } }),
      prisma.order.findMany({
        where: {
          source: "telegram",
          ...(input.botType ? { botType: input.botType } : {}),
          createdAt: { gte: from },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          status: true,
          source: true,
          botType: true,
          email: true,
          totalAmount: true,
          discountAmount: true,
          promoCodeSnapshot: true,
          currency: true,
          telegramUserId: true,
          telegramUsername: true,
          telegramChatId: true,
          telegramLastError: true,
          createdAt: true,
          updatedAt: true,
          items: { select: { productRaw: true }, take: 1 },
          payments: { select: { status: true, provider: true, processedAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      (prisma as any).telegramBotEvent.findMany({
        where,
        select: { telegramUserId: true, eventType: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 5000,
      }),
    ]);

    const ids = recentOrders.map((o: any) => o.id);
    const activationMap = activationStore.findByOrderIds(ids);

    const perUser = new Map<string, Set<string>>();
    for (const e of funnelEvents as Array<any>) {
      const uid = String(e.telegramUserId || "").trim();
      if (!uid) continue;
      if (!perUser.has(uid)) perUser.set(uid, new Set<string>());
      perUser.get(uid)!.add(String(e.eventType || ""));
    }
    const funnel = { start: 0, buyIntent: 0, orderCreated: 0, paymentConfirmed: 0, activationSuccess: 0, activationFailed: 0 };
    for (const events of perUser.values()) {
      if (events.has("start")) funnel.start += 1;
      if (events.has("prepayment_agreement") || events.has("buy_click") || events.has("buy_menu")) funnel.buyIntent += 1;
      if (events.has("order_created")) funnel.orderCreated += 1;
      if (events.has("payment_confirmed")) funnel.paymentConfirmed += 1;
      if (events.has("activation_success")) funnel.activationSuccess += 1;
      if (events.has("activation_failed") || events.has("activation_start_failed") || events.has("token_rejected")) funnel.activationFailed += 1;
    }

    return {
      rangeDays: days,
      totalEvents,
      uniqueUsers: uniqueUsers.filter((x: any) => x.telegramUserId).length,
      byEvent: byEvent
        .map((x: any) => ({ eventType: x.eventType, count: x._count._all }))
        .sort((a: any, b: any) => b.count - a.count),
      byBot: byBot
        .map((x: any) => ({ botType: x.botType, count: x._count._all }))
        .sort((a: any, b: any) => b.count - a.count),
      funnel,
      recentOrders: recentOrders.map((order: any) => {
        const activation = activationMap.get(order.id) || null;
        return {
          id: order.id,
          status: order.status,
          source: order.source,
          botType: order.botType,
          email: order.email,
          totalAmount: Number(order.totalAmount),
          discountAmount: Number(order.discountAmount || 0),
          promoCode: order.promoCodeSnapshot || null,
          currency: order.currency,
          telegramUserId: order.telegramUserId,
          telegramUsername: order.telegramUsername,
          telegramChatId: order.telegramChatId,
          telegramLastError: order.telegramLastError,
          productTitle: String(order.items[0]?.productRaw || ""),
          paymentStatus: order.payments[0]?.status || null,
          paymentProvider: order.payments[0]?.provider || null,
          paidAt: order.payments[0]?.processedAt || null,
          activationStatus: activation?.status || null,
          activationMessage: activation?.lastProviderMessage || null,
          activationCdk: activation?.cdk || null,
          activationTokenFingerprint: activation?.tokenMeta?.fingerprint || null,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        };
      }),
    };
  },

  async listEvents(input: { botType?: string; eventType?: string; limit?: number }) {
    const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
    return (prisma as any).telegramBotEvent.findMany({
      where: {
        ...(input.botType ? { botType: input.botType } : {}),
        ...(input.eventType ? { eventType: input.eventType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async listUsers(input: { botType?: string; days?: number; limit?: number }) {
    const days = Math.max(1, Math.min(30, Number(input.days || 7)));
    const limit = Math.max(1, Math.min(300, Number(input.limit || 100)));
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await (prisma as any).telegramBotEvent.findMany({
      where: {
        createdAt: { gte: from },
        ...(input.botType ? { botType: input.botType } : {}),
      },
      select: {
        createdAt: true,
        botType: true,
        eventType: true,
        telegramUserId: true,
        telegramUsername: true,
        orderId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const userMap = new Map<string, any>();
    for (const r of rows as Array<any>) {
      const uid = String(r.telegramUserId || "").trim();
      if (!uid) continue;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          telegramUserId: uid,
          telegramUsername: r.telegramUsername || null,
          botType: r.botType || null,
          firstSeenAt: r.createdAt,
          lastSeenAt: r.createdAt,
          events: 0,
          orderCreated: 0,
          paymentConfirmed: 0,
          activationSuccess: 0,
          activationFailed: 0,
          lastOrderId: r.orderId || null,
        });
      }
      const x = userMap.get(uid);
      x.events += 1;
      if (r.createdAt < x.firstSeenAt) x.firstSeenAt = r.createdAt;
      if (r.createdAt > x.lastSeenAt) x.lastSeenAt = r.createdAt;
      if (r.telegramUsername && !x.telegramUsername) x.telegramUsername = r.telegramUsername;
      if (r.orderId) x.lastOrderId = r.orderId;
      if (r.eventType === "order_created") x.orderCreated += 1;
      if (r.eventType === "payment_confirmed") x.paymentConfirmed += 1;
      if (r.eventType === "activation_success") x.activationSuccess += 1;
      if (["activation_failed", "activation_start_failed", "token_rejected"].includes(String(r.eventType || ""))) x.activationFailed += 1;
    }

    const items = Array.from(userMap.values())
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
      .slice(0, limit);
    return { rangeDays: days, items };
  },

  async userTimeline(input: { botType?: string; telegramUserId: string; limit?: number }) {
    const limit = Math.max(1, Math.min(300, Number(input.limit || 100)));
    return (prisma as any).telegramBotEvent.findMany({
      where: {
        telegramUserId: String(input.telegramUserId || ""),
        ...(input.botType ? { botType: input.botType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};
