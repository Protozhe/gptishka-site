const { PrismaClient, ProductVisualBackgroundType } = require("@prisma/client");

const prisma = new PrismaClient();
const SERVICE_KEY = "suno";
const plans = [
  { key: "pro", slug: "suno-pro-1-month", name: "Pro", price: 1490, credits: "2 500" },
  { key: "premier", slug: "suno-premier-1-month", name: "Premier", price: 3290, credits: "10 000" },
];
const asset = "/assets/img/services/suno-card-v2.webp?v=20260824-suno-square2";
const hoverAsset = "/assets/img/services/suno-card-hover-v2.webp?v=20260824-suno-square2";

const infoSections = [
  { title: "Что входит в тарифы Suno", items: ["Pro: 2 500 кредитов в месяц и доступ к актуальным платным моделям.", "Premier: 10 000 кредитов в месяц и Suno Studio.", "Оба тарифа дают коммерческие права на новые композиции в рамках условий Suno.", "Функции и лимиты могут меняться на стороне Suno."] },
  { title: "Как проходит подключение", ordered: true, items: ["Выберите Pro или Premier на один месяц и оплатите заказ GPTishka.", "В своём аккаунте Suno откройте страницу оплаты того же тарифа, но не оплачивайте её самостоятельно.", "Скопируйте полную ссылку Stripe Checkout и отправьте её через защищённую форму после оплаты GPTishka.", "Менеджер проверит тариф и ссылку, завершит оплату Suno и сообщит о результате."] },
  { title: "Безопасность и поддержка", items: ["Логин, пароль и коды подтверждения нам не нужны.", "Форма проверяет формат ссылки; её принадлежность вашему тарифу менеджер проверяет вручную.", "Если ссылка истечёт или возникнет сложность, менеджер свяжется с вами по контакту из заказа."] },
];
const faqItems = [
  { question: "Что делать после оплаты GPTishka?", answer: "На следующей странице отправьте ссылку Stripe Checkout на тот же месячный тариф Suno. Менеджер проверит её и завершит подключение." },
  { question: "Чем отличается Pro от Premier?", answer: "Pro включает 2 500 кредитов в месяц. Premier включает 10 000 кредитов в месяц и Suno Studio. Актуальные функции определяет Suno." },
  { question: "Нужен ли логин или пароль?", answer: "Нет. Войдите в аккаунт Suno самостоятельно и отправьте только ссылку со страницы оплаты. Не передавайте пароль или коды подтверждения." },
  { question: "Почему ссылка может не подойти?", answer: "Платёжная сессия может истечь или вести на другой тариф. При необходимости менеджер попросит создать новую ссылку." },
  { question: "Какие способы оплаты GPTishka доступны?", answer: "Доступные способы показываются при оформлении. GPTishka не сохраняет данные банковской карты." },
];

async function printPlan() {
  const existing = await prisma.product.findMany({ where: { slug: { in: plans.map((plan) => plan.slug) } }, select: { slug: true, price: true, isActive: true } });
  console.log(JSON.stringify({ mode: "plan", requested: plans, existing, message: "No rows changed. Run with --apply to upsert only Suno records." }, null, 2));
}

