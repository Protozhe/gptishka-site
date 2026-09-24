const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PRODUCT_SLUGS = ["devin-pro-1", "devin-max-1", "devin-teams-1"];
const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--rollback")
    ? "rollback"
    : "plan";

const plans = [
  {
    slug: "devin-pro-1",
    title: "Devin Pro — 1 месяц",
    titleEn: "Devin Pro — 1 month",
    plan: "pro",
    price: 2499,
    description: "Devin Pro на один месяц для индивидуальной работы с кодом, репозиториями и задачами разработки.",
  },
  {
    slug: "devin-max-1",
    title: "Devin Max — 1 месяц",
    titleEn: "Devin Max — 1 month",
    plan: "max",
    price: 24990,
    description: "Devin Max на один месяц для интенсивной работы с повышенными лимитами.",
  },
  {
    slug: "devin-teams-1",
    title: "Devin Teams — 1 месяц",
    titleEn: "Devin Teams — 1 month",
    plan: "teams",
    price: 14990,
    description: "Devin Teams на один месяц для совместной работы; в стоимость входит один полный пользователь.",
  },
];

async function applyChanges(db) {
  const createdProducts = [];
  for (const plan of plans) {
    const common = {
      title: plan.title,
      titleEn: plan.titleEn,
      description: plan.description,
      descriptionEn: `${plan.titleEn} with assisted activation on your Devin account.`,
      modalDescription: `${plan.title}\nПосле оплаты GPTishka откройте страницу оплаты того же тарифа в своём аккаунте Devin и отправьте ссылку Stripe Checkout.\nЛогин, пароль и коды 2FA не нужны. Не оплачивайте подписку самостоятельно.`,
      modalDescriptionEn: `${plan.titleEn}\nAfter paying GPTishka, submit the Stripe Checkout link for the same plan from your Devin account. No login or password is needed.`,
      price: plan.price,
      currency: "RUB",
      category: "Подписки ИИ",
      tags: [
        "devin",
        "cognition-ai",
        plan.plan,
        "month:1",
        "delivery:manual_login",
        "align:title:center",
        "align:description:center",
        "align:price:center",
        "align:duration:center",
        "align:features:center",
        "align:meta:center",
      ],
      activationVariants: {
        withLogin: { enabled: true, price: plan.price, deliveryType: "manual_login", activationSiteUrl: "" },
        withoutLogin: { enabled: false, price: plan.price, deliveryType: "activation", activationSiteUrl: "" },
      },
      isActive: true,
      isArchived: false,
    };

    const product = await db.product.upsert({
      where: { slug: plan.slug },
      create: { slug: plan.slug, ...common },
      update: common,
    });
    createdProducts.push(product);

    await db.productVisualConfig.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        cardTitle: plan.title,
        cardDescription: plan.description,
        imageUrl: "/assets/img/services/devin-card-v2.webp?v=20260922-devin2",
        imageAlt: plan.title,
        backgroundType: "solid",
        backgroundColor: "#051326",
        buttonText: "Выбрать тариф",
        buttonStyle: "primary",
        isVisible: true,
      },
      update: {
        cardTitle: plan.title,
        cardDescription: plan.description,
        imageUrl: "/assets/img/services/devin-card-v2.webp?v=20260922-devin2",
        imageAlt: plan.title,
        backgroundType: "solid",
        backgroundColor: "#051326",
        buttonText: "Выбрать тариф",
        buttonStyle: "primary",
        isVisible: true,
      },
    });
  }

  const servicePage = await db.servicePage.upsert({
    where: { slug: "devin" },
    create: {
      slug: "devin",
      path: "/devin",
      serviceKey: "devin",
      title: "Devin",
      titleEn: "Devin",
      heroEyebrow: "Тарифные планы",
      heroTitle: "Devin",
      heroDescription: "AI-инженер для кода, репозиториев и задач разработки.",
      heroImageUrl: "/assets/img/services/devin-card-v2.webp?v=20260922-devin2",
      theme: "devin-blue",
      accentColor: "#49bfff",
      accentGradient: "linear-gradient(135deg,#68d8ff,#168ee7,#1846a6)",
      darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))",
      colorOverlay: "linear-gradient(135deg,rgba(48,177,255,.28),rgba(26,72,180,.22),rgba(0,0,0,.28))",
      constructorTitle: "Devin",
      constructorDescription: "Выберите Pro, Max или Teams. После оплаты отправьте ссылку Stripe Checkout на выбранный тариф; мы оплатим подписку и сообщим о результате.",
      paymentCaptionLava: "LAVA",
      paymentCaptionEnot: "ENOT",
      isActive: true,
      isIndexed: true,
      sortOrder: 60,
    },
    update: {
      path: "/devin",
      serviceKey: "devin",
      heroImageUrl: "/assets/img/services/devin-card-v2.webp?v=20260922-devin2",
      isActive: true,
      isIndexed: true,
    },
  });

  let sortOrder = 10;
  for (const product of createdProducts) {
    await db.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId: servicePage.id, productId: product.id } },
      create: { servicePageId: servicePage.id, productId: product.id, sortOrder, isActive: true },
      update: { sortOrder, isActive: true },
    });
    sortOrder += 10;
  }

  await db.productShowcaseServiceCard.upsert({
    where: { serviceKey: "devin" },
    create: {
      serviceKey: "devin",
      title: "Devin",
      description: "AI-инженер для кода и задач разработки",
      planSummary: "Pro / Max / Teams · 1 месяц",
      priceText: "от 2 499 RUB",
      buttonText: "К тарифам",
      href: "/devin",
      iconText: "DV",
      theme: "devin",
      imageUrl: "/assets/img/services/devin-card-v2.webp?v=20260922-devin2",
      imageAlt: "Devin",
      backgroundType: "solid",
      backgroundColor: "#051326",
      isActive: true,
      sortOrder: 60,
    },
    update: {
      title: "Devin",
      description: "AI-инженер для кода и задач разработки",
      planSummary: "Pro / Max / Teams · 1 месяц",
      priceText: "от 2 499 RUB",
      buttonText: "К тарифам",
      href: "/devin",
      iconText: "DV",
      theme: "devin",
      imageUrl: "/assets/img/services/devin-card-v2.webp?v=20260922-devin2",
      imageAlt: "Devin",
      backgroundType: "solid",
      backgroundColor: "#051326",
      isActive: true,
      sortOrder: 60,
    },
  });

  console.log(`[devin] ready: ${createdProducts.map((item) => item.slug).join(", ")}`);
}

