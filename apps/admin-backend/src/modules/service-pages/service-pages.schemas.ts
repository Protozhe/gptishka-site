import { z } from "zod";

const nullableText = (max = 2048) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => String(value || "").trim());

const jsonArray = z
  .union([z.array(z.any()), z.null()])
  .optional()
  .transform((value) => (Array.isArray(value) ? value : []));

export const servicePageSchema = z.object({
  slug: nullableText(80),
  path: nullableText(160),
  serviceKey: nullableText(80),
  title: z.string().min(2).max(120),
  titleEn: nullableText(120),
  heroEyebrow: nullableText(80),
  heroTitle: nullableText(120),
  heroDescription: nullableText(700),
  heroVideoUrl: nullableText(2048),
  heroImageUrl: nullableText(2048),
  heroLogoUrl: nullableText(2048),
  theme: nullableText(40),
  accentColor: nullableText(40),
  accentGradient: nullableText(500),
  darkOverlay: nullableText(500),
  colorOverlay: nullableText(500),
  constructorTitle: nullableText(120),
  constructorDescription: nullableText(700),
  infoSections: jsonArray,
  faqItems: jsonArray,
  paymentCaptionLava: nullableText(120),
  paymentCaptionEnot: nullableText(120),
  isActive: z.boolean().default(true),
  isIndexed: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(100),
});

export const servicePageUpdateSchema = servicePageSchema.partial();

export const servicePagePlacementSchema = z.object({
  productId: z.string().min(10),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(100),
  isActive: z.boolean().default(true),
  isPinned: z.boolean().default(false),
});

export const servicePagePlacementUpdateSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

export const servicePageStatusSchema = z.object({
  isActive: z.boolean(),
});
