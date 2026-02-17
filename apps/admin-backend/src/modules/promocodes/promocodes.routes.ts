import { PromoCodeKind } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/http/async-handler";
import { validateBody } from "../../common/middleware/validation";
import { toRub } from "../../common/utils/fx";
import { prisma } from "../../config/prisma";
import { allowRoles, requireAuth } from "../auth/auth.middleware";

const createPromoSchema = z.object({
  code: z.string().min(2).max(40),
  kind: z.nativeEnum(PromoCodeKind).default(PromoCodeKind.GENERAL),
  discountType: z.enum(["FIXED", "PERCENT"]).default("PERCENT"),
  discountValue: z.coerce.number().min(0).default(0),
  ownerLabel: z.string().max(120).optional(),
  campaign: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  discountPercent: z.coerce.number().int().min(0).max(95),
  usageLimit: z.coerce.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const promoCodesRouter = Router();

promoCodesRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN", "MANAGER"]));

promoCodesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ items });
  })
);

promoCodesRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const promos = await prisma.promoCode.findMany({
      include: {
        orders: {
          where: { status: "PAID" },
          select: {
            id: true,
            totalAmount: true,
            subtotalAmount: true,
            discountAmount: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = promos.map((p) => {
      const ordersCount = p.orders.length;
      const revenueRub = p.orders.reduce((sum, o) => sum + toRub(Number(o.totalAmount), o.currency), 0);
      const subtotalRub = p.orders.reduce((sum, o) => sum + toRub(Number(o.subtotalAmount), o.currency), 0);
      const discountRub = p.orders.reduce((sum, o) => sum + toRub(Number(o.discountAmount), o.currency), 0);

      return {
        id: p.id,
        code: p.code,
        kind: p.kind,
        ownerLabel: p.ownerLabel,
        campaign: p.campaign,
        discountType: p.discountType,
        discountValue: p.discountValue,
        discountPercent: p.discountPercent,
        usedCount: p.usedCount,
        usageLimit: p.usageLimit,
        isActive: p.isActive,
        expiresAt: p.expiresAt,
        ordersPaid: ordersCount,
        revenueRub: Number(revenueRub.toFixed(2)),
        grossRub: Number(subtotalRub.toFixed(2)),
        discountRub: Number(discountRub.toFixed(2)),
      };
    });

    res.json({ items });
  })
);

promoCodesRouter.post(
  "/",
  validateBody(createPromoSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createPromoSchema>;
    const item = await prisma.promoCode.create({
      data: {
        code: body.code.trim().toUpperCase(),
        kind: body.kind,
        ownerLabel: body.ownerLabel || null,
        campaign: body.campaign || null,
        note: body.note || null,
        discountType: body.discountType,
        discountValue: body.discountValue,
        discountPercent: body.discountType === "PERCENT" ? body.discountPercent : 0,
        usageLimit: body.usageLimit ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    res.status(201).json(item);
  })
);

promoCodesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ message: "Promo code id is required" });

    const existing = await prisma.promoCode.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return res.status(404).json({ message: "Promo code not found" });

    await prisma.promoCode.delete({ where: { id } });
    res.status(204).send();
  })
);
