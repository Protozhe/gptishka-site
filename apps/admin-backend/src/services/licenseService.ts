import { prisma } from "../config/prisma";
import { normalizeActivationSiteUrl } from "../common/utils/activation-site";
import { canonicalProductKey } from "../common/utils/product-key";
import { AppError } from "../common/errors/app-error";
import { validateChatGptPlusKeyImport } from "../modules/cdks/chatgpt-plus-pool-validation";
import { CodexKeySupplier, resolveCodexImportSite } from "../modules/cdks/codex-key-suppliers";

export type LicenseKeyStatus = "available" | "reserved" | "used" | "revoked";

function asJson(value: unknown) {
  return value as any;
}

function normalizeKeyValue(value: string) {
  return String(value || "").trim().toUpperCase();
}

const GEMINI_ACTIVATION_LINK_PRODUCT_KEY = "gemini-pro-18";

function isGeminiActivationLinkPool(productKey: string) {
  return canonicalProductKey(productKey) === GEMINI_ACTIVATION_LINK_PRODUCT_KEY;
}

function normalizeKeyValueForProduct(productKey: string, value: string) {
  const raw = String(value || "").trim();
  return isGeminiActivationLinkPool(productKey) ? raw : raw.toUpperCase();
}

function validateGeminiActivationLinks(productKey: string, values: string[]) {
  if (!isGeminiActivationLinkPool(productKey)) return;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    } catch {
      throw new AppError(
        `Строка ${index + 1}: для Gemini нужна полная ссылка, начинающаяся с http:// или https://`,
        400
      );
    }
  }
}

function normalizeEmail(value: string | null | undefined) {
  const v = String(value || "").trim().toLowerCase();
  return v || null;
}

function now() {
  return new Date();
}

async function resolveAuditUserId(userId?: string | null) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  return user?.id || null;
}

