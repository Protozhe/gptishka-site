import { LicenseKey } from "@prisma/client";
import { canonicalProductKey } from "../../common/utils/product-key";
import { licenseService } from "../../services/licenseService";

export type CdkStatus = "unused" | "used";

export type CdkKeyRecord = {
  id: string;
  code: string;
  productKey: string;
  status: CdkStatus;
  orderId?: string | null;
  email?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string | null;
};

function mapRow(row: LicenseKey): CdkKeyRecord {
  const status: CdkStatus = row.status === "available" ? "unused" : "used";
  return {
    id: row.id,
    code: row.keyValue,
    productKey: row.productKey,
    status,
    orderId: row.orderId || null,
    email: row.email || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignedAt: row.usedAt ? row.usedAt.toISOString() : null,
  };
}

function mapStatus(status?: CdkStatus) {
  if (status === "unused") return "available" as const;
  if (status === "used") return "used" as const;
  return undefined;
}

export const cdkKeysStore = {
  async importCodes(input: { productKey?: string; codes: string[] }, actor?: { userId?: string }) {
    return licenseService.importKeys(String(input.productKey || "chatgpt"), input.codes || [], actor);
  },

  async list(params: { status?: CdkStatus; productKey?: string; q?: string; page?: number; limit?: number }) {
    const status = mapStatus(params.status);
    const productKey = params.productKey ? canonicalProductKey(params.productKey) : "";

    const result = await licenseService.getKeysByProduct(productKey, {
      status,
      q: params.q,
      page: params.page,
      limit: params.limit,
    });

    return {
      ...result,
      items: result.items.map(mapRow),
      // Keep legacy stats shape: unused/used only.
      stats: {
        unused: result.stats.unused,
        used: result.stats.used,
        byProduct: Object.fromEntries(
          Object.entries(result.stats.byProduct).map(([k, v]) => [
            k,
            {
              unused: v.available,
              used: v.used + v.reserved + v.revoked,
              total: v.total,
            },
          ])
        ),
      },
    };
  },

  async assignNextUnused(input: { productKey?: string; orderId: string; email: string }) {
    const productKey = String(input.productKey || "chatgpt");
    const reserved = await licenseService.reserveKey(productKey, { orderId: input.orderId, email: input.email });
    return reserved ? mapRow(reserved) : null;
  },

  async returnToUnused(id: string, actor?: { userId?: string }) {
    const row = await licenseService.returnToAvailable(id, actor);
    return mapRow(row);
  },

  async removeUnused(id: string, actor?: { userId?: string }) {
    const result = await licenseService.deleteAvailable(id, actor);
    if (!result.ok) {
      if (result.reason === "not_available") return { ok: false as const, reason: "not_unused" as const };
      return { ok: false as const, reason: "not_found" as const };
    }
    return { ok: true as const };
  },
};

