import { PartnerEarningStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/http/async-handler";
import { validateBody, validateQuery } from "../../common/middleware/validation";
import { AppError } from "../../common/errors/app-error";
import { prisma } from "../../config/prisma";
import { allowRoles, requireAuth } from "../auth/auth.middleware";

function makePromoCode(name: string) {
  const base = String(name || "PARTNER")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base || "PARTNER"}${random}`;
}

async function generateUniquePromoCode(name: string) {
  for (let i = 0; i < 10; i += 1) {
    const next = makePromoCode(name);
    const exists = await prisma.promoCode.findUnique({ where: { code: next } });
    if (!exists) return next;
  }
  throw new AppError("Failed to generate unique promo code", 500);
}

const createPartnerSchema = z.object({
  name: z.string().min(2).max(120),
  payoutPercent: z.coerce.number().min(0).max(100),
  discountType: z.enum(["FIXED", "PERCENT"]),
  discountValue: z.coerce.number().min(0),
  code: z.string().min(2).max(40).optional(),
  isActive: z.boolean().default(true),
});

const updatePartnerSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  payoutPercent: z.coerce.number().min(0).max(100).optional(),
  discountType: z.enum(["FIXED", "PERCENT"]).optional(),
  discountValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

const earningsQuerySchema = z.object({
  status: z.nativeEnum(PartnerEarningStatus).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  partnerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const partnersRouter = Router();

partnersRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN", "MANAGER"]));

partnersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const partners = await prisma.partner.findMany({
      include: { promoCode: true, _count: { select: { orders: true, earnings: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (!partners.length) {
      return res.json({ items: [] });
    }

    const partnerIds = partners.map((item) => item.id);
    const paidStats = await prisma.order.groupBy({
      by: ["partnerId"],
      where: {
        partnerId: { in: partnerIds },
        status: "PAID",
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });

    const paidByPartner = new Map(
      paidStats.map((row) => [
        String(row.partnerId),
        {
          paidDeals: Number(row._count?._all || 0),
          paidRevenue: Number(row._sum?.totalAmount || 0),
        },
      ])
    );

    const items = partners.map((item) => {
      const paid = paidByPartner.get(item.id) || { paidDeals: 0, paidRevenue: 0 };
      return {
        ...item,
        paidDeals: paid.paidDeals,
        paidRevenue: paid.paidRevenue,
      };
    });

    res.json({ items });
  })
);

partnersRouter.post(
  "/",
  validateBody(createPartnerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createPartnerSchema>;
    const code = body.code ? String(body.code).trim().toUpperCase() : await generateUniquePromoCode(body.name);

    const existingCode = await prisma.promoCode.findUnique({ where: { code } });
    if (existingCode) throw new AppError("Promo code already exists", 409);

    const created = await prisma.$transaction(async tx => {
      const partner = await tx.partner.create({
        data: {
          name: body.name.trim(),
          payoutPercent: body.payoutPercent,
        },
      });

      const promo = await tx.promoCode.create({
        data: {
          code,
          kind: "REFERRAL",
          ownerLabel: partner.name,
          discountType: body.discountType,
          discountValue: body.discountValue,
          discountPercent: body.discountType === "PERCENT" ? Math.max(0, Math.min(95, Math.round(body.discountValue))) : 0,
          isActive: body.isActive,
          partnerId: partner.id,
        },
      });

      return { partner, promo };
    });

    console.info(`[partner] created id=${created.partner.id} promo=${created.promo.code}`);
    res.status(201).json(created);
  })
);

partnersRouter.put(
  "/:id",
  validateBody(updatePartnerSchema),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = req.body as z.infer<typeof updatePartnerSchema>;
    const existing = await prisma.partner.findUnique({
      where: { id },
      include: { promoCode: true },
    });
    if (!existing) throw new AppError("Partner not found", 404);
    if (!existing.promoCode) throw new AppError("Partner promo code not found", 404);

    const updated = await prisma.$transaction(async tx => {
      const partner = await tx.partner.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.payoutPercent !== undefined ? { payoutPercent: body.payoutPercent } : {}),
        },
      });

      const promo = await tx.promoCode.update({
        where: { id: existing.promoCode!.id },
        data: {
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.discountType !== undefined ? { discountType: body.discountType } : {}),
          ...(body.discountValue !== undefined ? { discountValue: body.discountValue } : {}),
          ...(body.name !== undefined ? { ownerLabel: body.name.trim() } : {}),
          ...(body.discountType !== undefined || body.discountValue !== undefined
            ? {
                discountPercent:
                  (body.discountType || existing.promoCode!.discountType) === "PERCENT"
                    ? Math.max(0, Math.min(95, Math.round(Number(body.discountValue ?? existing.promoCode!.discountValue))))
                    : 0,
              }
            : {}),
        },
      });
      return { partner, promo };
    });

    console.info(`[partner] updated id=${id}`);
    res.json(updated);
  })
);

partnersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ message: "Partner id is required" });

    const existing = await prisma.partner.findUnique({
      where: { id },
      include: { promoCode: true },
    });
    if (!existing) throw new AppError("Partner not found", 404);

    await prisma.$transaction(async tx => {
      if (existing.promoCode?.id) {
        await tx.promoCode.delete({ where: { id: existing.promoCode.id } });
      }
      await tx.partner.delete({ where: { id } });
    });

    console.info(`[partner] deleted id=${id}`);
    res.status(204).send();
  })
);

export const partnerEarningsRouter = Router();

partnerEarningsRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN", "MANAGER"]));

partnerEarningsRouter.get(
  "/",
  validateQuery(earningsQuerySchema),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.partnerId ? { partnerId: q.partnerId } : {}),
      ...(q.dateFrom || q.dateTo
        ? {
            createdAt: {
              ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
              ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total, payable] = await prisma.$transaction([
      prisma.partnerEarning.findMany({
        where,
        include: { partner: true, order: true },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.partnerEarning.count({ where }),
      prisma.partnerEarning.aggregate({
        where: {
          ...where,
          status: { in: [PartnerEarningStatus.PENDING, PartnerEarningStatus.APPROVED] },
        },
        _sum: { commissionAmount: true },
      }),
    ]);

    res.json({
      items,
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.ceil(total / q.limit),
      payableAmount: Number(payable._sum.commissionAmount || 0),
    });
  })
);

partnerEarningsRouter.post(
  "/:id/mark-paid",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const updated = await prisma.partnerEarning.update({
      where: { id },
      data: {
        status: PartnerEarningStatus.PAID,
        paidAt: new Date(),
      },
    });
    console.info(`[partner] earning paid id=${id}`);
    res.json(updated);
  })
);

