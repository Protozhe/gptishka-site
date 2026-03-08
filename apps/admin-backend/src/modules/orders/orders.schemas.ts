import { OrderStatus } from "@prisma/client";
import { z } from "zod";

export const ordersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  paymentMethod: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "totalAmount"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export const manualConfirmSchema = z.object({
  paymentId: z.string().min(3),
  paymentMethod: z.string().min(2),
});

export const createOrderSchema = z.object({
  email: z.string().email(),
  productId: z.string().min(10),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  paymentMethod: z.string().min(2).optional(),
  country: z.string().max(2).optional(),
  promoCode: z.string().min(2).max(40).optional(),
});

export const storefrontTickerSettingsSchema = z
  .object({
    hiddenEmails: z.array(z.string().trim().min(3).max(320)).max(500).optional(),
    hiddenOrderIds: z.array(z.string().trim().min(6).max(120)).max(1000).optional(),
  })
  .refine((payload) => payload.hiddenEmails !== undefined || payload.hiddenOrderIds !== undefined, {
    message: "At least one field must be provided",
  });
