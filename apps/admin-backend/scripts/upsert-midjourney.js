const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SERVICE_KEY = "midjourney";
const plans = [
  { key: "basic", slug: "midjourney-basic-1", name: "Basic", price: 1190 },
  { key: "standard", slug: "midjourney-standard-1", name: "Standard", price: 3349 },
  { key: "pro", slug: "midjourney-pro-1", name: "Pro", price: 6590 },
];
const slugs = plans.map((plan) => plan.slug);
const imageUrl = "/assets/img/services/midjourney-card-v1.svg";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--rollback") ? "rollback" : "plan";

async function printPlan() {
  const [products, page, card, aiSection, activeSections] = await Promise.all([
    prisma.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, price: true, isActive: true } }),
    prisma.servicePage.findUnique({ where: { slug: SERVICE_KEY }, select: { id: true, path: true, isActive: true } }),
    prisma.productShowcaseServiceCard.findUnique({ where: { serviceKey: SERVICE_KEY }, select: { id: true, href: true, isActive: true } }),
    prisma.productShowcaseSection.findUnique({ where: { slug: "подписки-ии" }, select: { id: true, slug: true, showOnHomepage: true, showInCatalog: true } }),
    prisma.productShowcaseSection.count({ where: { isActive: true } }),
  ]);
  console.log(JSON.stringify({
    mode: "plan",
    requested: plans,
    existing: { products, page, card, aiSection, activeSections },
    message: "No rows changed. Use --apply to upsert only Midjourney records.",
  }, null, 2));
}

