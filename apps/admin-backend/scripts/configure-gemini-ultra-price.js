const fs = require("node:fs");
const path = require("node:path");

const prices = { "gemini-ultra-own-1m": 12900, "gemini-ultra-ready-1m": 13100 };
const slugs = Object.keys(prices);
const backupKind = "gemini-ultra-price-12900-account-200-v1";

async function snapshot(db) {
  const products = await db.product.findMany({ where: { slug: { in: slugs } }, orderBy: { slug: "asc" } });
  if (products.length !== slugs.length || products.some(p => !slugs.includes(p.slug) || p.currency !== "RUB" || !p.tags.includes("gemini"))) {
    throw Error("Expected exactly the existing RUB Gemini Ultra products");
  }
  return products;
}
function variantPrices(variants, price) {
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) return variants;
  return Object.fromEntries(Object.entries(variants).map(([key, value]) => [key,
    ["withLogin", "withoutLogin"].includes(key) && value && typeof value === "object" && !Array.isArray(value)
      ? { ...value, price } : value,
  ]));
}
async function apply(db, products) {
  if (products.length !== slugs.length || new Set(products.map(p => p.slug)).size !== slugs.length
      || products.some(p => !slugs.includes(p.slug) || p.currency !== "RUB")) throw Error("Unrelated product");
  const result = [];
  for (const product of products) {
    const price = prices[product.slug];
    const updated = await db.product.update({ where: { id: product.id }, data: {
      price, ...(product.activationVariants ? { activationVariants: variantPrices(product.activationVariants, price) } : {}),
    } });
    result.push({ slug: updated.slug, price: String(updated.price) });
  }
  return result;
}
async function rollback(db, backup, jsonNull) {
  if (backup.kind !== backupKind || !Array.isArray(backup.before) || backup.before.length !== slugs.length
      || new Set(backup.before.map(p => p.slug)).size !== slugs.length
      || backup.before.some(p => !slugs.includes(p.slug) || p.currency !== "RUB")) throw Error("Not a scoped Gemini Ultra price backup");
  for (const product of backup.before) await db.product.update({ where: { id: product.id }, data: {
    price: product.price, activationVariants: product.activationVariants ?? jsonNull,
  } });
}
async function main() {
  const applyRequested = process.argv.includes("--apply");
  const backupPath = process.argv.find(a => a.startsWith("--backup="))?.slice(9);
  const rollbackPath = process.argv.find(a => a.startsWith("--rollback="))?.slice(11);
  if (applyRequested && (!backupPath || !path.isAbsolute(backupPath))) throw Error("--apply requires an absolute backup path");
  if (rollbackPath && (applyRequested || !path.isAbsolute(rollbackPath))) throw Error("Use only --rollback=ABSOLUTE_PATH");
  const { PrismaClient, Prisma } = require("@prisma/client"); const db = new PrismaClient();
  try {
    if (rollbackPath) {
      await db.$transaction(tx => rollback(tx, JSON.parse(fs.readFileSync(rollbackPath, "utf8")), Prisma.JsonNull), { isolationLevel: "Serializable" });
      console.log(JSON.stringify({ restored: true })); return;
    }
    if (!applyRequested) {
      const products = await snapshot(db);
      console.log(JSON.stringify({ mode: "plan", products: products.map(p => ({ slug: p.slug, oldPrice: String(p.price), newPrice: prices[p.slug] })), newAccountDifference: prices[slugs[1]] - prices[slugs[0]] })); return;
    }
    const result = await db.$transaction(async tx => {
      const products = await snapshot(tx);
      fs.writeFileSync(backupPath, JSON.stringify({ kind: backupKind, createdAt: new Date().toISOString(), before: products }, null, 2), { flag: "wx", mode: 0o600 });
      return apply(tx, products);
    }, { isolationLevel: "Serializable" });
    console.log(JSON.stringify({ mode: "apply", backupPath, result }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error("Gemini Ultra price operation failed; transaction rolled back"); process.exitCode = 1; });
module.exports = { prices, slugs, variantPrices, snapshot, apply, rollback };
