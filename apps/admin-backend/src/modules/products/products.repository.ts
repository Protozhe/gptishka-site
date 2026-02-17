import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

export type ProductListParams = {
  page: number;
  limit: number;
  q?: string;
  category?: string;
  isActive?: boolean;
  isArchived?: boolean;
  sortBy: "createdAt" | "updatedAt" | "price" | "title";
  sortDir: "asc" | "desc";
};

export const productsRepository = {
  async list(params: ProductListParams) {
    const where: Prisma.ProductWhereInput = {
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { titleEn: { contains: params.q, mode: "insensitive" } },
              { description: { contains: params.q, mode: "insensitive" } },
              { descriptionEn: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.isArchived !== undefined ? { isArchived: params.isArchived } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { images: true },
        orderBy: { [params.sortBy]: params.sortDir },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id }, include: { images: true } });
  },

  findBySlug(slug: string) {
    return prisma.product.findUnique({ where: { slug } });
  },

  create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({ data, include: { images: true } });
  },

  update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data, include: { images: true } });
  },

  remove(id: string) {
    return prisma.product.delete({ where: { id } });
  },

  async bulkPrice(productIds: string[], mode: "set" | "percent", value: number) {
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    for (const p of products) {
      const nextPrice =
        mode === "set"
          ? value
          : Number((Number(p.price) + (Number(p.price) * value) / 100).toFixed(2));

      await prisma.product.update({ where: { id: p.id }, data: { price: nextPrice } });
    }

    return prisma.product.findMany({ where: { id: { in: productIds } }, include: { images: true } });
  },

  addImage(productId: string, url: string) {
    return prisma.productImage.create({ data: { productId, url } });
  },
};
