import { Currency } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../../common/http/async-handler";
import { toRub } from "../../common/utils/fx";
import { prisma } from "../../config/prisma";

export const publicProductsRouter = Router();

function resolveBadge(tags: string[]): "best" | "new" | "hit" | "sale" | "popular" | "limited" | "gift" | "pro" | null {
  const found = tags
    .map((tag) => String(tag || "").toLowerCase())
    .find((tag) => tag.startsWith("badge:"));
  if (!found) return null;
  const value = found.split(":")[1] || "";
  const allowed = new Set(["best", "new", "hit", "sale", "popular", "limited", "gift", "pro"]);
  return allowed.has(value) ? (value as any) : null;
}

function localizedCategory(category: string, lang: "ru" | "en"): string {
  const normalized = String(category || "").trim().toLowerCase();

  if (lang === "ru") {
    if (normalized === "subscriptions") return "Подписки";
  }

  return category;
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
        price: true,
        oldPrice: true,
        currency: true,
        category: true,
        tags: true,
      },
    });

    res.json({
      items: items.map(item => ({
        id: item.id,
        product: item.slug,
        title: lang === "en" ? item.titleEn || item.title : item.title,
        description: lang === "en" ? item.descriptionEn || item.description : item.description,
        price: toRub(Number(item.price), item.currency),
        oldPrice: item.oldPrice ? toRub(Number(item.oldPrice), item.currency) : null,
        currency: Currency.RUB,
        category: localizedCategory(item.category, lang),
        tags: item.tags,
        badge: resolveBadge(item.tags),
      })),
    });
  })
);
