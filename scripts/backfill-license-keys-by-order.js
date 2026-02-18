/* eslint-disable no-console */
// One-time (and safe to re-run) helper:
// Backfill legacy pooled license_keys rows to the actual product slug based on the order's product.
//
// Why: earlier versions collapsed productKey (e.g. "chatgpt-plus-1m" -> "chatgpt-plus"),
// which caused keys to appear duplicated across similar products. This script fixes "used/reserved"
// keys by assigning the real productKey from the order item.

const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

function normalizeProductKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

async function main() {
  const appDir = process.argv[2] || process.cwd();
  const envPath = process.argv[3] || path.join(appDir, "apps", "admin-backend", ".env");

  dotenv.config({ path: envPath });
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL in env:", envPath);
    process.exit(2);
  }

  const prisma = new PrismaClient();

  // Find all keys that are linked to orders but still have a "pooled" productKey.
  // We update only rows with orderId present because only then we can deterministically infer product.
  const candidates = await prisma.licenseKey.findMany({
    where: {
      orderId: { not: null },
      status: { in: ["reserved", "used"] },
    },
    select: { id: true, orderId: true, productKey: true },
    take: 5000,
  });

  const orderIds = Array.from(new Set(candidates.map((x) => x.orderId).filter(Boolean)));
  if (orderIds.length === 0) {
    console.log("Backfill: nothing to do (no reserved/used keys with orderId).");
    await prisma.$disconnect();
    return;
  }

  const items = await prisma.orderItem.findMany({
    where: { orderId: { in: orderIds } },
    include: { product: { select: { id: true, slug: true } } },
  });
  const byOrder = new Map();
  for (const it of items) {
    if (!it.product) continue;
    if (!byOrder.has(it.orderId)) byOrder.set(it.orderId, it.product);
  }

  let updated = 0;
  for (const row of candidates) {
    const product = row.orderId ? byOrder.get(row.orderId) : null;
    const slug = normalizeProductKey(product?.slug || "");
    if (!slug) continue;

    const nextKey = slug;
    if (row.productKey === nextKey) continue;

    await prisma.licenseKey.update({
      where: { id: row.id },
      data: {
        productKey: nextKey,
        productId: product.id,
      },
    });
    updated += 1;
  }

  await prisma.licenseKeyAuditLog.create({
    data: {
      keyId: null,
      action: "backfill_product_by_order",
      userId: null,
      meta: { updated },
    },
  });

  await prisma.$disconnect();
  console.log("Backfill updated:", updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

