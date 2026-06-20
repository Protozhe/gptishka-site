import { ProductVisualBackgroundType } from "@prisma/client";
import slugify from "../../common/utils/slugify";
import { AppError } from "../../common/errors/app-error";
import { prisma } from "../../config/prisma";
import { deleteProductImageByUrl, saveProductImage } from "../files/files.service";
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
    buttonText: "Выбрать тариф",
    buttonStyle: "primary",
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
    buttonText: String(input.buttonText || "").trim(),
    buttonStyle: String(input.buttonStyle || "").trim(),
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
    const imageUrl = saveProductImage(file);

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
        buttonText: "",
        buttonStyle: "",
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
    const hoverImageUrl = saveProductImage(file);

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
        buttonText: "",
        buttonStyle: "",
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
