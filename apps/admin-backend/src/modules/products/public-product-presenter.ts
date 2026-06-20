import { Currency } from "@prisma/client";
import { deliveryTypeToMethod, resolveProductDeliveryType } from "../../common/utils/product-delivery";
import { toRub } from "../../common/utils/fx";
import { normalizeProductActivationVariants } from "../../common/utils/product-activation-variants";

export type PublicProductLang = "ru" | "en";

function resolveBadge(tags: string[]): "best" | "new" | "hit" | "sale" | "popular" | "limited" | "gift" | "pro" | null {
  const found = tags
    .map((tag) => String(tag || "").toLowerCase())
    .find((tag) => tag.startsWith("badge:"));
  if (!found) return null;
  const value = found.split(":")[1] || "";
  const allowed = new Set(["best", "new", "hit", "sale", "popular", "limited", "gift", "pro"]);
  return allowed.has(value) ? (value as any) : null;
}

function localizedCategory(category: string, lang: PublicProductLang): string {
  const normalized = String(category || "").trim().toLowerCase();

  if (lang === "ru") {
    if (normalized === "subscriptions") return "Подписки";
  }

  return category;
}

function localizedTitle(item: { title: string; titleEn?: string | null }, lang: PublicProductLang) {
  return lang === "en" ? item.titleEn || item.title : item.title;
}

function localizedDescription(item: { description: string; descriptionEn?: string | null }, lang: PublicProductLang) {
  return lang === "en" ? item.descriptionEn || item.description : item.description;
}

function localizedModalDescription(
  item: {
    description: string;
    descriptionEn?: string | null;
    modalDescription?: string | null;
    modalDescriptionEn?: string | null;
  },
  lang: PublicProductLang
) {
  return lang === "en"
    ? item.modalDescriptionEn || item.modalDescription || item.descriptionEn || item.description
    : item.modalDescription || item.description;
}

function buildVisualPayload(item: any, lang: PublicProductLang) {
  const visual = item.visualConfig || null;
  const title = localizedTitle(item, lang);
  const description = localizedDescription(item, lang);
  const buttonText = lang === "en" ? "Choose plan" : "Выбрать тариф";

  return {
    cardTitle: visual?.cardTitle || title,
    cardDescription: visual?.cardDescription || description,
    imageUrl: visual?.imageUrl || "",
    imageAlt: visual?.imageAlt || title,
    hoverImageUrl: visual?.hoverImageUrl || "",
    hoverImageAlt: visual?.hoverImageAlt || title,
    backgroundType: visual?.backgroundType || "solid",
    backgroundColor: visual?.backgroundColor || "#111111",
    backgroundGradient: visual?.backgroundGradient || "",
    buttonText: visual?.buttonText || buttonText,
    buttonStyle: visual?.buttonStyle || "primary",
    isVisible: visual?.isVisible !== false,
  };
}

function buildShowcasePayload(item: any) {
  const placements = Array.isArray(item.showcasePlacements) ? item.showcasePlacements : [];
  return {
    sections: placements
      .filter((placement: any) => placement?.isActive !== false && placement?.section?.isActive !== false)
      .map((placement: any) => ({
        sectionId: placement.sectionId,
        sectionSlug: placement.section?.slug || "",
        sectionTitle: placement.section?.title || "",
        sectionSortOrder: placement.section?.sortOrder ?? 100,
        productSortOrder: placement.sortOrder ?? 100,
        isPinned: placement.isPinned === true,
      })),
  };
}

export function buildPublicProduct(
  item: any,
  lang: PublicProductLang,
  variant?: { key: "withLogin" | "withoutLogin"; price: number; deliveryType: any }
) {
  const deliveryType = variant?.deliveryType || resolveProductDeliveryType(item.tags || []);
  const slugSuffix = variant?.key === "withLogin" ? "login" : variant?.key === "withoutLogin" ? "link" : "";
  const publicSlug = slugSuffix ? `${item.slug}-${slugSuffix}` : item.slug;
  return {
    id: item.id,
    product: publicSlug,
    slug: publicSlug,
    baseSlug: item.slug,
    activationVariant: variant?.key || null,
    title: localizedTitle(item, lang),
    description: localizedDescription(item, lang),
    modalDescription: localizedModalDescription(item, lang),
    price: toRub(Number(variant?.price ?? item.price), item.currency),
    oldPrice: item.oldPrice ? toRub(Number(item.oldPrice), item.currency) : null,
    currency: Currency.RUB,
    category: localizedCategory(item.category, lang),
    stock: item.stock ?? null,
    tags: item.tags,
    badge: resolveBadge(item.tags || []),
    deliveryType,
    deliveryMethod: deliveryTypeToMethod(deliveryType),
    visual: buildVisualPayload(item, lang),
    showcase: buildShowcasePayload(item),
  };
}

export function buildPublicProducts(item: any, lang: PublicProductLang) {
  const fallbackDeliveryType = resolveProductDeliveryType(item.tags || []);
  const variants = normalizeProductActivationVariants(item.activationVariants, {
    price: Number(item.price),
    deliveryType: fallbackDeliveryType,
  });
  if (!variants) return [buildPublicProduct(item, lang)];

  return (["withLogin", "withoutLogin"] as const)
    .filter((key) => variants[key].enabled)
    .map((key) => buildPublicProduct(item, lang, { key, ...variants[key] }));
}

export function fallbackSectionsFromProducts(products: any[], lang: PublicProductLang) {
  const map = new Map<string, { id: string; slug: string; title: string; description: string; sortOrder: number; products: any[] }>();
  products.forEach((item) => {
    const category = localizedCategory(item.category, lang) || (lang === "en" ? "Products" : "Товары");
    const slug = String(category || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "products";
    if (!map.has(slug)) {
      map.set(slug, {
        id: `fallback:${slug}`,
        slug,
        title: category,
        description: "",
        sortOrder: 1000 + map.size,
        products: [],
      });
    }
    map.get(slug)!.products.push(...buildPublicProducts(item, lang));
  });
  return Array.from(map.values());
}
