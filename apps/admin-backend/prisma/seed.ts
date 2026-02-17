import { PrismaClient, RoleCode, OrderStatus, Currency, PaymentStatus, DiscountType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);

  const roles = [
    { code: RoleCode.OWNER, name: "Owner" },
    { code: RoleCode.ADMIN, name: "Admin" },
    { code: RoleCode.MANAGER, name: "Manager" },
    { code: RoleCode.SUPPORT, name: "Support" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      create: role,
      update: { name: role.name },
    });
  }

  const createDefaultUsers = String(process.env.SEED_CREATE_DEFAULT_USERS || "").toLowerCase() === "true";
  if (createDefaultUsers) {
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.OWNER } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.MANAGER } });
    const supportRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.SUPPORT } });

    const defaultUsers = [
      { email: "owner@gptishka.local", password: "OwnerPass!123", firstName: "Core", lastName: "Owner", roleId: ownerRole.id },
      { email: "admin@gptishka.local", password: "AdminPass!123", firstName: "Main", lastName: "Admin", roleId: adminRole.id },
      { email: "manager@gptishka.local", password: "ManagerPass!123", firstName: "Sales", lastName: "Manager", roleId: managerRole.id },
      { email: "support@gptishka.local", password: "SupportPass!123", firstName: "Help", lastName: "Desk", roleId: supportRole.id },
    ];

    for (const user of defaultUsers) {
      const passwordHash = await bcrypt.hash(user.password, rounds);
      await prisma.user.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          passwordHash,
          firstName: user.firstName,
          lastName: user.lastName,
          roleId: user.roleId,
        },
        update: {
          firstName: user.firstName,
          lastName: user.lastName,
          roleId: user.roleId,
        },
      });
    }
  }

  const products = [
    {
      slug: "chatgpt-plus-1m",
      title: "ChatGPT Plus - 1 месяц",
      titleEn: "ChatGPT Plus - 1 month",
      description: "Мгновенная активация ChatGPT Plus на 1 месяц",
      descriptionEn: "Instant activation for ChatGPT Plus for one month",
      price: 19.99,
      oldPrice: 24.99,
      currency: Currency.RUB,
      category: "Subscriptions",
      tags: ["chatgpt", "plus", "1m", "badge:best"],
      stock: 150,
    },
    {
      slug: "chatgpt-plus-1y",
      title: "ChatGPT Plus - 12 месяцев",
      titleEn: "ChatGPT Plus - 12 months",
      description: "Долгосрочный пакет со скидкой",
      descriptionEn: "Long-term package with discount",
      price: 199,
      oldPrice: 249,
      currency: Currency.RUB,
      category: "Subscriptions",
      tags: ["chatgpt", "plus", "1y", "badge:new"],
      stock: 40,
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        titleEn: p.titleEn,
        description: p.description,
        descriptionEn: p.descriptionEn,
        price: p.price,
        oldPrice: p.oldPrice,
        currency: p.currency,
        category: p.category,
        tags: p.tags,
        stock: p.stock,
      },
      update: {
        title: p.title,
        titleEn: p.titleEn,
        description: p.description,
        descriptionEn: p.descriptionEn,
        price: p.price,
        oldPrice: p.oldPrice,
        currency: p.currency,
        category: p.category,
        tags: p.tags,
        stock: p.stock,
        isActive: true,
        isArchived: false,
      },
    });
  }

  const existingOrders = await prisma.order.count();
  if (existingOrders === 0) {
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "chatgpt-plus-1m" } });
    const order = await prisma.order.create({
      data: {
        email: "buyer@example.com",
        status: OrderStatus.PAID,
        paymentMethod: "webmoney",
        paymentId: "wm_000001",
        country: "US",
        ip: "127.0.0.1",
        totalAmount: 19.99,
        currency: Currency.RUB,
        items: {
          create: {
            productId: product.id,
            productRaw: product.title,
            price: 19.99,
            quantity: 1,
          },
        },
      },
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "webmoney",
        providerRef: "wm_000001",
        status: PaymentStatus.SUCCESS,
        amount: 19.99,
        currency: Currency.RUB,
      },
    });
  }

  await prisma.promoCode.upsert({
    where: { code: "WELCOME10" },
    create: {
      code: "WELCOME10",
      discountType: DiscountType.PERCENT,
      discountValue: 10,
      discountPercent: 10,
      isActive: true,
    },
    update: {
      discountType: DiscountType.PERCENT,
      discountValue: 10,
      discountPercent: 10,
      isActive: true,
    },
  });

  process.stdout.write("[admin-backend] seed finished\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
