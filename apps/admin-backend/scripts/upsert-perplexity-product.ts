import { PrismaClient, ProductVisualBackgroundType } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_SLUG = "perplexity-pro";
const PAGE_SLUG = "perplexity";

const infoSections = [
  {
    title: "Что входит в Perplexity Pro",
    text: "Расширенный тариф для поиска, исследований и работы с источниками.",
    items: [
      "Расширенный доступ к Pro Search и более глубокому поиску по интернету.",
      "Выбор современных моделей от OpenAI, Anthropic и других разработчиков прямо внутри Perplexity.",
      "Расширенные лимиты на загрузку и анализ файлов и изображений.",
      "Доступ к Research, генерации изображений и функциям создания файлов и приложений в пределах лимитов тарифа.",
    ],
  },
  {
    title: "Для каких задач подходит",
    text: "Perplexity Pro объединяет поиск, анализ и ссылки на первоисточники в одном рабочем пространстве.",
    items: [
      "Подготовка обзоров, сравнений, планов и исследовательских материалов.",
      "Поиск актуальной информации с возможностью перейти к использованным источникам.",
      "Разбор документов, таблиц, изображений и длинных материалов.",
      "Помощь с текстами, идеями, кодом и повседневными рабочими вопросами.",
    ],
  },
  {
    title: "Как проходит подключение",
    text: "После оплаты заказ поступает в обработку GPTishka.",
    ordered: true,
    items: [
      "Вы оформляете Perplexity Pro на один месяц и указываете контакт для связи.",
      "После подтверждения оплаты получаете дальнейшую инструкцию по подключению.",
      "Мы помогаем активировать подписку и проверяем, что тариф Pro появился в аккаунте.",
      "Статус заказа и результат отправляем на указанный контакт.",
    ],
  },
  {
    title: "Поддержка и важные условия",
    text: "GPTishka отвечает за корректное выполнение услуги и остаётся на связи после оплаты.",
    items: [
      "Тариф действует один месяц с момента успешного подключения.",
      "Состав функций, доступные модели и лимиты могут меняться на стороне Perplexity.",
      "Для стабильной работы соблюдайте правила сервиса и не передавайте аккаунт посторонним.",
      "Если вопрос возник по нашей вине, поможем решить его в рамках условий гарантии и публичной оферты.",
    ],
  },
];

