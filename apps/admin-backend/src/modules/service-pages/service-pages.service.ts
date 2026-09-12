import slugify from "../../common/utils/slugify";
import { AppError } from "../../common/errors/app-error";
import { prisma } from "../../config/prisma";
import { writeAuditLog } from "../audit/audit.service";
import { buildPublicProducts } from "../products/public-product-presenter";

type Actor = { userId?: string; ip?: string; userAgent?: string };
type ServicePageInput = Record<string, any>;

const RESERVED_PATHS = new Set([
  "admin",
  "api",
  "assets",
  "uploads",
  "data",
  "store/vpn/activate",
  "payment",
  "success",
  "fail",
  "cart",
  "redeem-start",
]);

const THEME_TOKENS: Record<
  string,
  { theme: string; accentColor: string; accentGradient: string; darkOverlay: string; colorOverlay: string }
> = {
  emerald: {
    theme: "emerald",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
    colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.34),rgba(0,130,80,.22),rgba(0,0,0,.22))",
  },
  orange: {
    theme: "orange",
    accentColor: "#ff8a3d",
    accentGradient: "linear-gradient(135deg,#ffb36a,#ff7a2f,#d94a17)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.56))",
    colorOverlay: "linear-gradient(135deg,rgba(255,138,61,.34),rgba(255,91,34,.24),rgba(0,0,0,.22))",
  },
  black: {
    theme: "black",
    accentColor: "#f5f7fb",
    accentGradient: "linear-gradient(135deg,#f5f7fb,#8b95a7,#111827)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.68))",
    colorOverlay: "linear-gradient(135deg,rgba(255,255,255,.16),rgba(80,90,110,.18),rgba(0,0,0,.34))",
  },
  "dark-blue": {
    theme: "dark-blue",
    accentColor: "#4aa8ff",
    accentGradient: "linear-gradient(135deg,#66c7ff,#2479ff,#102a7a)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))",
    colorOverlay: "linear-gradient(135deg,rgba(74,168,255,.30),rgba(28,70,180,.24),rgba(0,0,0,.28))",
  },
  custom: {
    theme: "custom",
    accentColor: "#35f28f",
    accentGradient: "linear-gradient(135deg,#35f28f,#18c878,#0f8f5c)",
    darkOverlay: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))",
    colorOverlay: "linear-gradient(135deg,rgba(0,255,120,.28),rgba(0,130,80,.18),rgba(0,0,0,.20))",
  },
};

export function normalizeServicePageSlug(value: string) {
  const source = String(value || "").trim();
  return source ? slugify(source) : "";
}

export function normalizeServicePagePath(value: string) {
  const raw = String(value || "").trim().replace(/^https?:\/\/[^/]+/i, "");
  const noQuery = raw.split("?")[0].split("#")[0].trim();
  const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  const cleaned = withSlash.replace(/\/{2,}/g, "/").replace(/\/+$/g, "");
  const key = cleaned.replace(/^\/+/, "").toLowerCase();
  if (!key || RESERVED_PATHS.has(key) || key.startsWith("api/") || key.startsWith("admin/") || key.includes(".")) return "";
  return cleaned;
}

export function resolveServicePageTheme(theme: string) {
  const key = String(theme || "custom").trim().toLowerCase();
  return THEME_TOKENS[key] || THEME_TOKENS.custom;
}

