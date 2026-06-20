import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type BuiltInServicePage = {
  slug: string;
  path: string;
  serviceKey: string;
  title: string;
  theme: string;
  accentColor: string;
  accentGradient: string;
  darkOverlay: string;
  colorOverlay: string;
  heroDescription: string;
  constructorDescription: string;
  match?: RegExp;
  matchProduct?: (product: BackfillProduct) => boolean;
  pruneNonMatchingPlacements?: boolean;
};

type BackfillProduct = {
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  category: string;
  tags: string[];
};

const builtInPages: BuiltInServicePage[] = [
  {
    slug: "chatgpt",
    path: "/chatgpt",
    serviceKey: "chatgpt",
    title: "ChatGPT",
    theme: "emerald",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
    colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.34),rgba(0,130,80,.22),rgba(0,0,0,.22))",
    heroDescription:
      "Оформите подписку ChatGPT без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.",
    constructorDescription:
      "Выберите тариф и способ подключения. Для варианта без входа после оплаты откроется окно автоматической активации.",
    match: /chatgpt|openai/i,
  },
  {
    slug: "claude",
    path: "/claude",
    serviceKey: "claude",
    title: "Claude",
    theme: "orange",
    accentColor: "#ff8a3d",
    accentGradient: "linear-gradient(135deg,#ffb36a,#ff7a2f,#d94a17)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.56))",
    colorOverlay: "linear-gradient(135deg,rgba(255,138,61,.34),rgba(255,91,34,.24),rgba(0,0,0,.22))",
    heroDescription:
      "Оформите подписку Claude без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.",
    constructorDescription:
      "Выберите тариф Claude и удобный способ подключения. Все детали заказа сохраняются в карточке и модальном окне.",
    match: /claude/i,
  },
  {
    slug: "supergrok",
    path: "/supergrok",
    serviceKey: "grok",
    title: "SuperGrok",
    theme: "black",
    accentColor: "#f5f7fb",
    accentGradient: "linear-gradient(135deg,#f5f7fb,#8b95a7,#111827)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.68))",
    colorOverlay: "linear-gradient(135deg,rgba(255,255,255,.16),rgba(80,90,110,.18),rgba(0,0,0,.34))",
    heroDescription:
      "Оформите SuperGrok без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka возьмёт подключение на себя — с поддержкой и гарантией на весь срок подписки.",
    constructorDescription:
      "Выберите тариф SuperGrok. Для варианта без входа после оплаты используется отдельная инструкция и автоматическая активация.",
    match: /supergrok|grok|xai/i,
  },
  {
    slug: "gptishka-vpn",
    path: "/store/vpn",
    serviceKey: "vpn",
    title: "GPTishka VPN",
    theme: "dark-blue",
    accentColor: "#4aa8ff",
    accentGradient: "linear-gradient(135deg,#66c7ff,#2479ff,#102a7a)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))",
    colorOverlay: "linear-gradient(135deg,rgba(74,168,255,.30),rgba(28,70,180,.24),rgba(0,0,0,.28))",
    heroDescription:
      "Оформите GPTishka VPN без лишних сложностей. Выберите тариф, оплатите заказ, а GPTishka автоматически выдаст VLESS-ключ после успешной оплаты.",
    constructorDescription:
      "Выберите срок VPN. После оплаты система выдаст VLESS-ключ и инструкцию по подключению.",
    matchProduct: isStandaloneVpnProduct,
    pruneNonMatchingPlacements: true,
  },
];

function productSearchText(product: BackfillProduct) {
  return [
    product.slug,
    product.title,
    product.titleEn,
    product.description,
    product.descriptionEn,
    product.category,
    ...(Array.isArray(product.tags) ? product.tags : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizedTags(product: BackfillProduct) {
  return Array.isArray(product.tags)
    ? product.tags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function isStandaloneVpnProduct(product: BackfillProduct) {
  const tags = normalizedTags(product);
  if (tags.includes("delivery:vpn")) return true;

  const productKeys = [product.slug]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (productKeys.some((value) => /^(gptishka[-_]?vpn|vpn|vless|xray|reality)([-_]|$)/.test(value))) return true;

  const category = String(product.category || "").trim().toLowerCase();
  return category === "vpn" || category === "vless" || category.includes("vpn-");
}

function doesProductMatchPage(pageConfig: BuiltInServicePage, product: BackfillProduct) {
  if (pageConfig.matchProduct) return pageConfig.matchProduct(product);
  return Boolean(pageConfig.match && pageConfig.match.test(productSearchText(product)));
}

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true, isArchived: false },
    select: {
      id: true,
      slug: true,
      title: true,
      titleEn: true,
      description: true,
      descriptionEn: true,
      category: true,
      tags: true,
    },
    orderBy: [{ category: "asc" }, { price: "asc" }, { createdAt: "asc" }],
  });

  for (const pageConfig of builtInPages) {
    const page = await prisma.servicePage.upsert({
      where: { slug: pageConfig.slug },
      create: {
        slug: pageConfig.slug,
        path: pageConfig.path,
        serviceKey: pageConfig.serviceKey,
        title: pageConfig.title,
        heroEyebrow: "Тарифные планы",
        heroTitle: pageConfig.title,
        heroDescription: pageConfig.heroDescription,
        theme: pageConfig.theme,
        accentColor: pageConfig.accentColor,
        accentGradient: pageConfig.accentGradient,
        darkOverlay: pageConfig.darkOverlay,
        colorOverlay: pageConfig.colorOverlay,
        constructorTitle: pageConfig.title,
        constructorDescription: pageConfig.constructorDescription,
        paymentCaptionLava: "СБП 0% и карты 3.2%",
        paymentCaptionEnot: "Карты 3.2% и СБП 0%",
        sortOrder: builtInPages.indexOf(pageConfig) * 10 + 10,
      },
      update: {
        path: pageConfig.path,
        serviceKey: pageConfig.serviceKey,
        isActive: true,
      },
    });

    const matchedProducts = products.filter((product) => doesProductMatchPage(pageConfig, product));
    const matchedProductIds = matchedProducts.map((product) => product.id);

    if (pageConfig.pruneNonMatchingPlacements && matchedProductIds.length) {
      await prisma.servicePageProductPlacement.updateMany({
        where: {
          servicePageId: page.id,
          isActive: true,
          productId: { notIn: matchedProductIds },
        },
        data: { isActive: false },
      });
    }

    let sortOrder = 10;
    for (const product of matchedProducts) {
      await prisma.servicePageProductPlacement.upsert({
        where: {
          servicePageId_productId: {
            servicePageId: page.id,
            productId: product.id,
          },
        },
        create: {
          servicePageId: page.id,
          productId: product.id,
          sortOrder,
          isActive: true,
        },
        update: {
          sortOrder,
          isActive: true,
        },
      });
      sortOrder += 10;
    }

    process.stdout.write(
      `[service-pages] ${pageConfig.slug}: ensured page ${page.path}, added/kept ${matchedProducts.length} product placements\n`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
