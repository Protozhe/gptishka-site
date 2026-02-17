import { Router } from "express";
import { prisma } from "../../config/prisma";
import { requireAuth, allowRoles } from "../auth/auth.middleware";
import { asyncHandler } from "../../common/http/async-handler";

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, allowRoles(["OWNER", "ADMIN"]));

analyticsRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayAgg, monthAgg, paidCount, avgTicket, topOrderItems] = await prisma.$transaction([
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: "PAID", createdAt: { gte: todayStart } },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: "PAID", createdAt: { gte: monthStart } },
      }),
      prisma.order.count({ where: { status: "PAID", createdAt: { gte: monthStart } } }),
      prisma.order.aggregate({
        _avg: { totalAmount: true },
        where: { status: "PAID", createdAt: { gte: monthStart } },
      }),
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: { status: "PAID" },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
    ]);

    const topProductsEnriched = await Promise.all(
      topOrderItems.map(async (item) => {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        return {
          productId: item.productId,
          title: product?.title || "Deleted product",
          qty: item._sum?.quantity || 0,
        };
      })
    );

    const last30days = [...Array(30)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const salesSeries = await Promise.all(
      last30days.map(async (day) => {
        const next = new Date(day);
        next.setDate(next.getDate() + 1);

        const result = await prisma.order.aggregate({
          _sum: { totalAmount: true },
          _count: { _all: true },
          where: {
            status: "PAID",
            createdAt: {
              gte: day,
              lt: next,
            },
          },
        });

        return {
          date: toDateOnly(day),
          revenue: Number(result._sum.totalAmount || 0),
          orders: result._count._all,
        };
      })
    );

    // Dashboard uses only completed deals.
    const conversion = paidCount > 0 ? 100 : 0;

    res.json({
      revenueToday: Number(todayAgg._sum.totalAmount || 0),
      revenueMonth: Number(monthAgg._sum.totalAmount || 0),
      ordersMonth: paidCount,
      conversion,
      avgTicket: Number(avgTicket._avg.totalAmount || 0),
      topProducts: topProductsEnriched,
      salesSeries,
    });
  })
);