const faqItems = [
  {
    question: "Что я получу после оплаты?",
    answer: [
      "Подписку Perplexity Pro на один месяц на ваш аккаунт и помощь GPTishka с подключением.",
      "После активации станут доступны возможности и лимиты, предусмотренные актуальным тарифом Pro на стороне Perplexity.",
    ],
  },
  {
    question: "Какие возможности есть в Perplexity Pro?",
    answer: [
      "Pro включает расширенный поиск, доступ к современным AI-моделям, увеличенные лимиты работы с файлами и изображениями, а также Research и инструменты создания контента в пределах лимитов тарифа.",
      "Конкретный список моделей и лимиты могут обновляться самим сервисом Perplexity.",
    ],
  },
  {
    question: "Сколько времени занимает подключение?",
    answer: [
      "В среднем подключение занимает от 5 минут до 2 часов после оплаты. Максимальное время ожидания — до 48 часов.",
      "Заказы обрабатываются ежедневно с 10:00 до 20:00 по МСК. Ночные заказы поступают в работу утром.",
    ],
  },
  {
    question: "Какие способы оплаты доступны?",
    answer: [
      "На gptishka.shop доступны СБП и банковские карты через подключённые платёжные шлюзы.",
      "GPTishka не сохраняет данные банковской карты — платёж обрабатывается на стороне платёжной системы.",
    ],
  },
  {
    question: "Что делать, если после оплаты возник вопрос?",
    answer: [
      "Напишите в поддержку и укажите номер заказа. Мы проверим статус подключения и поможем разобраться.",
      "Поддержка по вопросам выполненной услуги действует в течение оплаченного периода.",
    ],
  },
];

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { slug: PRODUCT_SLUG },
      create: {
        slug: PRODUCT_SLUG,
        title: "Perplexity Pro",
        titleEn: "Perplexity Pro",
        iconPngUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        description: "Подписка Perplexity Pro на 1 месяц с помощью в подключении.",
        descriptionEn: "Perplexity Pro subscription for 1 month with activation assistance.",
        modalDescription: "Perplexity Pro\nСрок: 1 месяц\nПодключение на ваш аккаунт\nПоддержка после оплаты",
        modalDescriptionEn: "Perplexity Pro\nDuration: 1 month\nActivation on your account\nPost-purchase support",
        price: 1999,
        oldPrice: null,
        currency: "RUB",
        category: "Подписки ИИ",
        tags: ["perplexity", "pplx", "pro", "month:1", "badge:new"],
        stock: null,
        isActive: true,
        isArchived: false,
      },
      update: {
        title: "Perplexity Pro",
        titleEn: "Perplexity Pro",
        iconPngUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        description: "Подписка Perplexity Pro на 1 месяц с помощью в подключении.",
        descriptionEn: "Perplexity Pro subscription for 1 month with activation assistance.",
        modalDescription: "Perplexity Pro\nСрок: 1 месяц\nПодключение на ваш аккаунт\nПоддержка после оплаты",
        modalDescriptionEn: "Perplexity Pro\nDuration: 1 month\nActivation on your account\nPost-purchase support",
        price: 1999,
        oldPrice: null,
        currency: "RUB",
        category: "Подписки ИИ",
        tags: ["perplexity", "pplx", "pro", "month:1", "badge:new"],
        stock: null,
        isActive: true,
        isArchived: false,
      },
    });

    await tx.productVisualConfig.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        cardTitle: "Perplexity Pro",
        cardDescription: "1 месяц · помощь с подключением",
        imageUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        imageAlt: "Perplexity Pro",
        hoverImageUrl: "/assets/img/services/perplexity-card-hover.webp?v=20260809-perplexity1",
        hoverImageAlt: "Perplexity Pro",
        backgroundType: ProductVisualBackgroundType.solid,
        backgroundColor: "#080c0d",
        backgroundGradient: "",
        textColor: "",
        buttonText: "Выбрать тариф",
        buttonStyle: "primary",
        buttonBackground: "",
        buttonTextColor: "",
        isVisible: true,
      },
      update: {
        cardTitle: "Perplexity Pro",
        cardDescription: "1 месяц · помощь с подключением",
        imageUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        imageAlt: "Perplexity Pro",
        hoverImageUrl: "/assets/img/services/perplexity-card-hover.webp?v=20260809-perplexity1",
        hoverImageAlt: "Perplexity Pro",
        backgroundType: ProductVisualBackgroundType.solid,
        backgroundColor: "#080c0d",
        isVisible: true,
      },
    });

    const page = await tx.servicePage.upsert({
      where: { slug: PAGE_SLUG },
      create: {
        slug: PAGE_SLUG,
        path: "/perplexity",
        serviceKey: "perplexity",
        title: "Perplexity",
        titleEn: "Perplexity",
        heroEyebrow: "Тарифные планы",
        heroTitle: "Perplexity Pro",
        heroDescription: "Расширенный AI-поиск, глубокие исследования, работа с файлами и ответы со ссылками на источники — на один месяц с поддержкой GPTishka.",
        heroLogoUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        theme: "custom",
        accentColor: "#21808d",
        accentGradient: "linear-gradient(135deg,#d9f1f2,#21808d,#102426)",
        darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.62))",
        colorOverlay: "linear-gradient(135deg,rgba(33,128,141,.34),rgba(16,36,38,.22),rgba(0,0,0,.28))",
        constructorTitle: "Perplexity Pro",
        constructorDescription: "Perplexity Pro помогает быстро находить и проверять информацию, проводить глубокие исследования, анализировать файлы и получать ответы со ссылками на источники.",
        infoSections,
        faqItems,
        sortOrder: 40,
        isActive: true,
        isIndexed: true,
      },
      update: {
        path: "/perplexity",
        serviceKey: "perplexity",
        title: "Perplexity",
        titleEn: "Perplexity",
        heroTitle: "Perplexity Pro",
        heroDescription: "Расширенный AI-поиск, глубокие исследования, работа с файлами и ответы со ссылками на источники — на один месяц с поддержкой GPTishka.",
        heroLogoUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        accentColor: "#21808d",
        accentGradient: "linear-gradient(135deg,#d9f1f2,#21808d,#102426)",
        constructorTitle: "Perplexity Pro",
        constructorDescription: "Perplexity Pro помогает быстро находить и проверять информацию, проводить глубокие исследования, анализировать файлы и получать ответы со ссылками на источники.",
        infoSections,
        faqItems,
        sortOrder: 40,
        isActive: true,
        isIndexed: true,
      },
    });

    await tx.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } },
      create: { servicePageId: page.id, productId: product.id, sortOrder: 10, isActive: true, isPinned: true },
      update: { sortOrder: 10, isActive: true, isPinned: true },
    });

    await tx.productShowcaseServiceCard.upsert({
      where: { serviceKey: "perplexity" },
      create: {
        serviceKey: "perplexity",
        title: "Perplexity",
        description: "Perplexity Pro для поиска, исследований и ответов с источниками.",
        planSummary: "Pro · 1 месяц",
        priceText: "1 999 RUB",
        buttonText: "К тарифу",
        href: "/perplexity",
        iconText: "PPLX",
        theme: "perplexity",
        imageUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        imageAlt: "Perplexity — тёмный логотип",
        hoverImageUrl: "/assets/img/services/perplexity-card-hover.webp?v=20260809-perplexity1",
        hoverImageAlt: "Perplexity — светлый логотип",
        backgroundType: ProductVisualBackgroundType.solid,
        backgroundColor: "#080c0d",
        sortOrder: 40,
        isActive: true,
      },
      update: {
        title: "Perplexity",
        description: "Perplexity Pro для поиска, исследований и ответов с источниками.",
        planSummary: "Pro · 1 месяц",
        priceText: "1 999 RUB",
        buttonText: "К тарифу",
        href: "/perplexity",
        iconText: "PPLX",
        theme: "perplexity",
        imageUrl: "/assets/img/services/perplexity-card.webp?v=20260809-perplexity1",
        imageAlt: "Perplexity — тёмный логотип",
        hoverImageUrl: "/assets/img/services/perplexity-card-hover.webp?v=20260809-perplexity1",
        hoverImageAlt: "Perplexity — светлый логотип",
        backgroundType: ProductVisualBackgroundType.solid,
        backgroundColor: "#080c0d",
        sortOrder: 40,
        isActive: true,
      },
    });

    return { product: product.slug, price: String(product.price), page: page.path };
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
