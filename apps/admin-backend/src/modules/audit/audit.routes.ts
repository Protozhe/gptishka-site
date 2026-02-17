import { Router } from "express";
import { requireAuth, allowRoles } from "../auth/auth.middleware";
import { prisma } from "../../config/prisma";
import { asyncHandler } from "../../common/http/async-handler";

export const auditRouter = Router();

auditRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN"]));

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Math.min(100, Number(req.query.limit || 20));

    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        include: { user: { select: { email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  })
);
