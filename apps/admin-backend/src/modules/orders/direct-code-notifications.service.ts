import { prisma } from "../../config/prisma";
import { telegramSender } from "../telegram/telegram.sender";

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildMessage(input: { orderId: string; productTitle: string; code: string }) {
  return [
    "Оплата подтверждена ✅",
    "",
    input.productTitle || "Цифровой товар",
    `Заказ: ${input.orderId}`,
    "",
    "Ваш код:",
    input.code,
    "",
    "Сохраните это сообщение. Инструкция по активации доступна на странице товара.",
  ].join("\n");
}

export async function sendDirectCodeTelegram(input: {
  orderId: string;
  email: string;
  productTitle: string;
  code: string;
}) {
  const orderId = String(input.orderId || "").trim();
  const email = normalizeEmail(input.email);
  const code = String(input.code || "").trim();
  if (!orderId || !email || !code) return { sent: false as const, reason: "invalid_payload" as const };

  const customer = await prisma.customer.upsert({
    where: { email },
    update: {},
    create: { email },
    include: { telegramLink: true },
  });
  const dedupeKey = `order:${orderId}:telegram:direct-code`;
  const event = await prisma.customerNotificationEvent.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      customerId: customer.id,
      type: "direct_code_delivery",
      channel: "telegram",
      dedupeKey,
      status: "pending",
      payload: {
        orderId,
        productTitle: String(input.productTitle || "").trim(),
      },
    },
  });

  if (event.status === "sent") return { sent: true as const, duplicate: true as const };
  const link = customer.telegramLink;
  if (!link?.isActive || !String(link.telegramId || "").trim()) {
    await prisma.customerNotificationEvent.update({
      where: { id: event.id },
      data: { status: "skipped", lastError: "no_linked_telegram" },
    });
    return { sent: false as const, reason: "no_linked_telegram" as const };
  }

  const result = await telegramSender.sendTextMessage({
    telegramId: link.telegramId,
    text: buildMessage({
      orderId,
      productTitle: String(input.productTitle || "").trim(),
      code,
    }),
  });
  const attempts = event.attempts + 1;

  if (result.ok) {
    await prisma.$transaction([
      prisma.customerNotificationEvent.update({
        where: { id: event.id },
        data: { status: "sent", sentAt: new Date(), attempts, lastError: null },
      }),
      prisma.telegramLink.update({
        where: { customerId: customer.id },
        data: { lastError: null },
      }),
    ]);
    return { sent: true as const, duplicate: false as const };
  }

  await prisma.$transaction([
    prisma.customerNotificationEvent.update({
      where: { id: event.id },
      data: {
        status: result.retryable ? "failed" : "skipped",
        attempts,
        lastError: `${result.code}:${result.description}`.slice(0, 900),
      },
    }),
    prisma.telegramLink.update({
      where: { customerId: customer.id },
      data: {
        lastError: `${result.code}:${result.description}`.slice(0, 500),
        ...(result.deactivateLink ? { isActive: false, unlinkedAt: new Date() } : {}),
      },
    }),
  ]);
  return { sent: false as const, reason: result.code };
}
