/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function telegramId(value) {
  const normalized = String(value || "").trim();
  return /^-?\d+$/.test(normalized) ? normalized : "";
}

function telegramUsername(value) {
  const normalized = String(value || "").trim().replace(/^@+/, "");
  return /^[a-z0-9_]{5,32}$/i.test(normalized) ? normalized : null;
}

function resolveContext(order) {
  const match = String(order.email || "")
    .trim()
    .toLowerCase()
    .match(/^tg_(claude|chatgpt|grok)_(-?\d+)@(?:gptishka\.)?telegram\.local$/);
  const contact = record(record(order.orderDetails).contact);
  const userId = telegramId(contact.telegramUserId || contact.telegramId || match?.[2]);
  if (!userId) return null;
  return {
    source: "telegram",
    botType: match?.[1] || order.botType || null,
    telegramUserId: userId,
    telegramChatId: telegramId(contact.telegramChatId) || userId,
    telegramUsername: telegramUsername(contact.telegramUsername) || order.telegramUsername || null,
  };
}

async function main() {
  const appDir = process.argv[2] || process.cwd();
  const envPath = process.argv[3] || path.join(appDir, "apps", "admin-backend", ".env");
  dotenv.config({ path: envPath });
  if (!process.env.DATABASE_URL) throw new Error(`Missing DATABASE_URL in ${envPath}`);

  const prisma = new PrismaClient();
  try {
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { email: { startsWith: "tg_", mode: "insensitive" } },
          { telegramUserId: { not: null } },
        ],
      },
      select: {
        id: true,
        email: true,
        source: true,
        botType: true,
        telegramUserId: true,
        telegramUsername: true,
        telegramChatId: true,
        orderDetails: true,
      },
      take: 10000,
    });

    let updated = 0;
    for (const order of orders) {
      const context = resolveContext(order);
      if (!context) continue;
      if (
        order.source === context.source &&
        order.botType === context.botType &&
        order.telegramUserId === context.telegramUserId &&
        order.telegramChatId === context.telegramChatId &&
        order.telegramUsername === context.telegramUsername
      ) continue;
      await prisma.order.update({ where: { id: order.id }, data: context });
      updated += 1;
    }
    console.log(`Telegram order context backfill updated: ${updated}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
