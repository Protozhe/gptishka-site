import { Currency } from "@prisma/client";
import { z } from "zod";

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const productQuerySchema = pagination.extend({
  q: z.string().optional(),
  category: z.string().optional(),
  isActive: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined)),
  isArchived: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined)),
  sortBy: z.enum(["createdAt", "updatedAt", "price", "title"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const productBody = z.object({
  title: z.string().min(3).max(150),
  titleEn: z.string().min(3).max(150),
  description: z.string().min(10).max(5000),
  descriptionEn: z.string().min(10).max(5000),
  price: z.coerce.number().positive(),
  oldPrice: z.coerce.number().positive().nullable().optional(),
  currency: z.nativeEnum(Currency),
  category: z.string().min(2).max(100),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  stock: z.coerce.number().int().min(0).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const createProductSchema = productBody;
export const updateProductSchema = productBody.partial();

export const bulkPriceSchema = z.object({
  productIds: z.array(z.string().min(10)).min(1),
  mode: z.enum(["set", "percent"]),
  value: z.coerce.number(),
});

export const statusPatchSchema = z.object({
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});