export function normalizeServicePageInput(input: ServicePageInput) {
  const title = String(input.title || "").trim();
  const slug = normalizeServicePageSlug(input.slug || title);
  const path = normalizeServicePagePath(input.path || slug);
  const serviceKey = normalizeServicePageSlug(input.serviceKey || slug);
  const theme = resolveServicePageTheme(input.theme || "custom");

  if (!title) throw new AppError("Service page title is required", 422);
  if (!slug) throw new AppError("Service page slug is required", 422);
  if (!path) throw new AppError("Service page path is invalid", 422);
  if (!serviceKey) throw new AppError("Service page key is required", 422);

  return {
    slug,
    path,
    serviceKey,
    title,
    titleEn: String(input.titleEn || "").trim(),
    heroEyebrow: String(input.heroEyebrow || "Тарифные планы").trim(),
    heroTitle: String(input.heroTitle || title).trim(),
    heroDescription: String(input.heroDescription || "").trim(),
    heroVideoUrl: String(input.heroVideoUrl || "").trim(),
    heroImageUrl: String(input.heroImageUrl || "").trim(),
    heroLogoUrl: String(input.heroLogoUrl || "").trim(),
    theme: String(input.theme || theme.theme).trim() || theme.theme,
    accentColor: String(input.accentColor || theme.accentColor).trim(),
    accentGradient: String(input.accentGradient || theme.accentGradient).trim(),
    darkOverlay: String(input.darkOverlay || theme.darkOverlay).trim(),
    colorOverlay: String(input.colorOverlay || theme.colorOverlay).trim(),
    constructorTitle: String(input.constructorTitle || title).trim(),
    constructorDescription: String(input.constructorDescription || "").trim(),
    infoSections: Array.isArray(input.infoSections) ? input.infoSections : [],
    faqItems: Array.isArray(input.faqItems) ? input.faqItems : [],
    paymentCaptionLava: String(input.paymentCaptionLava || "СБП 0% и карты 3.2%").trim(),
    paymentCaptionEnot: String(input.paymentCaptionEnot || "Карты 3.2% и СБП 0%").trim(),
    isActive: input.isActive !== false,
    isIndexed: input.isIndexed !== false,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100,
  };
}

