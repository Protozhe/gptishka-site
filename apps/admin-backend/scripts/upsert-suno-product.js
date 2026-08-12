const { PrismaClient, ProductVisualBackgroundType } = require("@prisma/client");

const prisma = new PrismaClient();
const asset = "/assets/img/services/suno-card.webp?v=20260812-suno5";
const hoverAsset = "/assets/img/services/suno-card-hover.webp?v=20260812-suno5";

const infoSections = [
  { title: "Что входит в Suno Premier", items: ["10 000 кредитов, которые обновляются ежемесячно.", "Доступ к актуальным музыкальным моделям и Suno Studio.", "Приоритетная очередь и расширенные инструменты создания и редактирования музыки.", "Коммерческие права на новые композиции, созданные во время активной подписки, согласно условиям Suno."] },
  { title: "Для каких задач подходит", items: ["Создание песен, инструменталов, демо и фоновой музыки по текстовому описанию.", "Работа с вокалом, аранжировкой, ремиксами и продолжением композиций.", "Разделение трека на вокал и инструменты для дальнейшего монтажа.", "Музыка для видео, рекламы, подкастов, игр и творческих проектов."] },
  { title: "Как проходит подключение", ordered: true, items: ["Выберите Suno Premier на один месяц.", "Оформите заказ и завершите оплату.", "Следуйте инструкции GPTishka по подключению.", "Проверьте появление тарифа Premier в аккаунте."] },
  { title: "Поддержка и важные условия", items: ["Тариф действует один месяц с момента успешного подключения.", "Функции, модели, кредиты и лимиты могут обновляться на стороне Suno.", "GPTishka остаётся на связи по вопросам заказа и подключения."] },
];

