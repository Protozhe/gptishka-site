import { PrismaClient, ProductVisualBackgroundType } from "@prisma/client";

const prisma = new PrismaClient();
const imageUrl = "/assets/img/services/gemini-card.webp?v=20260810-gemini1";
const hoverImageUrl = "/assets/img/services/gemini-card-hover.webp?v=20260810-gemini1";

const plans = [
  { slug: "gemini-pro-12-months", months: 12, price: 1500, sortOrder: 10 },
  { slug: "gemini-pro-18-months", months: 18, price: 2100, sortOrder: 20 },
];

const infoSections = [
  {
    title: "Что входит в Gemini Pro",
    text: "Расширенный тариф AI‑помощника Google на длительный период.",
    items: [
      "Доступ к возможностям и актуальным моделям тарифа Pro.",
      "Работа с текстом, изображениями, документами и другими файлами.",
      "Увеличенные лимиты и инструменты для исследования сложных тем.",
    ],
  },
  {
    title: "Выберите длительность",
    items: [
      "12 месяцев — 1 500 ₽.",
      "18 месяцев — 2 100 ₽.",
      "Нужный срок выбирается в конструкторе тарифа перед оформлением.",
    ],
  },
  {
    title: "Как проходит подключение",
    ordered: true,
    items: [
      "Выберите план Pro и длительность 12 или 18 месяцев.",
      "Перейдите к оформлению и укажите данные, запрошенные в форме.",
      "После подтверждения оплаты получите инструкцию и помощь с подключением.",
    ],
  },
  {
    title: "Поддержка и важные условия",
    items: [
      "Период подписки соответствует выбранному варианту: 12 или 18 месяцев.",
      "Функции, модели и лимиты могут меняться на стороне Google.",
      "GPTishka сопровождает заказ и помогает с вопросами по подключению.",
    ],
  },
];

const faqItems = [
  {
    question: "Какие варианты Gemini Pro доступны?",
    answer: "Доступны два варианта подписки: 12 месяцев за 1 500 ₽ и 18 месяцев за 2 100 ₽.",
  },
  {
    question: "Как выбрать длительность?",
    answer: "На странице Gemini выберите план Pro, затем нажмите 12 или 18 месяцев. Цена изменится автоматически.",
  },
  {
    question: "Что я получу после оплаты?",
    answer: "Gemini Pro на выбранный срок и помощь GPTishka с подключением тарифа.",
  },
  {
    question: "Что делать, если возник вопрос после оплаты?",
    answer: "Напишите в поддержку и укажите номер заказа — мы проверим статус и поможем разобраться.",
  },
];

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const legacy = await tx.product.findUnique({ where: { slug: "gemini-advanced" } });
    const existingTwelveMonth = await tx.product.findUnique({ where: { slug: plans[0].slug } });
    if (legacy && !existingTwelveMonth) {
      await tx.product.update({
        where: { id: legacy.id },
        data: { slug: plans[0].slug },
      });
    } else if (legacy) {
      await tx.product.update({
        where: { id: legacy.id },
        data: { isActive: false, isArchived: true },
      });
    }

    const products = [];
    for (const plan of plans) {
      const productData = {
        title: `Gemini Pro — ${plan.months} месяцев`,
        titleEn: `Gemini Pro — ${plan.months} months`,
        iconPngUrl: imageUrl,
        description: `Подписка Gemini Pro на ${plan.months} месяцев с помощью в подключении.`,
        descriptionEn: `Gemini Pro subscription for ${plan.months} months with activation assistance.`,
        modalDescription: `Gemini Pro\nСрок: ${plan.months} месяцев\nПодключение на ваш аккаунт\nПоддержка после оплаты`,
        modalDescriptionEn: `Gemini Pro\nDuration: ${plan.months} months\nActivation on your account\nPost-purchase support`,
        price: plan.price,
        oldPrice: null,
        currency: "RUB" as const,
        category: "Подписки ИИ",
        tags: ["gemini", "google-ai", "pro", `month:${plan.months}`, "badge:new"],
        stock: null,
        isActive: true,
        isArchived: false,
      };
      const product = await tx.product.upsert({
        where: { slug: plan.slug },
        create: { slug: plan.slug, ...productData },
        update: productData,
      });

      const visualData = {
        cardTitle: `Gemini Pro — ${plan.months} месяцев`,
        cardDescription: `${plan.months} месяцев · помощь с подключением`,
        imageUrl,
        imageAlt: "Gemini Pro",
        hoverImageUrl,
        hoverImageAlt: "Gemini Pro",
        backgroundType: ProductVisualBackgroundType.solid,
        backgroundColor: "#070b18",
        backgroundGradient: "",
        textColor: "",
        buttonText: "Выбрать тариф",
        buttonStyle: "primary",
        buttonBackground: "",
        buttonTextColor: "",
        isVisible: true,
      };
      await tx.productVisualConfig.upsert({
        where: { productId: product.id },
        create: { productId: product.id, ...visualData },
        update: visualData,
      });
      products.push({ product, plan });
    }

    const pageData = {
      path: "/gemini",
      serviceKey: "gemini",
      title: "Gemini",
      titleEn: "Gemini",
      heroEyebrow: "Тарифные планы",
      heroTitle: "Gemini Pro",
      heroDescription: "Gemini Pro для работы с текстом, файлами, идеями и сложными задачами. Выберите подписку на 12 или 18 месяцев.",
      heroLogoUrl: imageUrl,
      theme: "custom",
      accentColor: "#4285f4",
      accentGradient: "linear-gradient(135deg,#4285f4,#a855f7 58%,#ea4335)",
      darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.62))",
      colorOverlay: "linear-gradient(135deg,rgba(66,133,244,.3),rgba(168,85,247,.2),rgba(0,0,0,.28))",
      constructorTitle: "Gemini Pro",
      constructorDescription: "Выберите план Pro на 12 или 18 месяцев. Конструктор сразу покажет итоговую стоимость и откроет оформление выбранного варианта.",
      infoSections,
      faqItems,
      sortOrder: 50,
      isActive: true,
      isIndexed: true,
    };
    const page = await tx.servicePage.upsert({
      where: { slug: "gemini" },
      create: { slug: "gemini", ...pageData },
      update: pageData,
    });

    for (const { product, plan } of products) {
      await tx.servicePageProductPlacement.upsert({
        where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } },
        create: { servicePageId: page.id, productId: product.id, sortOrder: plan.sortOrder, isActive: true, isPinned: true },
        update: { sortOrder: plan.sortOrder, isActive: true, isPinned: true },
      });
    }

    const serviceCardData = {
      title: "Gemini",
      description: "Gemini Pro для работы, учёбы, анализа и творчества.",
      planSummary: "Pro · 12 или 18 месяцев",
      priceText: "от 1 500 RUB",
      buttonText: "К тарифу",
      href: "/gemini",
      iconText: "GM",
      theme: "gemini",
      imageUrl,
      imageAlt: "Gemini — тёмный логотип",
      hoverImageUrl,
      hoverImageAlt: "Gemini — светлый логотип",
      backgroundType: ProductVisualBackgroundType.solid,
      backgroundColor: "#070b18",
      backgroundGradient: "",
      textColor: "",
      buttonBackground: "",
      buttonTextColor: "",
      sortOrder: 50,
      isActive: true,
    };
    await tx.productShowcaseServiceCard.upsert({
      where: { serviceKey: "gemini" },
      create: { serviceKey: "gemini", ...serviceCardData },
      update: serviceCardData,
    });

    return {
      page: page.path,
      products: products.map(({ product }) => ({ slug: product.slug, price: String(product.price) })),
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
