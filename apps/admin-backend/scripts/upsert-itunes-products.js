const fs = require("node:fs");
const path = require("node:path");
const catalog = require("./itunes-regional-catalog.json");

const regions = ["ru", "us", "tr", "in", "ae"];
const select = {
  id: true, slug: true, price: true, currency: true, tags: true,
  activationVariants: true, updatedAt: true,
};

function catalogRows(input = catalog) {
  if (input.priceCurrency !== "RUB" || input.regions.length !== regions.length) throw new Error("Invalid App Store catalog");
  const seen = new Set();
  return input.regions.flatMap((region, index) => {
    if (region.region !== regions[index] || !region.sourceUrl.startsWith("https://ggsel.net/catalog/product/")) {
      throw new Error("Unexpected region or price source");
    }
    return region.items.map(({ denomination, price }) => {
      const slug = `itunes-${region.region}-${denomination}`;
      if (!Number.isSafeInteger(denomination) || denomination <= 0 || !Number.isSafeInteger(price) || price <= 0 || seen.has(slug)) {
        throw new Error("Invalid or duplicate gift-card amount");
      }
      seen.add(slug);
      return {
        slug, region: region.region, denomination, price, sourceUrl: region.sourceUrl,
        title: `App Store ${denomination} ${region.unit} — ${region.name}`,
        titleEn: `App Store ${denomination} ${region.unit} — ${region.nameEn}`,
        description: `Подарочная карта App Store для региона ${region.name}, номинал ${denomination} ${region.unit}. Код выдаётся после оплаты. Регион Apple Account должен совпадать с регионом карты.`,
        descriptionEn: `App Store gift card for ${region.nameEn}, value ${denomination} ${region.unit}. A code is delivered after payment. Your Apple Account region must match the card region.`,
        tags: ["itunes", "app-store", "apple-gift-card", `region:${region.region}`, `denomination:${denomination}`, "delivery:code", "internal:checkout"],
      };
    });
  });
}

function candidateSlugs(row) {
  return row.region === "us" ? [row.slug, `itunes-app-store-${row.denomination}`] : [row.slug];
}

function buildPlan(rows, existing) {
  return rows.map((row) => {
    const matches = existing.filter((product) => candidateSlugs(row).includes(product.slug));
    if (matches.length > 1) throw new Error(`Duplicate App Store pools for ${row.region}/${row.denomination}; reconcile them before applying`);
    const current = matches[0];
    if (!current) {
      const { region, denomination, sourceUrl, ...fields } = row;
      return {
        slug: row.slug, action: "create", before: null,
        data: { ...fields, currency: "RUB", category: "Пополнения", isActive: true, isArchived: false },
      };
    }
    if (current.currency !== "RUB" || !current.tags.includes("itunes") ||
        !current.tags.includes(`region:${row.region}`) ||
        !current.tags.includes(`denomination:${row.denomination}`) ||
        !current.tags.includes("delivery:code")) throw new Error(`Existing pool does not match the card: ${current.slug}`);
    const variants = current.activationVariants;
    if (variants && (!variants.withoutLogin || variants.withoutLogin.enabled === false || variants.withoutLogin.deliveryType !== "code")) {
      throw new Error(`Unexpected delivery variant for ${current.slug}`);
    }
    const data = { price: row.price };
    if (variants) data.activationVariants = {
      ...variants, withoutLogin: { ...variants.withoutLogin, price: row.price },
    };
    const changed = Number(current.price) !== row.price ||
      Boolean(variants && Number(variants.withoutLogin.price) !== row.price);
    return {
      slug: current.slug, action: changed ? "update" : "unchanged",
      before: { id: current.id, price: String(current.price), activationVariants: variants },
      data,
    };
  });
}

async function readPlan(db, rows) {
  const existing = await db.product.findMany({
    where: { slug: { in: rows.flatMap(candidateSlugs) } }, select,
  });
  return buildPlan(rows, existing);
}

async function applyPlan(db, plan) {
  for (const item of plan) {
    if (item.action === "create") await db.product.create({ data: item.data });
    if (item.action === "update") await db.product.update({ where: { id: item.before.id }, data: item.data });
  }
}

function priceMatches(product, data) {
  return product && Number(product.price) === Number(data.price) &&
    JSON.stringify(product.activationVariants) === JSON.stringify(data.activationVariants ?? null);
}

async function rollback(db, backup, jsonNull) {
  for (const item of backup.plan.filter((entry) => entry.action !== "unchanged")) {
    const current = await db.product.findUnique({ where: { slug: item.slug }, select });
    if (!priceMatches(current, item.data) || (item.before && current.id !== item.before.id)) {
      throw new Error(`Pool changed after the backup: ${item.slug}; refusing to overwrite it`);
    }
    if (item.action === "create") {
      // Preserve any later order and inventory references; do not delete a pool.
      await db.product.update({ where: { id: current.id }, data: { isActive: false, isArchived: true } });
    } else {
      await db.product.update({
        where: { id: current.id },
        data: { price: item.before.price, activationVariants: item.before.activationVariants ?? jsonNull },
      });
    }
  }
}

async function main() {
  const rows = catalogRows();
  if (process.argv.includes("--print")) {
    console.log(JSON.stringify({ mode: "offline", quotedAt: catalog.quotedAt, currency: "RUB", rows }, null, 2));
    return;
  }
  const apply = process.argv.includes("--apply");
  const backupPath = process.argv.find((arg) => arg.startsWith("--backup="))?.slice(9);
  const rollbackPath = process.argv.find((arg) => arg.startsWith("--rollback="))?.slice(11);
  if (apply && (!backupPath || !path.isAbsolute(backupPath))) throw new Error("--apply requires an absolute --backup=PATH");
  if (rollbackPath && (apply || !path.isAbsolute(rollbackPath))) throw new Error("Use only --rollback=ABSOLUTE_PATH");
  const { PrismaClient, Prisma } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    if (rollbackPath) {
      const backup = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
      if (backup.kind !== "itunes-regional-catalog-v1" || !Array.isArray(backup.plan)) throw new Error("Invalid catalog backup");
      const allowed = new Set(rows.flatMap(candidateSlugs));
      if (backup.plan.some((item) => !allowed.has(item.slug))) throw new Error("Backup contains an unrelated product");
      await prisma.$transaction((db) => rollback(db, backup, Prisma.JsonNull), { isolationLevel: "Serializable" });
      console.log(JSON.stringify({ mode: "rollback", restored: true }));
      return;
    }
    if (!apply) {
      console.log(JSON.stringify({ mode: "plan", quotedAt: catalog.quotedAt, plan: await readPlan(prisma, rows) }, null, 2));
      return;
    }
    const result = await prisma.$transaction(async (db) => {
      const plan = await readPlan(db, rows);
      fs.writeFileSync(backupPath, JSON.stringify({
        kind: "itunes-regional-catalog-v1", createdAt: new Date().toISOString(), quotedAt: catalog.quotedAt, plan,
      }, null, 2), { flag: "wx", mode: 0o600 });
      await applyPlan(db, plan);
      return plan.map(({ slug, action, data }) => ({ slug, action, price: data.price }));
    }, { isolationLevel: "Serializable" });
    console.log(JSON.stringify({ mode: "apply", backupPath, result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { catalogRows, buildPlan, applyPlan, rollback };
