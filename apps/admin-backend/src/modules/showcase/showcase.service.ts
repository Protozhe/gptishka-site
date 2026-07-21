import { ProductVisualBackgroundType } from "@prisma/client";
import slugify from "../../common/utils/slugify";
import { AppError } from "../../common/errors/app-error";
import { prisma } from "../../config/prisma";
import { deleteProductImageByUrl, saveNormalizedProductCardImage } from "../files/files.service";
import { writeAuditLog } from "../audit/audit.service";

type Actor = { userId?: string; ip?: string; userAgent?: string };

function normalizeSlug(value: string, fallback: string) {
  const source = String(value || fallback || "").trim();
  const slug = slugify(source);
  return slug || `section-${Date.now().toString(36)}`;
}

async function getUniqueSectionSlug(baseSlug: string, excludeId?: string) {
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await prisma.productShowcaseSection.findUnique({ where: { slug } });
    if (!existing || (excludeId && existing.id === excludeId)) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function ensureProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

function normalizeRenderMode(value: unknown) {
  return String(value || "").trim().toLowerCase() === "cards" ? "cards" : "auto";
}

const SERVICE_CARD_DEFAULTS: Record<string, Record<string, any>> = {
  chatgpt: {
    serviceKey: "chatgpt",
    title: "ChatGPT",
    description: "Тарифы Plus, GO и Pro для работы, учебы и любых задач.",
    planSummary: "Go / Plus / Pro 5x / Pro 20x",
    buttonText: "К тарифам",
    href: "/chatgpt",
    iconText: "GPT",
    theme: "chatgpt",
    imageUrl: "/assets/img/services/chatgpt-card.webp?v=20260721-webp1",
    hoverImageUrl: "/assets/img/services/chatgpt-card-hover.webp?v=20260721-webp1",
    imageAlt: "ChatGPT",
    hoverImageAlt: "ChatGPT",
    backgroundType: ProductVisualBackgroundType.solid,
    backgroundColor: "#052e16",
    backgroundGradient: "",
    textColor: "",
    buttonBackground: "",
    buttonTextColor: "",
    isActive: true,
    sortOrder: 10,
  },
  claude: {
    serviceKey: "claude",
    title: "Claude",
    description: "Claude Pro для текста, анализа и кода.",
    planSummary: "Pro",
    buttonText: "К тарифам",
    href: "/claude",
    iconText: "CL",
    theme: "claude",
    imageUrl: "/assets/img/services/claude-card.png?v=20260618-claude-logo2",
    hoverImageUrl: "/assets/img/services/claude-card-hover.png?v=20260618-claude-logo2",
    imageAlt: "Claude",
    hoverImageAlt: "Claude",
    backgroundType: ProductVisualBackgroundType.solid,
    backgroundColor: "#3b2418",
    backgroundGradient: "",
    textColor: "",
    buttonBackground: "",
    buttonTextColor: "",
    isActive: true,
    sortOrder: 20,
  },
  grok: {
    serviceKey: "grok",
    title: "SuperGrok",
    description: "Тарифы SuperGrok с быстрой активацией на ваш аккаунт.",
    planSummary: "1 месяц",
    buttonText: "К тарифам",
    href: "/supergrok",
    iconText: "GX",
    theme: "grok",
    imageUrl: "/assets/img/services/grok-card.png?v=20260618-grok-logo4",
    hoverImageUrl: "/assets/img/services/grok-card-hover.png",
    imageAlt: "SuperGrok",
    hoverImageAlt: "SuperGrok",
    backgroundType: ProductVisualBackgroundType.solid,
    backgroundColor: "#0f172a",
    backgroundGradient: "",
    textColor: "",
    buttonBackground: "",
    buttonTextColor: "",
    isActive: true,
    sortOrder: 30,
  },
  vpn: {
    serviceKey: "vpn",
    title: "GPTishka VPN",
    description: "Безопасный VPN-доступ. Актуальные тарифы и сроки внутри каталога.",
    planSummary: "1 месяц / 2 месяца / 6 месяцев / 12 месяцев",
    buttonText: "К тарифам",
    href: "/store/vpn",
    iconText: "VPN",
    theme: "vpn",
    imageUrl: "/assets/img/services/vpn-card.webp?v=20260721-cards-webp1",
    hoverImageUrl: "/assets/img/services/vpn-card-hover.webp?v=20260721-cards-webp1",
    imageAlt: "GPTishka VPN",
    hoverImageAlt: "GPTishka VPN",
    backgroundType: ProductVisualBackgroundType.solid,
    backgroundColor: "#06142f",
    backgroundGradient: "",
    textColor: "",
    buttonBackground: "",
    buttonTextColor: "",
    isActive: true,
    sortOrder: 40,
  },
  topups: {
    serviceKey: "topups",
    title: "Пополнения",
    description: "Пополнение Steam ключами Манн Ко.",
    planSummary: "Steam / App Store / цифровые товары",
    priceText: "от 151 RUB",
    buttonText: "Пополнить",
    href: "/store/steam/topup/",
    iconText: "STEAM",
    theme: "topups",
    imageUrl: "/assets/img/home/topups-card.png",
    hoverImageUrl: "/assets/img/home/topups-card.png",
    imageAlt: "Пополнения",
    hoverImageAlt: "Пополнения",
    backgroundType: ProductVisualBackgroundType.gradient,
    backgroundColor: "#111111",
    backgroundGradient: "linear-gradient(135deg,#111111,#243)",
    textColor: "#ffffff",
    buttonBackground: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    buttonTextColor: "#06110b",
    isActive: true,
    sortOrder: 50,
  },
};

function normalizeServiceCardKey(value: unknown) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "supergrok" || key === "xai") return "grok";
  if (key === "gptishka-vpn" || key === "vless") return "vpn";
  if (key === "steam" || key === "topup" || key === "popolneniya") return "topups";
  return key.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function textOrFallback(value: unknown, fallback: unknown, max = 2048) {
  const text = String(value ?? fallback ?? "").trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function numberOrFallback(value: unknown, fallback: unknown) {
  const next = Number(value);
  if (Number.isFinite(next)) return next;
  const prev = Number(fallback);
  return Number.isFinite(prev) ? prev : 100;
}

function mergeServiceCardDefaults(card: any) {
  const serviceKey = normalizeServiceCardKey(card?.serviceKey);
  const defaults =
    SERVICE_CARD_DEFAULTS[serviceKey] || {
      ...SERVICE_CARD_DEFAULTS.chatgpt,
      serviceKey,
      title: "Новая карточка",
      description: "Описание карточки на главной.",
      planSummary: "",
      priceText: "",
      buttonText: "Открыть",
      href: "/catalog/",
      iconText: serviceKey ? serviceKey.slice(0, 8).toUpperCase() : "NEW",
      theme: serviceKey || "custom",
      imageUrl: "",
      imageAlt: "",
      hoverImageUrl: "",
      hoverImageAlt: "",
      backgroundType: ProductVisualBackgroundType.gradient,
      backgroundColor: "#111111",
      backgroundGradient: "linear-gradient(135deg,#111111,#243)",
      textColor: "",
      buttonBackground: "",
      buttonTextColor: "",
      isActive: true,
      sortOrder: 100,
    };
  return {
    ...defaults,
    ...(card || {}),
    serviceKey,
    isDefault: !card?.id,
  };
}

function normalizeServiceCardInput(serviceKey: string, input: any, fallback: any) {
  const source = input && typeof input === "object" ? input : {};
  const defaults = mergeServiceCardDefaults({ ...fallback, serviceKey });
  return {
    title: textOrFallback(source.title, defaults.title, 150),
    description: textOrFallback(source.description, defaults.description, 500),
    planSummary: textOrFallback(source.planSummary, defaults.planSummary, 240),
    priceText: textOrFallback(source.priceText, defaults.priceText, 120),
    buttonText: textOrFallback(source.buttonText, defaults.buttonText, 80),
    href: textOrFallback(source.href, defaults.href, 2048),
    iconText: textOrFallback(source.iconText, defaults.iconText, 32),
    theme: textOrFallback(source.theme, defaults.theme, 40),
    imageUrl: textOrFallback(source.imageUrl, defaults.imageUrl, 2048),
    imageAlt: textOrFallback(source.imageAlt, defaults.imageAlt, 180),
    hoverImageUrl: textOrFallback(source.hoverImageUrl, defaults.hoverImageUrl, 2048),
    hoverImageAlt: textOrFallback(source.hoverImageAlt, defaults.hoverImageAlt, 180),
    backgroundType: source.backgroundType || defaults.backgroundType || ProductVisualBackgroundType.solid,
    backgroundColor: textOrFallback(source.backgroundColor, defaults.backgroundColor, 80),
    backgroundGradient: textOrFallback(source.backgroundGradient, defaults.backgroundGradient, 500),
    textColor: textOrFallback(source.textColor, defaults.textColor, 80),
    buttonBackground: textOrFallback(source.buttonBackground, defaults.buttonBackground, 500),
    buttonTextColor: textOrFallback(source.buttonTextColor, defaults.buttonTextColor, 80),
    isActive: source.isActive !== undefined ? source.isActive !== false : defaults.isActive !== false,
    sortOrder: numberOrFallback(source.sortOrder, defaults.sortOrder),
  };
}

function fallbackVisualFromProduct(product: { title: string; description: string }) {
  return {
    id: "",
    productId: "",
    cardTitle: product.title,
    cardDescription: product.description,
    imageUrl: "",
    imageAlt: product.title,
    hoverImageUrl: "",
    hoverImageAlt: product.title,
    backgroundType: ProductVisualBackgroundType.solid,
    backgroundColor: "#111111",
    backgroundGradient: "",
    textColor: "",
    buttonText: "Выбрать тариф",
    buttonStyle: "primary",
    buttonBackground: "",
    buttonTextColor: "",
    isVisible: true,
    createdAt: null,
    updatedAt: null,
  };
}

function normalizeVisualInput(input: any) {
  return {
    cardTitle: String(input.cardTitle || "").trim(),
    cardDescription: String(input.cardDescription || "").trim(),
    imageUrl: String(input.imageUrl || "").trim(),
    imageAlt: String(input.imageAlt || "").trim(),
    hoverImageUrl: String(input.hoverImageUrl || "").trim(),
    hoverImageAlt: String(input.hoverImageAlt || "").trim(),
    backgroundType: input.backgroundType || ProductVisualBackgroundType.solid,
    backgroundColor: String(input.backgroundColor || "").trim(),
    backgroundGradient: String(input.backgroundGradient || "").trim(),
    textColor: String(input.textColor || "").trim(),
    buttonText: String(input.buttonText || "").trim(),
    buttonStyle: String(input.buttonStyle || "").trim(),
    buttonBackground: String(input.buttonBackground || "").trim(),
    buttonTextColor: String(input.buttonTextColor || "").trim(),
    isVisible: input.isVisible !== false,
  };
}

const sectionInclude = {
  placements: {
    orderBy: [{ isPinned: "desc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: {
      product: {
        include: {
          visualConfig: true,
        },
      },
    },
  },
};

export const showcaseService = {
  fallbackVisualFromProduct,

  async getProductVisual(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { visualConfig: true },
    });
    if (!product) throw new AppError("Product not found", 404);

    return {
      productId,
      hasCustomConfig: Boolean(product.visualConfig),
      visual: product.visualConfig || fallbackVisualFromProduct(product),
    };
  },

  async upsertProductVisual(productId: string, input: any, actor?: Actor) {
    const product = await ensureProduct(productId);
    const before = await prisma.productVisualConfig.findUnique({ where: { productId } });
    const data = normalizeVisualInput(input);

    const visual = await prisma.productVisualConfig.upsert({
      where: { productId },
      create: {
        productId,
        ...data,
      },
      update: data,
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_visual",
      entityId: productId,
      action: before ? "update" : "create",
      before,
      after: visual,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return {
      productId,
      productTitle: product.title,
      hasCustomConfig: true,
      visual,
    };
  },

  async uploadProductVisualImage(productId: string, file: Express.Multer.File, actor?: Actor) {
    if (!file) throw new AppError("Image file is required", 422);
    const product = await ensureProduct(productId);
    const before = await prisma.productVisualConfig.findUnique({ where: { productId } });
    const imageUrl = await saveNormalizedProductCardImage(file);

    const visual = await prisma.productVisualConfig.upsert({
      where: { productId },
      create: {
        productId,
        cardTitle: "",
        cardDescription: "",
        imageUrl,
        imageAlt: product.title,
        hoverImageUrl: "",
        hoverImageAlt: product.title,
        backgroundType: ProductVisualBackgroundType.solid,
        backgroundColor: "",
        backgroundGradient: "",
        textColor: "",
        buttonText: "",
        buttonStyle: "",
        buttonBackground: "",
        buttonTextColor: "",
        isVisible: true,
      },
      update: {
        imageUrl,
        imageAlt: before?.imageAlt || product.title,
      },
    });

    if (before?.imageUrl && before.imageUrl !== imageUrl) {
      deleteProductImageByUrl(before.imageUrl);
    }

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_visual",
      entityId: productId,
      action: "upload_image",
      before,
      after: visual,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return { imageUrl, visual };
  },

  async deleteProductVisualImage(productId: string, actor?: Actor) {
    await ensureProduct(productId);
    const before = await prisma.productVisualConfig.findUnique({ where: { productId } });
    if (!before) return { imageUrl: "", visual: null };

    if (before.imageUrl) {
      deleteProductImageByUrl(before.imageUrl);
    }

    const visual = await prisma.productVisualConfig.update({
      where: { productId },
      data: {
        imageUrl: "",
        imageAlt: "",
      },
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_visual",
      entityId: productId,
      action: "delete_image",
      before,
      after: visual,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return { imageUrl: "", visual };
  },

  async uploadProductVisualHoverImage(productId: string, file: Express.Multer.File, actor?: Actor) {
    if (!file) throw new AppError("Hover image file is required", 422);
    const product = await ensureProduct(productId);
    const before = await prisma.productVisualConfig.findUnique({ where: { productId } });
    const hoverImageUrl = await saveNormalizedProductCardImage(file);

    const visual = await prisma.productVisualConfig.upsert({
      where: { productId },
      create: {
        productId,
        cardTitle: "",
        cardDescription: "",
        imageUrl: "",
        imageAlt: product.title,
        hoverImageUrl,
        hoverImageAlt: product.title,
        backgroundType: ProductVisualBackgroundType.solid,
        backgroundColor: "",
        backgroundGradient: "",
        textColor: "",
        buttonText: "",
        buttonStyle: "",
        buttonBackground: "",
        buttonTextColor: "",
        isVisible: true,
      },
      update: {
        hoverImageUrl,
        hoverImageAlt: before?.hoverImageAlt || product.title,
      },
    });

    if (before?.hoverImageUrl && before.hoverImageUrl !== hoverImageUrl) {
      deleteProductImageByUrl(before.hoverImageUrl);
    }

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_visual",
      entityId: productId,
      action: "upload_hover_image",
      before,
      after: visual,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return { hoverImageUrl, visual };
  },

  async deleteProductVisualHoverImage(productId: string, actor?: Actor) {
    await ensureProduct(productId);
    const before = await prisma.productVisualConfig.findUnique({ where: { productId } });
    if (!before) return { hoverImageUrl: "", visual: null };

    if (before.hoverImageUrl) {
      deleteProductImageByUrl(before.hoverImageUrl);
    }

    const visual = await prisma.productVisualConfig.update({
      where: { productId },
      data: {
        hoverImageUrl: "",
        hoverImageAlt: "",
      },
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_visual",
      entityId: productId,
      action: "delete_hover_image",
      before,
      after: visual,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return { hoverImageUrl: "", visual };
  },

  async listServiceCards() {
    const savedCards = await prisma.productShowcaseServiceCard.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const byKey = new Map(savedCards.map((card) => [normalizeServiceCardKey(card.serviceKey), card]));
    const defaults = Object.keys(SERVICE_CARD_DEFAULTS).map((serviceKey) => mergeServiceCardDefaults(byKey.get(serviceKey) || { serviceKey }));
    const custom = savedCards
      .filter((card) => !SERVICE_CARD_DEFAULTS[normalizeServiceCardKey(card.serviceKey)])
      .map(mergeServiceCardDefaults);
    return [...defaults, ...custom].sort((a, b) => Number(a.sortOrder || 100) - Number(b.sortOrder || 100));
  },

  async upsertServiceCard(serviceKey: string, input: any, actor?: Actor) {
    const key = normalizeServiceCardKey(serviceKey);
    if (!key) throw new AppError("Service card key is required", 422);
    const before = await prisma.productShowcaseServiceCard.findUnique({ where: { serviceKey: key } });
    const data = normalizeServiceCardInput(key, input, before || { serviceKey: key });

    const card = await prisma.productShowcaseServiceCard.upsert({
      where: { serviceKey: key },
      create: {
        serviceKey: key,
        ...data,
      },
      update: data,
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_service_card",
      entityId: card.id,
      action: before ? "update" : "create",
      before,
      after: card,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return mergeServiceCardDefaults(card);
  },

  async uploadServiceCardImage(serviceKey: string, file: Express.Multer.File, kind: "image" | "hover", actor?: Actor) {
    if (!file) throw new AppError("Image file is required", 422);
    const key = normalizeServiceCardKey(serviceKey);
    if (!key) throw new AppError("Service card key is required", 422);
    const before = await prisma.productShowcaseServiceCard.findUnique({ where: { serviceKey: key } });
    const imageUrl = await saveNormalizedProductCardImage(file);
    const field = kind === "hover" ? "hoverImageUrl" : "imageUrl";
    const altField = kind === "hover" ? "hoverImageAlt" : "imageAlt";
    const data = normalizeServiceCardInput(key, before || {}, before || { serviceKey: key });

    const card = await prisma.productShowcaseServiceCard.upsert({
      where: { serviceKey: key },
      create: {
        serviceKey: key,
        ...data,
        [field]: imageUrl,
        [altField]: data[altField as keyof typeof data] || data.title,
      },
      update: {
        [field]: imageUrl,
        [altField]: before?.[altField as keyof typeof before] || data.title,
      } as any,
    });

    const oldImageUrl = before?.[field as keyof typeof before];
    if (typeof oldImageUrl === "string" && oldImageUrl && oldImageUrl !== imageUrl) {
      deleteProductImageByUrl(oldImageUrl);
    }

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_service_card",
      entityId: card.id,
      action: kind === "hover" ? "upload_hover_image" : "upload_image",
      before,
      after: card,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return { imageUrl, item: mergeServiceCardDefaults(card) };
  },

  async listSections() {
    return prisma.productShowcaseSection.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: sectionInclude,
    });
  },

  async createSection(input: any, actor?: Actor) {
    const baseSlug = normalizeSlug(input.slug || input.title, input.title);
    const slug = await getUniqueSectionSlug(baseSlug);

    const created = await prisma.productShowcaseSection.create({
      data: {
        slug,
        title: String(input.title || "").trim(),
        description: String(input.description || "").trim(),
        sortOrder: input.sortOrder ?? 100,
        isActive: input.isActive !== false,
        showOnHomepage: input.showOnHomepage !== false,
        showInCatalog: input.showInCatalog !== false,
        renderMode: normalizeRenderMode(input.renderMode),
      },
      include: sectionInclude,
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_section",
      entityId: created.id,
      action: "create",
      after: created,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return created;
  },

  async updateSection(id: string, input: any, actor?: Actor) {
    const before = await prisma.productShowcaseSection.findUnique({ where: { id } });
    if (!before) throw new AppError("Showcase section not found", 404);

    const nextSlug =
      input.slug !== undefined || input.title !== undefined
        ? await getUniqueSectionSlug(normalizeSlug(input.slug || input.title || before.title, before.title), id)
        : undefined;

    const updated = await prisma.productShowcaseSection.update({
      where: { id },
      data: {
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(input.title !== undefined ? { title: String(input.title || "").trim() } : {}),
        ...(input.description !== undefined ? { description: String(input.description || "").trim() } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.showOnHomepage !== undefined ? { showOnHomepage: input.showOnHomepage } : {}),
        ...(input.showInCatalog !== undefined ? { showInCatalog: input.showInCatalog } : {}),
        ...(input.renderMode !== undefined ? { renderMode: normalizeRenderMode(input.renderMode) } : {}),
      },
      include: sectionInclude,
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_section",
      entityId: id,
      action: "update",
      before,
      after: updated,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return updated;
  },

  async removeSection(id: string, actor?: Actor) {
    const before = await prisma.productShowcaseSection.findUnique({ where: { id }, include: sectionInclude });
    if (!before) throw new AppError("Showcase section not found", 404);
    await prisma.productShowcaseSection.delete({ where: { id } });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_section",
      entityId: id,
      action: "delete",
      before,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });
  },

  async addPlacement(sectionId: string, input: any, actor?: Actor) {
    const section = await prisma.productShowcaseSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new AppError("Showcase section not found", 404);
    await ensureProduct(input.productId);

    const placement = await prisma.productShowcasePlacement.upsert({
      where: {
        productId_sectionId: {
          productId: input.productId,
          sectionId,
        },
      },
      create: {
        productId: input.productId,
        sectionId,
        sortOrder: input.sortOrder ?? 100,
        isActive: input.isActive !== false,
        isPinned: input.isPinned === true,
      },
      update: {
        sortOrder: input.sortOrder ?? 100,
        isActive: input.isActive !== false,
        isPinned: input.isPinned === true,
      },
      include: {
        product: {
          include: {
            visualConfig: true,
          },
        },
        section: true,
      },
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_placement",
      entityId: placement.id,
      action: "upsert",
      after: placement,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return placement;
  },

  async updatePlacement(id: string, input: any, actor?: Actor) {
    const before = await prisma.productShowcasePlacement.findUnique({ where: { id } });
    if (!before) throw new AppError("Showcase placement not found", 404);

    const updated = await prisma.productShowcasePlacement.update({
      where: { id },
      data: {
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      },
      include: {
        product: {
          include: {
            visualConfig: true,
          },
        },
        section: true,
      },
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_placement",
      entityId: id,
      action: "update",
      before,
      after: updated,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return updated;
  },

  async removePlacement(id: string, actor?: Actor) {
    const before = await prisma.productShowcasePlacement.findUnique({ where: { id } });
    if (!before) throw new AppError("Showcase placement not found", 404);
    await prisma.productShowcasePlacement.delete({ where: { id } });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product_showcase_placement",
      entityId: id,
      action: "delete",
      before,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });
  },
};


