import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

export const ordersRepository = {
  async list(params: any) {
    const searchQuery = String(params.q || "").trim();
    const where: Prisma.OrderWhereInput = {
      ...(searchQuery
        ? {
            OR: [
              { id: { contains: searchQuery, mode: "insensitive" } },
              { email: { contains: searchQuery, mode: "insensitive" } },
              { paymentId: { contains: searchQuery, mode: "insensitive" } },
              { telegramUserId: { contains: searchQuery, mode: "insensitive" } },
              { telegramUsername: { contains: searchQuery, mode: "insensitive" } },
              { telegramChatId: { contains: searchQuery, mode: "insensitive" } },
              { items: { some: { product: { title: { contains: searchQuery, mode: "insensitive" } } } } },
              { items: { some: { product: { slug: { contains: searchQuery, mode: "insensitive" } } } } },
            ],
          }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(params.botType ? { botType: params.botType } : {}),
      ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          email: true,
          status: true,
          source: true,
          botType: true,
          telegramUserId: true,
          telegramUsername: true,
          telegramChatId: true,
          telegramLastError: true,
          paymentMethod: true,
          paymentId: true,
          orderDetails: true,
          promoCodeSnapshot: true,
          country: true,
          ip: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              productId: true,
              productRaw: true,
              price: true,
              quantity: true,
              product: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  tags: true,
                },
              },
            },
            orderBy: { id: "asc" },
            take: 1,
          },
          payments: {
            select: {
              status: true,
              provider: true,
              providerRef: true,
              payload: true,
              processedAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
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
