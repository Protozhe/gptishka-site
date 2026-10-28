import { prisma } from "../../config/prisma";
import { normalizeActivationSiteUrl } from "../../common/utils/activation-site";

type PoolCounts = { unused: number; used: number; reserved: number; archived: number; total: number };

export async function readCdkInventory() {
  // Count the entire inventory without returning key values or customer data.
  const rows = await prisma.licenseKey.groupBy({
    by: ["productKey", "activationSiteUrl", "status"],
    _count: { _all: true },
  });
  const byProduct: Record<string, { unused: number; used: number; total: number }> = Object.create(null);
  const byActivationSite: Record<string, Record<string, PoolCounts>> = Object.create(null);
  const statusField = { available: "unused", used: "used", reserved: "reserved", revoked: "archived" } as const;

  for (const row of rows) {
    const productKey = row.productKey;
    const site = normalizeActivationSiteUrl(row.activationSiteUrl);
    const count = row._count._all;
    const product = byProduct[productKey] ??= { unused: 0, used: 0, total: 0 };
    product[row.status === "available" ? "unused" : "used"] += count;
    product.total += count;
    const sites = byActivationSite[productKey] ??= Object.create(null);
    const pool = sites[site] ??= { unused: 0, used: 0, reserved: 0, archived: 0, total: 0 };
    pool[statusField[row.status]] += count;
    pool.total += count;
  }

  return { stats: { byProduct, byActivationSite } };
}