async function printPlan() {
  const [products, page, card] = await Promise.all([
    prisma.product.findMany({ where: { slug: { in: PRODUCT_SLUGS } }, select: { slug: true, price: true, isActive: true } }),
    prisma.servicePage.findUnique({ where: { slug: "devin" }, select: { id: true, path: true, isActive: true } }),
    prisma.productShowcaseServiceCard.findUnique({ where: { serviceKey: "devin" }, select: { id: true, href: true, isActive: true } }),
  ]);
  console.log(JSON.stringify({
    mode: "plan",
    message: "No rows were changed. Re-run with --apply to upsert only the Devin records.",
    requested: plans.map(({ slug, title, price }) => ({ slug, title, price })),
    existing: { products, page, card },
  }, null, 2));
}

async function rollback() {
  const products = await prisma.product.findMany({
    where: { slug: { in: PRODUCT_SLUGS } },
    select: { id: true, slug: true, _count: { select: { orderItems: true } } },
  });
  const ordered = products.filter((product) => product._count.orderItems > 0);
  if (ordered.length) {
    throw new Error(`Rollback refused: Devin products have orders (${ordered.map((item) => item.slug).join(", ")})`);
  }

  await prisma.$transaction(async (db) => {
    const card = await db.productShowcaseServiceCard.findUnique({ where: { serviceKey: "devin" }, select: { id: true } });
    if (card) await db.productShowcaseServiceCard.delete({ where: { id: card.id } });
    const page = await db.servicePage.findUnique({ where: { slug: "devin" }, select: { id: true } });
    if (page) await db.servicePage.delete({ where: { id: page.id } });
    for (const product of products) {
      await db.product.delete({ where: { id: product.id } });
    }
  });
  console.log(`[devin] rolled back: ${products.map((item) => item.slug).join(", ") || "no matching rows"}`);
}

async function main() {
  if (mode === "plan") return printPlan();
  if (mode === "rollback") return rollback();
  return prisma.$transaction((db) => applyChanges(db));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect());
