const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PRODUCT_SLUG = "supergrok-heavy-3";
const TEMPLATE_SLUG = "supergrok-3";
const PAGE_SLUG = "supergrok";
const PRICE_RUB = 19_000;

async function main() {
  const template = await prisma.product.findUnique({
    where: { slug: TEMPLATE_SLUG },
    include: { visualConfig: true },
  });
  const servicePage = await prisma.servicePage.findUnique({ where: { slug: PAGE_SLUG } });
  if (!template) throw new Error(`Template product ${TEMPLATE_SLUG} was not found`);
  if (!servicePage) throw new Error(`Service page ${PAGE_SLUG} was not found`);

  const activationVariants = {
    withLogin: { price: PRICE_RUB, enabled: true, deliveryType: "support", activationSiteUrl: "" },
    withoutLogin: { price: PRICE_RUB, enabled: false, deliveryType: "activation", activationSiteUrl: "" },
  };
  const description = "SuperGrok Heavy на 3 месяца с подключением на ваш аккаунт и поддержкой GPTishka.";
  const descriptionEn = "SuperGrok Heavy for 3 months with activation on your account and GPTishka support.";
  const modalDescription = "SuperGrok Heavy\nСрок: 3 месяца\nПодключение на ваш аккаунт\nПоддержка после оплаты";
  const modalDescriptionEn = "SuperGrok Heavy\nDuration: 3 months\nActivation on your account\nPost-purchase support";
  const tags = ["supergrok", "grok", "supergrok-heavy", "heavy", "month:3", "badge:new"];

  const result = await prisma.$transaction(async (tx) => {
    await tx.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId: servicePage.id, productId: template.id } },
      create: { servicePageId: servicePage.id, productId: template.id, sortOrder: 10, isActive: true, isPinned: true },
      update: { sortOrder: 10, isActive: true, isPinned: true },
    });

    const product = await tx.product.upsert({
      where: { slug: PRODUCT_SLUG },
      create: {
        slug: PRODUCT_SLUG,
        title: "SUPERGROK HEAVY — 3 месяца",
        titleEn: "SUPERGROK HEAVY — 3 months",
        iconPngUrl: template.iconPngUrl,
        description,
        descriptionEn,
        modalDescription,
        modalDescriptionEn,
        price: PRICE_RUB,
        oldPrice: null,
        activationVariants,
        currency: "RUB",
        category: template.category,
        tags,
        stock: null,
        isActive: true,
        isArchived: false,
      },
      update: {
        title: "SUPERGROK HEAVY — 3 месяца",
        titleEn: "SUPERGROK HEAVY — 3 months",
        description,
        descriptionEn,
        modalDescription,
        modalDescriptionEn,
        price: PRICE_RUB,
        oldPrice: null,
        activationVariants,
        currency: "RUB",
        category: template.category,
        tags,
        stock: null,
        isActive: true,
        isArchived: false,
      },
    });

    const visual = template.visualConfig;
    await tx.productVisualConfig.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        cardTitle: "SUPERGROK HEAVY",
        cardDescription: "3 месяца · подключение на ваш аккаунт",
        imageUrl: visual?.imageUrl || "/assets/img/services/grok-card.webp?v=20260721-heavy-cards-webp1",
        imageAlt: "SuperGrok Heavy",
        hoverImageUrl: visual?.hoverImageUrl || "/assets/img/services/grok-card-hover.webp?v=20260721-heavy-cards-webp1",
        hoverImageAlt: "SuperGrok Heavy",
        backgroundType: visual?.backgroundType || "solid",
        backgroundColor: visual?.backgroundColor || "#05070d",
        backgroundGradient: visual?.backgroundGradient || "",
        textColor: visual?.textColor || "",
        buttonText: "Выбрать тариф",
        buttonStyle: visual?.buttonStyle || "primary",
        buttonBackground: visual?.buttonBackground || "",
        buttonTextColor: visual?.buttonTextColor || "",
        isVisible: true,
      },
      update: {
        cardTitle: "SUPERGROK HEAVY",
        cardDescription: "3 месяца · подключение на ваш аккаунт",
        imageAlt: "SuperGrok Heavy",
        hoverImageAlt: "SuperGrok Heavy",
        isVisible: true,
      },
    });

    await tx.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId: servicePage.id, productId: product.id } },
      create: { servicePageId: servicePage.id, productId: product.id, sortOrder: 20, isActive: true, isPinned: false },
      update: { sortOrder: 20, isActive: true, isPinned: false },
    });

    return { id: product.id, slug: product.slug, price: String(product.price) };
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
