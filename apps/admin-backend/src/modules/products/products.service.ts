import slugify from "../../common/utils/slugify";
import { AppError } from "../../common/errors/app-error";
import { applyProductDeliveryTypeTag, methodToDeliveryType } from "../../common/utils/product-delivery";
import { productsRepository } from "./products.repository";
import { writeAuditLog } from "../audit/audit.service";
import { manualCredentialsStore, type ManualCredentialStatus } from "./manual-credentials.store";

const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const TRANSLATE_TIMEOUT_MS = 7000;

function normalizeTranslationText(value: string): string {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseGoogleTranslateResponse(payload: any): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return "";
  }

  return payload[0]
    .map((chunk: any) => (Array.isArray(chunk) ? String(chunk[0] || "") : ""))
    .join("")
    .trim();
}

async function translateTextRuToEn(text: string): Promise<string> {
  const source = normalizeTranslationText(text);
  if (!source) return "";

  const hasCyrillic = /[А-Яа-яЁё]/.test(source);
  if (!hasCyrillic) return source;

  const url = new URL(TRANSLATE_ENDPOINT);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "ru");
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", source);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Translation upstream responded with ${response.status}`);
    }

    const payload = await response.json();
    const translated = normalizeTranslationText(parseGoogleTranslateResponse(payload));
    if (!translated) {
      throw new Error("Empty translation response");
    }

    return translated;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateMultilineRuToEn(text: string): Promise<string> {
  const source = String(text || "").replace(/\r/g, "").trim();
  if (!source) return "";

  const lines = source.split("\n");
  if (lines.length <= 1) {
    return translateTextRuToEn(source);
  }

  const translatedLines = await Promise.all(
    lines.map(async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      return translateTextRuToEn(trimmed);
    })
  );

  return normalizeTranslationText(translatedLines.join("\n"));
}

function parseCredentialLine(line: string) {
  const value = String(line || "").trim();
  if (!value) return null;

  const separators = ["|", ";", ",", "\t", ":"];
  for (const separator of separators) {
    const index = value.indexOf(separator);
    if (index <= 0) continue;
    const login = value.slice(0, index).trim();
    const password = value.slice(index + 1).trim();
    if (!login || !password) continue;
    return { login, password };
  }

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      login: parts[0],
      password: parts.slice(1).join(" "),
    };
  }

  return null;
}

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
    const requestedDeliveryType =
      input.deliveryType !== undefined ? input.deliveryType : methodToDeliveryType(input.deliveryMethod);
    const nextTags = applyProductDeliveryTypeTag(input.tags ?? [], requestedDeliveryType);

    const created = await productsRepository.create({
      slug: uniqueSlug,
      title: input.title,
      titleEn: input.titleEn,
      description: input.description,
      descriptionEn: input.descriptionEn,
      modalDescription: input.modalDescription ?? "",
      modalDescriptionEn: input.modalDescriptionEn ?? "",
      price: input.price,
      oldPrice: input.oldPrice ?? null,
      currency: input.currency,
      category: input.category,
      tags: nextTags,
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
    const requestedDeliveryType =
      input.deliveryType !== undefined
        ? input.deliveryType
        : input.deliveryMethod !== undefined
        ? methodToDeliveryType(input.deliveryMethod)
        : undefined;
    const tagsForUpdate =
      input.tags !== undefined || requestedDeliveryType !== undefined
        ? applyProductDeliveryTypeTag(input.tags !== undefined ? input.tags : before.tags, requestedDeliveryType)
        : undefined;

    const updated = await productsRepository.update(id, {
      ...(input.title ? { title: input.title, slug: nextSlug } : {}),
      ...(input.titleEn !== undefined ? { titleEn: input.titleEn } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
      ...(input.modalDescription !== undefined ? { modalDescription: input.modalDescription } : {}),
      ...(input.modalDescriptionEn !== undefined ? { modalDescriptionEn: input.modalDescriptionEn } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.oldPrice !== undefined ? { oldPrice: input.oldPrice } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(tagsForUpdate !== undefined ? { tags: tagsForUpdate } : {}),
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

  async listManualCredentials(
    productId: string,
    options?: { status?: ManualCredentialStatus; q?: string }
  ) {
    await this.getById(productId);
    const items = manualCredentialsStore.listByProduct(productId, options);
    const stats = manualCredentialsStore.statsByProduct(productId);
    return { items, stats };
  },

  async importManualCredentials(
    productId: string,
    input: { rows?: string[]; text?: string },
    actor?: { userId?: string; ip?: string; userAgent?: string }
  ) {
    await this.getById(productId);
    const fromRows = Array.isArray(input.rows) ? input.rows : [];
    const fromText = String(input.text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const parsedEntries = [...fromRows, ...fromText]
      .map((line) => parseCredentialLine(line))
      .filter((entry): entry is { login: string; password: string } => Boolean(entry));
    if (!parsedEntries.length) {
      throw new AppError("No valid login/password rows found", 400);
    }

    const result = manualCredentialsStore.import(productId, parsedEntries);
    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: productId,
      action: "import_manual_credentials",
      after: { inserted: result.inserted, skipped: result.skipped },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return {
      ...result,
      stats: manualCredentialsStore.statsByProduct(productId),
    };
  },

  async deleteManualCredential(
    productId: string,
    credentialId: string,
    actor?: { userId?: string; ip?: string; userAgent?: string }
  ) {
    await this.getById(productId);
    const result = manualCredentialsStore.deleteAvailableById(productId, credentialId);
    if (!result.ok) {
      if (result.reason === "not_available") {
        throw new AppError("Only unassigned credentials can be deleted", 409);
      }
      throw new AppError("Credential not found", 404);
    }

    await writeAuditLog({
      userId: actor?.userId,
      entityType: "product",
      entityId: productId,
      action: "delete_manual_credential",
      after: { credentialId },
      ip: actor?.ip,
      userAgent: actor?.userAgent,
    });

    return { ok: true };
  },

  async translateRuToEn(titleRu: string, descriptionRu: string) {
    const cleanTitle = String(titleRu || "").trim();
    const cleanDescription = String(descriptionRu || "").trim();

    if (!cleanTitle || !cleanDescription) {
      throw new AppError("Both title and description are required for translation", 400);
    }

    const [titleEn, descriptionEn] = await Promise.all([
      translateTextRuToEn(cleanTitle),
      translateMultilineRuToEn(cleanDescription),
    ]);

    return {
      titleEn: titleEn || cleanTitle,
      descriptionEn: descriptionEn || cleanDescription,
      provider: "google-translate-gtx",
    };
  },
};
