import { Router } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { prisma } from "../../config/prisma";
import { buildPublicProducts, fallbackSectionsFromProducts } from "./public-product-presenter";

export const publicProductsRouter = Router();

publicProductsRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const lang = String(req.query.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";
    const items = await prisma.product.findMany({
      where: {
        isActive: true,
        isArchived: false,
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        titleEn: true,
        description: true,
        descriptionEn: true,
        modalDescription: true,
        modalDescriptionEn: true,
        price: true,
        oldPrice: true,
        activationVariants: true,
        currency: true,
        category: true,
        tags: true,
        stock: true,
        visualConfig: true,
        showcasePlacements: {
          where: {
            isActive: true,
          },
          select: {
            sectionId: true,
            sortOrder: true,
            isPinned: true,
            isActive: true,
            section: {
              select: {
                id: true,
                slug: true,
                title: true,
                sortOrder: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    res.json({
      items: items.flatMap((item) => buildPublicProducts(item, lang)),
    });
  })
);

publicProductsRouter.get(
  "/showcase",
  asyncHandler(async (req, res) => {
    const lang = String(req.query.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";
    const target = String(req.query.target || "homepage").toLowerCase();
    const sectionWhere =
      target === "catalog"
        ? { isActive: true, showInCatalog: true }
        : { isActive: true, showOnHomepage: true };

    const sections = await prisma.productShowcaseSection.findMany({
      where: sectionWhere,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        placements: {
          where: {
            isActive: true,
            product: {
              isActive: true,
              isArchived: false,
            },
          },
          orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            product: {
              include: {
                visualConfig: true,
                showcasePlacements: {
                  where: {
                    isActive: true,
                  },
                  include: {
                    section: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const grouped = sections
      .map((section) => ({
        id: section.id,
        slug: section.slug,
        title: section.title,
        description: section.description,
        sortOrder: section.sortOrder,
        products: section.placements
          .flatMap((placement) => buildPublicProducts(placement.product, lang))
          .filter((product) => product.visual.isVisible),
      }))
      .filter((section) => section.products.length > 0);

    if (grouped.length) {
      return res.json({ sections: grouped });
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        isArchived: false,
      },
      orderBy: [{ createdAt: "asc" }],
      include: {
        visualConfig: true,
        showcasePlacements: {
          where: {
            isActive: true,
          },
          include: {
            section: true,
          },
        },
      },
    });

    res.json({
      sections: fallbackSectionsFromProducts(products, lang).filter((section) =>
        section.products.some((product) => product.visual.isVisible)
      ),
    });
  })
);
