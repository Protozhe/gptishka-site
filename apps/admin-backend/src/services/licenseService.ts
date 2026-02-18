import { prisma } from "../config/prisma";
import { canonicalProductKey } from "../common/utils/product-key";

export type LicenseKeyStatus = "available" | "reserved" | "used" | "revoked";

function asJson(value: unknown) {
  return value as any;
}

function normalizeKeyValue(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeEmail(value: string | null | undefined) {
  const v = String(value || "").trim().toLowerCase();
  return v || null;
}

function now() {
  return new Date();
}

export const licenseService = {
  async createKey(productKey: string, keyValue: string, actor?: { userId?: string }, meta?: Record<string, unknown>) {
    const pk = canonicalProductKey(productKey);
    const kv = normalizeKeyValue(keyValue);
    if (!pk) throw new Error("productKey is required");
    if (!kv) throw new Error("keyValue is required");

    const row = await prisma.licenseKey.create({
      data: {
        productKey: pk,
        keyValue: kv,
        status: "available",
      },
      select: { id: true, productKey: true, status: true, createdAt: true, updatedAt: true },
    });

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: row.id,
        action: "create",
        userId: actor?.userId || null,
        meta: meta ? asJson(meta) : undefined,
      },
    });

    return row;
  },

  async importKeys(productKey: string, codes: string[], actor?: { userId?: string }) {
    const pk = canonicalProductKey(productKey);
    const normalized = (codes || []).map(normalizeKeyValue).filter(Boolean);
    const unique = Array.from(new Set(normalized));

    if (!pk) throw new Error("productKey is required");
    if (unique.length === 0) return { inserted: 0, skipped: 0, conflicts: 0, conflictsByProductKey: {} as Record<string, number> };

    // If the product exists by slug, keep a stable FK for future audits/queries.
    const product = await prisma.product.findUnique({
      where: { slug: pk },
      select: { id: true },
    });

    // Detect conflicts: the same key already exists under another productKey.
    const existing = await prisma.licenseKey.findMany({
      where: { keyValue: { in: unique } },
      select: { productKey: true },
    });
    const conflictsByProductKey: Record<string, number> = {};
    let conflicts = 0;
    for (const row of existing) {
      if (row.productKey !== pk) {
        conflicts++;
        conflictsByProductKey[row.productKey] = (conflictsByProductKey[row.productKey] || 0) + 1;
      }
    }

    // Insert new keys; duplicates are skipped due to UNIQUE(key_value).
    const created = await prisma.licenseKey.createMany({
      data: unique.map((kv) => ({
        productKey: pk,
        productId: product?.id || null,
        keyValue: kv,
        status: "available",
      })),
      skipDuplicates: true,
    });

    const inserted = created.count;
    const skipped = Math.max(0, unique.length - inserted);

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: null,
        action: "import",
        userId: actor?.userId || null,
        meta: asJson({ productKey: pk, inserted, skipped, conflicts, conflictsByProductKey }),
      },
    });

    return { inserted, skipped, conflicts, conflictsByProductKey };
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

  async reserveKey(
    productKey: string,
    input: { orderId: string; email?: string },
    actor?: { userId?: string },
    opts?: { excludeKeyValue?: string }
  ) {
    const pk = canonicalProductKey(productKey);
    const orderId = String(input.orderId || "").trim();
    if (!pk) throw new Error("productKey is required");
    if (!orderId) throw new Error("orderId is required");

    const email = normalizeEmail(input.email);
    const ts = now();
    const exclude = normalizeKeyValue(String(opts?.excludeKeyValue || ""));

    // Postgres atomic pick: FOR UPDATE SKIP LOCKED.
    const rows = await prisma.$transaction(async (tx) => {
      const picked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM license_keys
        WHERE product_key = ${pk}
          AND status = 'available'
          AND (${exclude} = '' OR key_value <> ${exclude})
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
          userId: actor?.userId || null,
          meta: asJson({ orderId, productKey: pk }),
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

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: row.id,
        action: "mark_used",
        userId: actor?.userId || null,
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

    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: row.id,
        action: "revoke",
        userId: actor?.userId || null,
        meta: meta ? asJson(meta) : undefined,
      },
    });

    return row;
  },

  async returnToAvailable(keyId: string, actor?: { userId?: string }) {
    const id = String(keyId || "").trim();
    if (!id) throw new Error("keyId is required");

    const row = await prisma.licenseKey.update({
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
        keyId: row.id,
        action: "return_available",
        userId: actor?.userId || null,
      },
    });

    return row;
  },

  async deleteAvailable(keyId: string, actor?: { userId?: string }) {
    const id = String(keyId || "").trim();
    if (!id) throw new Error("keyId is required");

    const row = await prisma.licenseKey.findUnique({ where: { id } });
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.status !== "available") return { ok: false as const, reason: "not_available" as const };

    await prisma.licenseKey.delete({ where: { id } });
    await prisma.licenseKeyAuditLog.create({
      data: {
        keyId: id,
        action: "delete_available",
        userId: actor?.userId || null,
        meta: asJson({ productKey: row.productKey }),
      },
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
