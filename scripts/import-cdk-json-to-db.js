/* eslint-disable no-console */
// One-time migration helper: move legacy JSON CDK pool into Postgres.
// Safe to run multiple times due to UNIQUE(key_value) + skipDuplicates.

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeProductKey(value) {
  const key = String(value || "chatgpt")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  // Do NOT collapse similar products into a shared pool.
  // Keys must remain attached to the exact productKey they were imported into.
  return key || "chatgpt";
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const appDir = process.argv[2] || process.cwd();
  const jsonPath = process.argv[3] || path.join(appDir, "data", "cdk-keys.json");
  const envPath = process.argv[4] || path.join(appDir, "apps", "admin-backend", ".env");
  const backupDir = process.argv[5] || "/var/backups/gptishka";

  dotenv.config({ path: envPath });

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL in env:", envPath);
    process.exit(2);
  }

  if (!fs.existsSync(jsonPath)) {
    console.log("No legacy JSON file found:", jsonPath);
    return;
  }

  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length === 0) {
    console.log("Legacy JSON file has 0 items, skipping:", jsonPath);
    return;
  }

  const prisma = new PrismaClient();
  const force = String(process.env.FORCE_LEGACY_IMPORT || "").trim() === "1";
  const existingCount = await prisma.licenseKey.count().catch(() => 0);
  if (!force && existingCount > 0) {
    console.log("Skipping legacy JSON import: license_keys already has", existingCount, "rows. Set FORCE_LEGACY_IMPORT=1 to override.");
    await prisma.$disconnect();
    return;
  }

  // Only keep orderId if the order exists; legacy JSON may contain stale ids.
  const candidateOrderIds = Array.from(
    new Set(
      items
        .map((x) => (x && x.orderId ? String(x.orderId).trim() : ""))
        .filter(Boolean)
    )
  );
  const existingOrders = candidateOrderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: candidateOrderIds } },
        select: { id: true },
      })
    : [];
  const existingOrderIdSet = new Set(existingOrders.map((o) => o.id));

  const rows = [];
  for (const x of items) {
    const keyValue = normalizeCode(x.code);
    if (!keyValue) continue;
    const rawOrderId = x.orderId ? String(x.orderId).trim() : "";
    const safeOrderId = rawOrderId && existingOrderIdSet.has(rawOrderId) ? rawOrderId : null;
    rows.push({
      productKey: normalizeProductKey(x.productKey || "chatgpt"),
      keyValue,
      status: String(x.status || "unused") === "used" ? "used" : "available",
      orderId: safeOrderId,
      email: x.email ? String(x.email).trim().toLowerCase() : null,
      usedAt: x.assignedAt ? new Date(String(x.assignedAt)) : null,
    });
  }

  const inserted = await prisma.licenseKey.createMany({
    data: rows,
    skipDuplicates: true,
  });

  await prisma.licenseKeyAuditLog.create({
    data: {
      keyId: null,
      action: "bootstrap_from_json",
      userId: null,
      meta: { file: jsonPath, inserted: inserted.count, sourceCount: items.length },
    },
  });

  await prisma.$disconnect();

  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `cdk-keys.json.${nowStamp()}.bak`);
  // If the source is a snapshot, keep it and just copy; otherwise move it out of the project/runtime dir.
  const isSnapshot = String(jsonPath).includes("/snapshots/");
  if (isSnapshot) {
    fs.copyFileSync(jsonPath, backupPath);
    console.log("Imported into Postgres:", inserted.count, "Copied JSON to:", backupPath);
  } else {
    fs.renameSync(jsonPath, backupPath);
    console.log("Imported into Postgres:", inserted.count, "Moved JSON to:", backupPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
