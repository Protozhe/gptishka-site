import slugify from "../../common/utils/slugify";
import { AppError } from "../../common/errors/app-error";
import { productsRepository } from "./products.repository";
import { writeAuditLog } from "../audit/audit.service";

export const productsService = {
  async getUniqueSlug(baseSlug: string, excludeId?: string) {
    let slug = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await productsRepository.findBySlug(slug);
      if (!existing || (excludeId && existing.id === excludeId)) return slug;
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  },

  async list(params: any) {
    return productsRepository.list(params);
  },

  async getById(id: string) {
    const product = await productsRepository.findById(id);
    if (!product) throw new AppError("Product not found", 404);
    return product;
  },

  async create(input: any, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const uniqueSlug = await this.getUniqueSlug(slugify(input.title));

    const created = await productsRepository.create({
      slug: uniqueSlug,
      title: input.title,
      titleEn: input.titleEn,
      description: input.description,
      descriptionEn: input.descriptionEn,
      price: input.price,
      oldPrice: input.oldPrice ?? null,
      currency: input.currency,
      category: input.category,
      tags: input.tags ?? [],
      stock: input.stock ?? null,
      isActive: input.isActive ?? true,
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: created.id,
      action: "create",
      after: created,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return created;
  },

  async update(id: string, input: any, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const before = await productsRepository.findById(id);
    if (!before) throw new AppError("Product not found", 404);
    const nextSlug = input.title ? await this.getUniqueSlug(slugify(input.title), id) : undefined;

    const updated = await productsRepository.update(id, {
      ...(input.title ? { title: input.title, slug: nextSlug } : {}),
      ...(input.titleEn !== undefined ? { titleEn: input.titleEn } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.oldPrice !== undefined ? { oldPrice: input.oldPrice } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: updated.id,
      action: "update",
      before,
      after: updated,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return updated;
  },

  async patchStatus(id: string, input: { isActive?: boolean; isArchived?: boolean }, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const before = await productsRepository.findById(id);
    if (!before) throw new AppError("Product not found", 404);

    const updated = await productsRepository.update(id, {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
    });

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: updated.id,
      action: "patch_status",
      before,
      after: updated,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return updated;
  },

  async remove(id: string, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const before = await productsRepository.findById(id);
    if (!before) throw new AppError("Product not found", 404);
    await productsRepository.remove(id);

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: id,
      action: "delete",
      before,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });
  },

  async bulkPrice(productIds: string[], mode: "set" | "percent", value: number, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    const changed = await productsRepository.bulkPrice(productIds, mode, value);

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: productIds.join(","),
      action: "bulk_price",
      after: { mode, value, productIds },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return changed;
  },

  async addImage(productId: string, url: string, actor?: { userId?: string; ip?: string; userAgent?: string }) {
    await this.getById(productId);
    const image = await productsRepository.addImage(productId, url);

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: productId,
      action: "add_image",
      after: image,
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return image;
  },
};
