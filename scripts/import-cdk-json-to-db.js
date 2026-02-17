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

  if (!key) return "chatgpt";
  if (key === "chatgpt-plus" || key.startsWith("chatgpt-plus-")) return "chatgpt-plus";
  if (key === "chatgpt-go" || key.startsWith("chatgpt-go-")) return "chatgpt-go";
  if (key === "chatgpt" || key.startsWith("chatgpt-")) return "chatgpt";
  return key;
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
  const existingCount = await prisma.licenseKey.count();
  if (existingCount > 0) {
    console.log("license_keys already has data, skipping JSON import. count=", existingCount);
    await prisma.$disconnect();
    return;
  }

  const rows = [];
  for (const x of items) {
    const keyValue = normalizeCode(x.code);
    if (!keyValue) continue;
    rows.push({
      productKey: normalizeProductKey(x.productKey || "chatgpt"),
      keyValue,
      status: String(x.status || "unused") === "used" ? "used" : "available",
      orderId: x.orderId ? String(x.orderId) : null,
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
  fs.renameSync(jsonPath, backupPath);
  console.log("Imported into Postgres:", inserted.count, "Backed up JSON to:", backupPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
