const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const adminEnvPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(adminEnvPath)) {
  dotenv.config({ path: adminEnvPath });
}

function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeMultiline(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const parsed = {
    backupFile: "",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i] || "").trim();
    if (!token) continue;
    if (token === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (token === "--file") {
      parsed.backupFile = String(args[i + 1] || "").trim();
      i += 1;
    }
  }

  return parsed;
}

function resolveBackupPath(explicitPath) {
  if (explicitPath) {
    return path.resolve(process.cwd(), explicitPath);
  }
  return path.resolve(__dirname, "../../../_tmp_products_ru.json");
}

function loadBackupMap(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const raw = fs.readFileSync(backupPath, "utf-8");
  const payload = JSON.parse(String(raw || "").replace(/^\uFEFF/, ""));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const lookupMap = new Map();

  items.forEach((item) => {
    const modalDescription = normalizeMultiline(item?.modalDescription);
    if (!modalDescription) return;

    const keys = [
      normalizeLookup(item?.id),
      normalizeLookup(item?.product),
      normalizeLookup(item?.slug),
      normalizeLookup(item?.title),
    ].filter(Boolean);

    keys.forEach((key) => {
      lookupMap.set(key, modalDescription);
    });
  });

  return lookupMap;
}

function resolveBackupModal(lookupMap, product) {
  if (!lookupMap || !lookupMap.size || !product) return "";
  const keys = [
    normalizeLookup(product.id),
    normalizeLookup(product.slug),
    normalizeLookup(product.title),
  ].filter(Boolean);

  for (const key of keys) {
    const value = lookupMap.get(key);
    if (value) return value;
  }

  return "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const backupPath = resolveBackupPath(args.backupFile);
  const lookupMap = loadBackupMap(backupPath);
  if (!lookupMap.size) {
    console.log("[restore-modals] Nothing to restore: backup has no modal descriptions.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        modalDescription: true,
      },
    });

    const updates = [];
    for (const product of products) {
      const backupModal = resolveBackupModal(lookupMap, product);
      if (!backupModal) continue;

      const currentModal = normalizeMultiline(product.modalDescription);
      if (currentModal === backupModal) continue;

      updates.push({
        id: product.id,
        slug: product.slug,
        title: product.title,
        previous: currentModal,
        next: backupModal,
      });
    }

    if (!updates.length) {
      console.log("[restore-modals] No changes required: all matched products already restored.");
      return;
    }

    console.log(`[restore-modals] Matched updates: ${updates.length}`);
    if (args.dryRun) {
      updates.slice(0, 10).forEach((row) => {
        console.log(`- ${row.id} (${row.slug})`);
      });
      console.log("[restore-modals] Dry run complete. No database writes performed.");
      return;
    }

    for (const row of updates) {
      await prisma.product.update({
        where: { id: row.id },
        data: { modalDescription: row.next },
      });
    }

    console.log(`[restore-modals] Restored modal descriptions for ${updates.length} products.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[restore-modals] Failed:", error?.message || String(error));
  process.exit(1);
});