async function apply(db) {
  const products = [];
  for (const plan of plans) {
    const title = `Suno ${plan.name} — 1 месяц`;
    const titleEn = `Suno ${plan.name} — 1 month`;
    const description = `Suno ${plan.name} на ваш аккаунт на один месяц (${plan.credits} кредитов). После оплаты GPTishka отправьте ссылку на оплату тарифа Suno; менеджер завершит подключение.`;
    const common = {
      title, titleEn, iconPngUrl: asset, description,
      descriptionEn: `One month of Suno ${plan.name} on your account (${plan.credits.replace(" ", ",")} credits). Submit the Suno checkout link after paying GPTishka; a manager completes activation.`,
      modalDescription: description,
      modalDescriptionEn: `After payment, submit the Suno checkout link. No account password is required.`,
      price: plan.price, currency: "RUB", category: "Подписки ИИ",
      tags: [SERVICE_KEY, plan.key, "month:1", "delivery:activation", `activation-pool:${plan.slug}`],
      activationVariants: {
        withoutLogin: { enabled: true, price: plan.price, deliveryType: "activation", activationSiteUrl: "" },
        withLogin: { enabled: false, price: plan.price, deliveryType: "manual_login", activationSiteUrl: "" },
      },
      isActive: true, isArchived: false,
    };
    const product = await db.product.upsert({ where: { slug: plan.slug }, create: { slug: plan.slug, ...common }, update: common });
    products.push(product);
    const visual = {
      cardTitle: title, cardDescription: description, imageUrl: asset, imageAlt: "Suno",
      hoverImageUrl: hoverAsset, hoverImageAlt: "Suno", backgroundType: ProductVisualBackgroundType.solid,
      backgroundColor: "#0b0712", buttonText: "Выбрать тариф", buttonStyle: "primary", isVisible: true,
    };
    await db.productVisualConfig.upsert({ where: { productId: product.id }, create: { productId: product.id, ...visual }, update: visual });
  }

  const pageFields = {
    path: "/suno", serviceKey: SERVICE_KEY, title: "Suno", titleEn: "Suno",
    heroEyebrow: "Тарифные планы", heroTitle: "Suno",
    heroDescription: "Выберите Pro или Premier на один месяц. После оплаты GPTishka отправьте ссылку на оплату того же тарифа Suno.",
    heroLogoUrl: asset, theme: "custom", accentColor: "#c026d3",
    accentGradient: "linear-gradient(135deg,#7c3aed,#db2777,#fb7185)",
    constructorTitle: "Suno", constructorDescription: "Выберите Pro или Premier на один месяц. После оплаты GPTishka отправьте ссылку Stripe Checkout со страницы оплаты того же тарифа в Suno.",
    infoSections, faqItems, sortOrder: 50, isActive: true, isIndexed: true,
  };
  const page = await db.servicePage.upsert({ where: { slug: SERVICE_KEY }, create: { slug: SERVICE_KEY, ...pageFields }, update: pageFields });
  for (const [index, product] of products.entries()) {
    await db.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } },
      create: { servicePageId: page.id, productId: product.id, sortOrder: (index + 1) * 10, isActive: true, isPinned: true },
      update: { sortOrder: (index + 1) * 10, isActive: true, isPinned: true },
    });
  }

  const aiSection = await db.productShowcaseSection.findUnique({ where: { slug: "подписки-ии" } });
  if (aiSection) {
    for (const [index, product] of products.entries()) {
      await db.productShowcasePlacement.upsert({
        where: { productId_sectionId: { productId: product.id, sectionId: aiSection.id } },
        create: { productId: product.id, sectionId: aiSection.id, sortOrder: 500 + index, isActive: true },
        update: { sortOrder: 500 + index, isActive: true },
      });
    }
  }
  const card = {
    title: "Suno", description: "Создание музыки и вокала с помощью AI",
    planSummary: "Pro / Premier · 1 месяц", priceText: "от 1 490 RUB", buttonText: "К тарифам", href: "/suno", iconText: "SU", theme: SERVICE_KEY,
    imageUrl: asset, imageAlt: "Suno", hoverImageUrl: hoverAsset, hoverImageAlt: "Suno",
    backgroundType: ProductVisualBackgroundType.solid, backgroundColor: "#0b0712", sortOrder: 50, isActive: true,
  };
  await db.productShowcaseServiceCard.upsert({ where: { serviceKey: SERVICE_KEY }, create: { serviceKey: SERVICE_KEY, ...card }, update: card });
  return { products: plans.map(({ slug, price }) => ({ slug, price })), page: page.path };
}

async function main() {
  if (!process.argv.includes("--apply")) return printPlan();
  console.log(JSON.stringify(await prisma.$transaction((db) => apply(db)), null, 2));
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}

module.exports = { plans, infoSections, faqItems, apply };
