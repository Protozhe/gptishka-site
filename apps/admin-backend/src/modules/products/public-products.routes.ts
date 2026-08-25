import { Router } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { prisma } from "../../config/prisma";
import { buildPublicProducts, fallbackSectionsFromProducts, isHiddenPublicVpnProduct } from "./public-product-presenter";
import { showcaseService } from "../showcase/showcase.service";

export const publicProductsRouter = Router();

function buildPublicServiceCardsPayload(serviceCards: any[]) {
  return (Array.isArray(serviceCards) ? serviceCards : [])
    .filter((card) => String(card?.serviceKey || "").toLowerCase() !== "vpn")
    .map((card) => ({
    serviceKey: card.serviceKey,
    title: card.title,
    description: card.description,
    planSummary: card.planSummary,
    priceText: card.priceText,
    buttonText: card.buttonText,
    href: card.href,
    iconText: card.iconText,
    theme: card.theme,
    imageUrl: card.imageUrl,
    imageAlt: card.imageAlt,
    hoverImageUrl: card.hoverImageUrl,
    hoverImageAlt: card.hoverImageAlt,
    backgroundType: card.backgroundType,
    backgroundColor: card.backgroundColor,
    backgroundGradient: card.backgroundGradient,
    textColor: card.textColor,
    buttonBackground: card.buttonBackground,
    buttonTextColor: card.buttonTextColor,
    isActive: card.isActive !== false,
    sortOrder: card.sortOrder,
    }));
}

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
      items: items.filter((item) => !isHiddenPublicVpnProduct(item)).flatMap((item) => buildPublicProducts(item, lang)),
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

    const [sections, serviceCards] = await Promise.all([
      prisma.productShowcaseSection.findMany({
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
      }),
      showcaseService.listServiceCards(),
    ]);
    const serviceCardPayload = buildPublicServiceCardsPayload(serviceCards);

    const grouped = sections
      .map((section) => ({
        id: section.id,
        slug: section.slug,
        title: section.title,
        description: section.description,
        sortOrder: section.sortOrder,
        renderMode: section.renderMode || "auto",
        serviceCards: serviceCardPayload,
        products: section.placements
          .filter((placement) => !isHiddenPublicVpnProduct(placement.product))
          .flatMap((placement) => buildPublicProducts(placement.product, lang))
          .filter((product) => product.visual.isVisible),
      }))
      .filter((section) => section.products.length > 0);

    if (grouped.length) {
      return res.json({ sections: grouped, serviceCards: serviceCardPayload });
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
      sections: fallbackSectionsFromProducts(
        products.filter((item) => !isHiddenPublicVpnProduct(item)),
        lang
      ).filter((section) => section.products.some((product) => product.visual.isVisible)),
      serviceCards: serviceCardPayload,
    });
  })
);
