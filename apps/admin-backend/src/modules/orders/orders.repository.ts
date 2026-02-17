import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

export const ordersRepository = {
  async list(params: any) {
    const where: Prisma.OrderWhereInput = {
      ...(params.q
        ? {
            OR: [
              { email: { contains: params.q, mode: "insensitive" } },
              { paymentId: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          items: { include: { product: true } },
          payments: true,
          promoCode: true,
        },
        orderBy: { [params.sortBy]: params.sortDir },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  },

  findById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, payments: true, promoCode: true },
    });
  },
};
