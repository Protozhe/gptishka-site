import { ProductVisualBackgroundType } from "@prisma/client";
import { z } from "zod";

const nullableText = (max = 2048) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => String(value || "").trim());

export const productVisualConfigSchema = z.object({
  cardTitle: nullableText(150),
  cardDescription: nullableText(500),
  imageUrl: nullableText(2048),
  imageAlt: nullableText(180),
  hoverImageUrl: nullableText(2048),
  hoverImageAlt: nullableText(180),
  backgroundType: z.nativeEnum(ProductVisualBackgroundType).default(ProductVisualBackgroundType.solid),
  backgroundColor: nullableText(80),
  backgroundGradient: nullableText(500),
  buttonText: nullableText(80),
  buttonStyle: nullableText(80),
  isVisible: z.boolean().default(true),
});

export const showcaseSectionSchema = z.object({
  slug: z.string().min(2).max(80).optional(),
  title: z.string().min(2).max(120),
  description: nullableText(500),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(100),
  isActive: z.boolean().default(true),
  showOnHomepage: z.boolean().default(true),
  showInCatalog: z.boolean().default(true),
});

export const showcaseSectionUpdateSchema = showcaseSectionSchema.partial();

export const showcasePlacementSchema = z.object({
  productId: z.string().min(10),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(100),
  isActive: z.boolean().default(true),
  isPinned: z.boolean().default(false),
});

export const showcasePlacementUpdateSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});