const pageInclude = {
  placements: {
    orderBy: [{ isPinned: "desc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: {
      product: {
        include: {
          visualConfig: true,
          showcasePlacements: {
            where: { isActive: true },
            include: { section: true },
          },
        },
      },
    },
  },
};

function publicPagePayload(page: any, lang: "ru" | "en") {
  const products = (Array.isArray(page.placements) ? page.placements : [])
    .filter((placement: any) => placement.isActive !== false && placement.product?.isActive !== false && placement.product?.isArchived !== true)
    .flatMap((placement: any) => buildPublicProducts(placement.product, lang));

  return {
    page: {
      id: page.id,
      slug: page.slug,
      path: page.path,
      serviceKey: page.serviceKey,
      title: lang === "en" ? page.titleEn || page.title : page.title,
      heroEyebrow: page.heroEyebrow,
      heroTitle: page.heroTitle || page.title,
      heroDescription: page.heroDescription,
      heroVideoUrl: page.heroVideoUrl,
      heroImageUrl: page.heroImageUrl,
      heroLogoUrl: page.heroLogoUrl,
      constructorTitle: page.constructorTitle || page.title,
      constructorDescription: page.constructorDescription,
      infoSections: Array.isArray(page.infoSections) ? page.infoSections : [],
      faqItems: Array.isArray(page.faqItems) ? page.faqItems : [],
      paymentCaptionLava: page.paymentCaptionLava,
      paymentCaptionEnot: page.paymentCaptionEnot,
      isIndexed: page.isIndexed !== false,
    },
    theme: {
      theme: page.theme,
      accentColor: page.accentColor,
      accentGradient: page.accentGradient,
      darkOverlay: page.darkOverlay,
      colorOverlay: page.colorOverlay,
    },
    products,
    meta: {
      title: `${page.title} — тарифные планы | GPTishka`,
      description: page.heroDescription || page.constructorDescription || "",
      canonical: page.path,
    },
  };
}

export const servicePagesService = {
  async list() {
    return prisma.servicePage.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: pageInclude,
    });
  },

  async getById(id: string) {
    const page = await prisma.servicePage.findUnique({ where: { id }, include: pageInclude });
    if (!page) throw new AppError("Service page not found", 404);
    return page;
  },

  async getPublicBySlug(slugOrPath: string, lang: "ru" | "en") {
    const raw = String(slugOrPath || "").trim();
    const path = normalizeServicePagePath(raw);
    const slug = normalizeServicePageSlug(raw.replace(/^\/+/, ""));
    const page = await prisma.servicePage.findFirst({
      where: {
        isActive: true,
        OR: [{ slug }, ...(path ? [{ path }] : [])],
      },
      include: pageInclude,
    });
    if (!page) throw new AppError("Service page not found", 404);
    return publicPagePayload(page, lang);
  },

  async create(input: ServicePageInput, actor?: Actor) {
    const data = normalizeServicePageInput(input);
    const created = await prisma.servicePage.create({ data: data as any, include: pageInclude });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: created.id, action: "create", after: created, ip: actor?.ip, userAgent: actor?.userAgent });
    return created;
  },

  async update(id: string, input: ServicePageInput, actor?: Actor) {
    const before = await prisma.servicePage.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page not found", 404);
    const data = normalizeServicePageInput({ ...before, ...input });
    const updated = await prisma.servicePage.update({ where: { id }, data: data as any, include: pageInclude });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: id, action: "update", before, after: updated, ip: actor?.ip, userAgent: actor?.userAgent });
    return updated;
  },

  async patchStatus(id: string, isActive: boolean, actor?: Actor) {
    const before = await prisma.servicePage.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page not found", 404);
    const updated = await prisma.servicePage.update({ where: { id }, data: { isActive }, include: pageInclude });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: id, action: "patch_status", before, after: updated, ip: actor?.ip, userAgent: actor?.userAgent });
    return updated;
  },

  async remove(id: string, actor?: Actor) {
    const before = await prisma.servicePage.findUnique({ where: { id }, include: pageInclude });
    if (!before) throw new AppError("Service page not found", 404);
    await prisma.servicePage.delete({ where: { id } });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page", entityId: id, action: "delete", before, ip: actor?.ip, userAgent: actor?.userAgent });
  },

  async addPlacement(servicePageId: string, input: any, actor?: Actor) {
    const page = await prisma.servicePage.findUnique({ where: { id: servicePageId } });
    if (!page) throw new AppError("Service page not found", 404);
    const product = await prisma.product.findUnique({ where: { id: String(input.productId || "") } });
    if (!product) throw new AppError("Product not found", 404);
    const placement = await prisma.servicePageProductPlacement.upsert({
      where: { servicePageId_productId: { servicePageId, productId: product.id } },
      create: {
        servicePageId,
        productId: product.id,
        sortOrder: Number(input.sortOrder || 100),
        isActive: input.isActive !== false,
        isPinned: input.isPinned === true,
      },
      update: {
        sortOrder: Number(input.sortOrder || 100),
        isActive: input.isActive !== false,
        isPinned: input.isPinned === true,
      },
      include: { product: { include: { visualConfig: true } }, servicePage: true },
    });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page_product_placement", entityId: placement.id, action: "upsert", after: placement, ip: actor?.ip, userAgent: actor?.userAgent });
    return placement;
  },

  async updatePlacement(id: string, input: any, actor?: Actor) {
    const before = await prisma.servicePageProductPlacement.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page placement not found", 404);
    const updated = await prisma.servicePageProductPlacement.update({
      where: { id },
      data: {
        ...(input.sortOrder !== undefined ? { sortOrder: Number(input.sortOrder) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      },
      include: { product: { include: { visualConfig: true } }, servicePage: true },
    });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page_product_placement", entityId: id, action: "update", before, after: updated, ip: actor?.ip, userAgent: actor?.userAgent });
    return updated;
  },

  async removePlacement(id: string, actor?: Actor) {
    const before = await prisma.servicePageProductPlacement.findUnique({ where: { id } });
    if (!before) throw new AppError("Service page placement not found", 404);
    await prisma.servicePageProductPlacement.delete({ where: { id } });
    await writeAuditLog({ userId: actor?.userId, entityType: "service_page_product_placement", entityId: id, action: "delete", before, ip: actor?.ip, userAgent: actor?.userAgent });
  },
};