const faqItems = [
  { question: "Что я получу после оплаты?", answer: "Suno Premier на один месяц на ваш аккаунт и помощь GPTishka с подключением." },
  { question: "Что входит в Premier?", answer: "10 000 кредитов, Suno Studio, приоритетная генерация и расширенные инструменты создания и редактирования музыки в рамках актуального тарифа." },
  { question: "Сколько времени занимает подключение?", answer: "В среднем от 5 минут до 2 часов. Максимальный срок обработки — 48 часов." },
  { question: "Какие способы оплаты доступны?", answer: "Доступные способы показываются при оформлении. GPTishka не сохраняет данные банковской карты." },
  { question: "Что делать, если возник вопрос после оплаты?", answer: "Напишите в поддержку и укажите номер заказа — мы проверим статус подключения." },
];

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { slug: "suno-premier-1-month" },
      create: {
        slug: "suno-premier-1-month", title: "Suno Premier — 1 месяц", titleEn: "Suno Premier — 1 month",
        iconPngUrl: asset, description: "Подписка Suno Premier на 1 месяц с помощью в подключении.",
        descriptionEn: "Suno Premier subscription for 1 month with activation assistance.",
        modalDescription: "Suno Premier\nСрок: 1 месяц\n10 000 кредитов\nSuno Studio\nПоддержка после оплаты",
        modalDescriptionEn: "Suno Premier\nDuration: 1 month\n10,000 credits\nSuno Studio\nPost-purchase support",
        price: 2999, currency: "RUB", category: "Подписки ИИ",
        tags: ["suno", "premier", "month:1", "badge:new"], isActive: true, isArchived: false,
      },
      update: {
        title: "Suno Premier — 1 месяц", titleEn: "Suno Premier — 1 month", iconPngUrl: asset,
        description: "Подписка Suno Premier на 1 месяц с помощью в подключении.",
        descriptionEn: "Suno Premier subscription for 1 month with activation assistance.",
        modalDescription: "Suno Premier\nСрок: 1 месяц\n10 000 кредитов\nSuno Studio\nПоддержка после оплаты",
        modalDescriptionEn: "Suno Premier\nDuration: 1 month\n10,000 credits\nSuno Studio\nPost-purchase support",
        price: 2999, currency: "RUB", category: "Подписки ИИ",
        tags: ["suno", "premier", "month:1", "badge:new"], isActive: true, isArchived: false,
      },
    });

    await tx.productVisualConfig.upsert({
      where: { productId: product.id },
      create: { productId: product.id, cardTitle: "Suno Premier", cardDescription: "1 месяц · создание музыки с AI", imageUrl: asset, imageAlt: "Suno Premier", hoverImageUrl: hoverAsset, hoverImageAlt: "Suno Premier", backgroundType: ProductVisualBackgroundType.solid, backgroundColor: "#0b0712", buttonText: "Выбрать тариф", buttonStyle: "primary", isVisible: true },
      update: { cardTitle: "Suno Premier", cardDescription: "1 месяц · создание музыки с AI", imageUrl: asset, imageAlt: "Suno Premier", hoverImageUrl: hoverAsset, hoverImageAlt: "Suno Premier", backgroundType: ProductVisualBackgroundType.solid, backgroundColor: "#0b0712", buttonText: "Выбрать тариф", buttonStyle: "primary", isVisible: true },
    });

    const page = await tx.servicePage.upsert({
      where: { slug: "suno" },
      create: { slug: "suno", path: "/suno", serviceKey: "suno", title: "Suno", titleEn: "Suno", heroEyebrow: "Тарифные планы", heroTitle: "Suno Premier", heroDescription: "Создавайте музыку и вокал с помощью AI, работайте в Suno Studio и используйте расширенные инструменты редактирования.", heroLogoUrl: asset, theme: "custom", accentColor: "#c026d3", accentGradient: "linear-gradient(135deg,#7c3aed,#db2777,#fb7185)", constructorTitle: "Suno Premier", constructorDescription: "Suno Premier на один месяц: 10 000 кредитов, Suno Studio и расширенные инструменты создания музыки.", infoSections, faqItems, sortOrder: 50, isActive: true, isIndexed: true },
      update: { path: "/suno", serviceKey: "suno", title: "Suno", titleEn: "Suno", heroTitle: "Suno Premier", heroDescription: "Создавайте музыку и вокал с помощью AI, работайте в Suno Studio и используйте расширенные инструменты редактирования.", heroLogoUrl: asset, accentColor: "#c026d3", accentGradient: "linear-gradient(135deg,#7c3aed,#db2777,#fb7185)", constructorTitle: "Suno Premier", constructorDescription: "Suno Premier на один месяц: 10 000 кредитов, Suno Studio и расширенные инструменты создания музыки.", infoSections, faqItems, sortOrder: 50, isActive: true, isIndexed: true },
    });

    await tx.servicePageProductPlacement.upsert({ where: { servicePageId_productId: { servicePageId: page.id, productId: product.id } }, create: { servicePageId: page.id, productId: product.id, sortOrder: 10, isActive: true, isPinned: true }, update: { sortOrder: 10, isActive: true, isPinned: true } });
    await tx.productShowcaseServiceCard.upsert({
      where: { serviceKey: "suno" },
      create: { serviceKey: "suno", title: "Suno", description: "Suno Premier для создания музыки, вокала и редактирования треков с помощью AI.", planSummary: "Premier · 1 месяц", priceText: "2 999 RUB", buttonText: "К тарифу", href: "/suno", iconText: "SU", theme: "suno", imageUrl: asset, imageAlt: "Suno Premier", hoverImageUrl: hoverAsset, hoverImageAlt: "Suno Premier", backgroundType: ProductVisualBackgroundType.solid, backgroundColor: "#0b0712", sortOrder: 50, isActive: true },
      update: { title: "Suno", description: "Suno Premier для создания музыки, вокала и редактирования треков с помощью AI.", planSummary: "Premier · 1 месяц", priceText: "2 999 RUB", buttonText: "К тарифу", href: "/suno", iconText: "SU", theme: "suno", imageUrl: asset, imageAlt: "Suno Premier", hoverImageUrl: hoverAsset, hoverImageAlt: "Suno Premier", backgroundType: ProductVisualBackgroundType.solid, backgroundColor: "#0b0712", sortOrder: 50, isActive: true },
    });
    return { slug: product.slug, price: String(product.price), page: page.path };
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