async function apply(db) {
  const products = [];
  for (const plan of plans) {
    const title = `Midjourney ${plan.name} — 1 месяц`;
    const titleEn = `Midjourney ${plan.name} — 1 month`;
    const description = `Подписка Midjourney ${plan.name} на один месяц на ваш аккаунт. После оплаты заказа отправьте ссылку Stripe Checkout через защищённую форму; менеджер оплатит подписку.`;
    const common = {
      title,
      titleEn,
      description,
      descriptionEn: `One month of Midjourney ${plan.name} on your account. Submit your Stripe Checkout link after paying GPTishka; a manager completes the subscription payment.`,
      modalDescription: description,
      modalDescriptionEn: `After payment, submit your Midjourney Stripe Checkout link. No account password is required.`,
      price: plan.price,
      currency: "RUB",
      category: "Подписки ИИ",
      tags: [
        SERVICE_KEY,
        plan.key,
        "month:1",
        "delivery:activation",
        `activation-pool:${plan.slug}`,
        "align:title:center",
        "align:description:center",
        "align:price:center",
        "align:duration:center",
        "align:features:center",
        "align:meta:center",
      ],
      activationVariants: {
        withoutLogin: { enabled: true, price: plan.price, deliveryType: "activation", activationSiteUrl: "" },
        withLogin: { enabled: false, price: plan.price, deliveryType: "manual_login", activationSiteUrl: "" },
      },
      isActive: true,
      isArchived: false,
    };
    const product = await db.product.upsert({
      where: { slug: plan.slug },
      create: { slug: plan.slug, ...common },
      update: common,
    });
    products.push(product);
    const visual = {
      cardTitle: title,
      cardDescription: description,
      imageUrl,
      imageAlt: "Midjourney",
      backgroundType: "solid",
      backgroundColor: "#142335",
      buttonText: "Выбрать тариф",
      buttonStyle: "primary",
      isVisible: true,
    };
    await db.productVisualConfig.upsert({
      where: { productId: product.id },
      create: { productId: product.id, ...visual },
      update: visual,
    });
  }

  const page = await db.servicePage.upsert({
    where: { slug: SERVICE_KEY },
    create: {
      slug: SERVICE_KEY,
      path: "/midjourney",
      serviceKey: SERVICE_KEY,
      title: "Midjourney",
      titleEn: "Midjourney",
      heroEyebrow: "Тарифные планы",
      heroTitle: "Midjourney",
      heroDescription: "Генерация изображений и видео с помощью Midjourney.",
      heroImageUrl: imageUrl,
      theme: "midjourney-navy",
      accentColor: "#7ad9f8",
      accentGradient: "linear-gradient(135deg,#8be7ff,#5197d5,#253e83)",
      darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))",
      colorOverlay: "linear-gradient(135deg,rgba(77,165,215,.28),rgba(24,46,99,.28),rgba(0,0,0,.32))",
      constructorTitle: "Midjourney",
      constructorDescription: "Выберите Basic, Standard или Pro на один месяц. После оплаты заказа отправьте ссылку на оплату тарифа Midjourney — менеджер завершит подключение.",
      paymentCaptionLava: "LAVA",
      paymentCaptionEnot: "ENOT",
      isActive: true,
      isIndexed: true,
      sortOrder: 65,
    },
    update: {
      path: "/midjourney",
      serviceKey: SERVICE_KEY,
      heroImageUrl: imageUrl,
      isActive: true,
      isIndexed: true,
    },
  });
  for (const [index, product] of products.entries()) {
    await db.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } },
      create: { servicePageId: page.id, productId: product.id, sortOrder: (index + 1) * 10, isActive: true },
      update: { sortOrder: (index + 1) * 10, isActive: true },
    });
  }
  const aiSection = await db.productShowcaseSection.findUnique({ where: { slug: "подписки-ии" } });
  const activeSections = await db.productShowcaseSection.count({ where: { isActive: true } });
  if (!aiSection && activeSections > 0) {
    throw new Error("Active showcase sections exist, but the AI section 'подписки-ии' was not found; no product was placed.");
  }
  if (aiSection && (!aiSection.isActive || !aiSection.showOnHomepage || !aiSection.showInCatalog)) {
    throw new Error("The existing AI showcase section is not enabled for both homepage and catalog.");
  }
  if (aiSection) {
    for (const [index, product] of products.entries()) {
      await db.productShowcasePlacement.upsert({
        where: { productId_sectionId: { productId: product.id, sectionId: aiSection.id } },
        create: { productId: product.id, sectionId: aiSection.id, sortOrder: 650 + index, isActive: true },
        update: { sortOrder: 650 + index, isActive: true },
      });
    }
  }
  const card = {
    title: "Midjourney",
    description: "Генерация изображений и видео",
    planSummary: "Basic / Standard / Pro · 1 месяц",
    priceText: "от 1 190 RUB",
    buttonText: "К тарифам",
    href: "/midjourney",
    iconText: "MJ",
    theme: SERVICE_KEY,
    imageUrl,
    imageAlt: "Midjourney",
    backgroundType: "solid",
    backgroundColor: "#142335",
    isActive: true,
    sortOrder: 65,
  };
  await db.productShowcaseServiceCard.upsert({
    where: { serviceKey: SERVICE_KEY },
    create: { serviceKey: SERVICE_KEY, ...card },
    update: card,
  });
  console.log(`[midjourney] ready: ${slugs.join(", ")}`);
}

async function rollback() {
  const products = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, _count: { select: { orderItems: true, licenseKeys: true } } },
  });
  const ordered = products.filter((product) => product._count.orderItems > 0);
  if (ordered.length) throw new Error(`Rollback refused: products have orders (${ordered.map((item) => item.slug).join(", ")})`);
  const stocked = products.filter((product) => product._count.licenseKeys > 0);
  if (stocked.length) throw new Error(`Rollback refused: product pools contain keys (${stocked.map((item) => item.slug).join(", ")})`);
  await prisma.$transaction(async (db) => {
    const card = await db.productShowcaseServiceCard.findUnique({ where: { serviceKey: SERVICE_KEY }, select: { id: true } });
    if (card) await db.productShowcaseServiceCard.delete({ where: { id: card.id } });
    const page = await db.servicePage.findUnique({ where: { slug: SERVICE_KEY }, select: { id: true } });
    if (page) await db.servicePage.delete({ where: { id: page.id } });
    for (const product of products) await db.product.delete({ where: { id: product.id } });
  });
  console.log("[midjourney] rolled back exact Midjourney rows");
}

async function main() {
  if (mode === "plan") return printPlan();
  if (mode === "rollback") return rollback();
  return prisma.$transaction((db) => apply(db));
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}

module.exports = { apply, plans };