export const licenseService = {
  async changeUnusedCodexSupplier(id: string, supplier: CodexKeySupplier, expectedSite: string, actor?: { userId?: string }) {
    const auditUserId = await resolveAuditUserId(actor?.userId);
    return prisma.$transaction(async (tx) => {
      const row = await tx.licenseKey.findUnique({ where: { id } });
      if (!row) throw new AppError("Ключ не найден", 404);
      if (row.status !== "available" || row.orderId || row.usedAt || row.reservedAt) {
        throw new AppError("Поставщика можно менять только у свободного ключа без привязки к заказу", 409);
      }
      if (row.activationSiteUrl !== expectedSite) throw new AppError("Данные ключа изменились. Обновите страницу", 409);
      const activationSiteUrl = resolveCodexImportSite(row.productKey, undefined, supplier);
      const result = await tx.licenseKey.updateMany({
        where: { id, status: "available", orderId: null, usedAt: null, reservedAt: null, activationSiteUrl: expectedSite },
        data: { activationSiteUrl },
      });
      if (result.count !== 1) throw new AppError("Ключ уже выдан или изменён. Обновите страницу", 409);
      await tx.licenseKeyAuditLog.create({ data: {
        keyId: id, action: "change_supplier", userId: auditUserId,
        meta: asJson({ productKey: row.productKey, supplier, activationSiteUrl, previousActivationSiteUrl: expectedSite }),
      } });
      return { id, supplier, activationSiteUrl };
    });
  },

  async createKey(
    productKey: string,
    keyValue: string,
    actor?: { userId?: string },
    meta?: Record<string, unknown> & { activationSiteUrl?: string }
  ) {
    const pk = canonicalProductKey(productKey);
    const kv = normalizeKeyValueForProduct(pk, keyValue);
    const activationSiteUrl = normalizeActivationSiteUrl(meta?.activationSiteUrl);
    if (!pk) throw new Error("productKey is required");
    if (!kv) throw new Error("keyValue is required");
    validateGeminiActivationLinks(pk, [kv]);
    const poolError = validateChatGptPlusKeyImport(pk, activationSiteUrl, [kv]);
    if (poolError) throw new AppError(poolError, 400);

    const row = await prisma.licenseKey.create({
      data: {
        productKey: pk,
        keyValue: kv,
        activationSiteUrl,
        status: "available",
      },
      select: { id: true, productKey: true, status: true, createdAt: true, updatedAt: true },
    });

    const auditUserId = await resolveAuditUserId(actor?.userId);

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: row.id,
        action: "create",
        userId: auditUserId,
        meta: meta ? asJson(meta) : undefined,
      },
    });

    return row;
  },

  async importKeys(
    productKey: string,
    codes: string[],
    actor?: { userId?: string },
    options?: { activationSiteUrl?: string }
  ) {
    const pk = canonicalProductKey(productKey);
    const activationSiteUrl = normalizeActivationSiteUrl(options?.activationSiteUrl);
    const normalized = (codes || []).map((code) => normalizeKeyValueForProduct(pk, code)).filter(Boolean);
    const unique = Array.from(new Set(normalized));

    if (!pk) throw new Error("productKey is required");
    validateGeminiActivationLinks(pk, unique);
    const poolError = validateChatGptPlusKeyImport(pk, activationSiteUrl, unique);
    if (poolError) throw new AppError(poolError, 400);
    if (unique.length === 0) {
      return {
        inserted: 0,
        skipped: 0,
        activationSiteUrl,
        conflicts: 0,
        conflictsByProductKey: {} as Record<string, number>,
        conflictDetails: [] as Array<{
          code: string;
          productKey: string;
          status: LicenseKeyStatus;
          orderId: string | null;
          email: string | null;
          activationSiteUrl: string;
        }>,
      };
    }

    // If the product exists by slug, keep a stable FK for future audits/queries.
    const product = await prisma.product.findUnique({
      where: { slug: pk },
      select: { id: true },
    });

    // A duplicate must never silently relabel a key's product or activation site.
    const existing = await prisma.licenseKey.findMany({
      where: { keyValue: { in: unique } },
      select: { keyValue: true, productKey: true, activationSiteUrl: true, status: true, orderId: true, email: true },
    });
    const conflictsByProductKey: Record<string, number> = {};
    const conflictDetails: Array<{
      code: string;
      productKey: string;
      activationSiteUrl: string;
      status: LicenseKeyStatus;
      orderId: string | null;
      email: string | null;
    }> = [];
    let conflicts = 0;
    for (const row of existing) {
      if (row.productKey !== pk || normalizeActivationSiteUrl(row.activationSiteUrl) !== activationSiteUrl) {
        conflicts++;
        conflictsByProductKey[row.productKey] = (conflictsByProductKey[row.productKey] || 0) + 1;
        conflictDetails.push({
          code: row.keyValue,
          productKey: row.productKey,
          activationSiteUrl: row.activationSiteUrl || "",
          status: row.status,
          orderId: row.orderId,
          email: row.email,
        });
      }
    }

    // Insert new keys; duplicates are skipped due to UNIQUE(key_value).
    const created = await prisma.licenseKey.createMany({
      data: unique.map((kv) => ({
        productKey: pk,
        productId: product?.id || null,
        keyValue: kv,
        activationSiteUrl,
        status: "available",
      })),
      skipDuplicates: true,
    });

    const inserted = created.count;
    const skipped = Math.max(0, unique.length - inserted);

    const auditUserId = await resolveAuditUserId(actor?.userId);

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: null,
        action: "import",
        userId: auditUserId,
        meta: asJson({ productKey: pk, activationSiteUrl, inserted, skipped, conflicts, conflictsByProductKey, conflictDetails }),
      },
    });

    return { inserted, skipped, conflicts, conflictsByProductKey, conflictDetails, activationSiteUrl };
  },

  async getKeysByProduct(productKey: string, params?: { status?: LicenseKeyStatus; q?: string; page?: number; limit?: number }) {
    const pk = productKey ? canonicalProductKey(productKey) : "";
    const q = String(params?.q || "").trim().toUpperCase();
    const page = Math.max(1, Number(params?.page || 1));
    const limit = Math.max(1, Math.min(200, Number(params?.limit || 50)));
    const status = params?.status;

    const where: any = {};
    if (pk) where.productKey = pk;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { keyValue: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { orderId: { contains: q, mode: "insensitive" } },
        { productKey: { contains: q, mode: "insensitive" } },
        { activationSiteUrl: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, items] = await prisma.$transaction([
      prisma.licenseKey.count({ where }),
      prisma.licenseKey.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const statsRows = await prisma.licenseKey.groupBy({
      by: ["productKey", "status"],
      _count: { _all: true },
    });

    const byProduct: Record<string, { available: number; reserved: number; used: number; revoked: number; total: number }> = {};
    for (const r of statsRows) {
      const key = r.productKey;
      if (!byProduct[key]) byProduct[key] = { available: 0, reserved: 0, used: 0, revoked: 0, total: 0 };
      const n = r._count._all;
      (byProduct[key] as any)[r.status] = n;
      byProduct[key].total += n;
    }

    const overall = await prisma.licenseKey.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const unused = overall.find((x) => x.status === "available")?._count._all || 0;
    const used = overall.find((x) => x.status === "used")?._count._all || 0;

    return { items, total, page, limit, stats: { unused, used, byProduct } };
  },

  async moveProductPool(fromProductKey: string, toProductKey: string, actor?: { userId?: string }) {
    const from = canonicalProductKey(fromProductKey);
    const to = canonicalProductKey(toProductKey);
    if (!from) throw new Error("fromProductKey is required");
    if (!to) throw new Error("toProductKey is required");
    if (from === to) return { moved: 0, fromProductKey: from, toProductKey: to };

    const [sourceCount, targetProduct] = await prisma.$transaction([
      prisma.licenseKey.count({ where: { productKey: from } }),
      prisma.product.findUnique({ where: { slug: to }, select: { id: true } }),
    ]);

    if (sourceCount === 0) {
      return { moved: 0, fromProductKey: from, toProductKey: to };
    }

    const auditUserId = await resolveAuditUserId(actor?.userId);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.licenseKey.updateMany({
        where: { productKey: from },
        data: {
          productKey: to,
          productId: targetProduct?.id || null,
        },
      });

      await tx.licenseKeyAuditLog.create({
        data: {
          keyId: null,
          action: "move_product_pool",
          userId: auditUserId,
          meta: asJson({
            fromProductKey: from,
            toProductKey: to,
            moved: updated.count,
          }),
        },
      });

      return updated;
    });

    return { moved: result.count, fromProductKey: from, toProductKey: to };
  },

  async reserveKey(
    productKey: string,
    input: { orderId: string; email?: string },
    actor?: { userId?: string },
    opts?: { excludeKeyValue?: string; activationSiteUrl?: string; activationSiteUrls?: string[] }
  ) {
    const pk = canonicalProductKey(productKey);
    const activationSiteUrl = normalizeActivationSiteUrl(opts?.activationSiteUrl);
    const sites = opts?.activationSiteUrls?.length
      ? Array.from(new Set(opts.activationSiteUrls.map(normalizeActivationSiteUrl)))
      : [activationSiteUrl];
    if (sites.length > 2 || (opts?.activationSiteUrls?.length && sites.some((site) => !site))) {
      throw new AppError("Invalid activation stock sites", 400);
    }
    const primarySite = sites[0];
    const secondarySite = sites[1] || primarySite;
    const orderId = String(input.orderId || "").trim();
    if (!pk) throw new Error("productKey is required");
    if (!orderId) throw new Error("orderId is required");

    const email = normalizeEmail(input.email);
    const ts = now();
    const exclude = normalizeKeyValueForProduct(pk, String(opts?.excludeKeyValue || ""));

    const auditUserId = await resolveAuditUserId(actor?.userId);

    // Postgres atomic pick: FOR UPDATE SKIP LOCKED.
    const rows = await prisma.$transaction(async (tx) => {
      if (opts?.activationSiteUrls?.length) {
        // Recover a key assigned just before an interrupted activation-record write.
        // Serialize the order across processes before checking or claiming stock.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`activation-stock:${orderId}`})::bigint)`;
        const assigned = await tx.licenseKey.findMany({
          where: { productKey: pk, orderId, status: { in: ["used", "reserved"] } },
          take: 2,
        });
        if (assigned.length) {
          const row = assigned[0];
          if (assigned.length !== 1 || row.status !== "used" || !sites.includes(row.activationSiteUrl) || row.keyValue === exclude) {
            throw new AppError("У заказа уже есть привязанный ключ. Требуется проверка перед выдачей другого", 409);
          }
          return [row];
        }
      }
      const picked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM license_keys
        WHERE product_key = ${pk}
          AND (activation_site_url = ${primarySite} OR activation_site_url = ${secondarySite})
          AND status = 'available'
          AND (${exclude} = '' OR key_value <> ${exclude})
        ORDER BY CASE WHEN activation_site_url = ${primarySite} THEN 0 ELSE 1 END, created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const id = picked[0]?.id;
      if (!id) return [];

      const updated = await tx.licenseKey.updateMany({
        where: { id, status: "available" },
        data: {
          status: "used",
          orderId,
          email,
          usedAt: ts,
        },
      });
      if (updated.count !== 1) return [];

      const row = await tx.licenseKey.findUnique({ where: { id } });
      if (!row) return [];

      await tx.licenseKeyAuditLog.create({
        data: {
          keyId: id,
          action: "assign",
          userId: auditUserId,
          meta: asJson({ orderId, productKey: pk, activationSiteUrl: row.activationSiteUrl || "" }),
        },
      });

      return [row];
    });

    return rows[0] || null;
  },

  async markKeyUsed(keyId: string, orderId: string, actor?: { userId?: string }) {
    const id = String(keyId || "").trim();
    const oid = String(orderId || "").trim();
    if (!id) throw new Error("keyId is required");
    if (!oid) throw new Error("orderId is required");

    const row = await prisma.licenseKey.update({
      where: { id },
      data: { status: "used", orderId: oid, usedAt: now() },
    });

    const auditUserId = await resolveAuditUserId(actor?.userId);

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: row.id,
        action: "mark_used",
        userId: auditUserId,
        meta: asJson({ orderId: oid }),
      },
    });

    return row;
  },

  async revokeKey(keyId: string, actor?: { userId?: string }, meta?: Record<string, unknown>) {
    const id = String(keyId || "").trim();
    if (!id) throw new Error("keyId is required");

    const row = await prisma.licenseKey.update({
      where: { id },
      data: { status: "revoked", revokedAt: now() },
    });

    const auditUserId = await resolveAuditUserId(actor?.userId);

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: row.id,
        action: "revoke",
        userId: auditUserId,
        meta: meta ? asJson(meta) : undefined,
      },
    });

    return row;
  },

  async returnToAvailable(keyId: string, actor?: { userId?: string }) {
    const id = String(keyId || "").trim();
    if (!id) throw new Error("keyId is required");

    const auditUserId = await resolveAuditUserId(actor?.userId);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM license_keys WHERE id = ${id} FOR UPDATE`;
      if (await tx.licenseKeyAuditLog.findFirst({ where: { keyId: id, action: "assign_marketplace_stock" } })) {
        throw new AppError("Ключ закреплён за заказом FunPay или PlayerOK. Повторная выдача заблокирована", 409);
      }
      const row = await tx.licenseKey.update({
        where: { id },
        data: {
          status: "available",
          orderId: null,
          email: null,
          reservedAt: null,
          usedAt: null,
          revokedAt: null,
        },
      });

      await tx.licenseKeyAuditLog.create({
        data: {
          keyId: row.id,
          action: "return_available",
          userId: auditUserId,
        },
      });

      return row;
    });
  },

  async returnAssignedToAvailable(
    keyId: string,
    orderId: string,
    actor?: { userId?: string }
  ) {
    const id = String(keyId || "").trim();
    const oid = String(orderId || "").trim();
    if (!id) throw new Error("keyId is required");
    if (!oid) throw new Error("orderId is required");

    return prisma.$transaction(async (tx) => {
      const updated = await tx.licenseKey.updateMany({
        where: { id, orderId: oid, status: "used" },
        data: {
          status: "available",
          orderId: null,
          email: null,
          reservedAt: null,
          usedAt: null,
          revokedAt: null,
        },
      });
      if (updated.count !== 1) return false;

      const auditUserId = await resolveAuditUserId(actor?.userId);
      await tx.licenseKeyAuditLog.create({
        data: {
          keyId: id,
          action: "return_available",
          userId: auditUserId,
          meta: asJson({ orderId: oid, reason: "unused_chatgpt_plus_candidate" }),
        },
      });
      return true;
    });
  },

  async returnAssignedValueToAvailable(
    productKey: string,
    keyValue: string,
    orderId: string,
    actor?: { userId?: string }
  ) {
    const pk = canonicalProductKey(productKey);
    const value = normalizeKeyValueForProduct(pk, keyValue);
    const oid = String(orderId || "").trim();
    if (!pk || !value || !oid) return false;

    const row = await prisma.licenseKey.findFirst({
      where: { productKey: pk, keyValue: value, orderId: oid, status: "used" },
      select: { id: true },
    });
    if (!row) return false;
    return licenseService.returnAssignedToAvailable(row.id, oid, actor);
  },

  async archiveAvailable(keyId: string, actor?: { userId?: string }) {
    const id = String(keyId || "").trim();
    if (!id) throw new Error("keyId is required");

    const row = await prisma.licenseKey.findUnique({ where: { id } });
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.status !== "available") return { ok: false as const, reason: "not_available" as const };

    const auditUserId = await resolveAuditUserId(actor?.userId);
    const ts = now();

    await prisma.$transaction(async (tx) => {
      await tx.licenseKey.update({
        where: { id },
        data: {
          status: "revoked",
          revokedAt: ts,
        },
      });
      await tx.licenseKeyAuditLog.create({
        data: {
          keyId: id,
          action: "archive_available",
          userId: auditUserId,
          meta: asJson({ archivedKeyId: id, keyValue: row.keyValue, productKey: row.productKey }),
        },
      });
    });

    return { ok: true as const };
  },

  async restoreArchived(keyId: string, actor?: { userId?: string }) {
    const id = String(keyId || "").trim();
    if (!id) throw new Error("keyId is required");

    const row = await prisma.licenseKey.findUnique({ where: { id } });
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.status !== "revoked") return { ok: false as const, reason: "not_archived" as const };

    const auditUserId = await resolveAuditUserId(actor?.userId);

    const updated = await prisma.licenseKey.update({
      where: { id },
      data: {
        status: "available",
        orderId: null,
        email: null,
        reservedAt: null,
        usedAt: null,
        revokedAt: null,
      },
    });

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: id,
        action: "restore_archived",
        userId: auditUserId,
      },
    });

    return { ok: true as const, row: updated };
  },

  async deleteArchived(keyId: string, actor?: { userId?: string }) {
    const id = String(keyId || "").trim();
    if (!id) throw new Error("keyId is required");

    const row = await prisma.licenseKey.findUnique({ where: { id } });
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.status !== "revoked") return { ok: false as const, reason: "not_archived" as const };

    const auditUserId = await resolveAuditUserId(actor?.userId);

    await prisma.$transaction(async (tx) => {
      await tx.licenseKeyAuditLog.create({
        data: {
          keyId: id,
          action: "delete_archived",
          userId: auditUserId,
          meta: asJson({ keyValue: row.keyValue, productKey: row.productKey }),
        },
      });
      await tx.licenseKey.delete({ where: { id } });
    });

    return { ok: true as const };
  },

  async stats() {
    const rows = await prisma.licenseKey.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const total = rows.reduce((sum, r) => sum + r._count._all, 0);
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = r._count._all;
      return acc;
    }, {});
    return { total, byStatus };
  },
};
