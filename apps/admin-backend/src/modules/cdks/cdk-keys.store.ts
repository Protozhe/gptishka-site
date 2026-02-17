import fs from "fs";
import path from "path";
import crypto from "crypto";
import { canonicalProductKey } from "../../common/utils/product-key";

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

type CdkFile = {
  items: CdkKeyRecord[];
};

type CdkAuditAction = "import" | "assign" | "return_unused" | "delete_unused" | "bootstrap";

function resolveDataDir() {
  const fromModule = path.resolve(__dirname, "../../../../../data");
  if (fs.existsSync(fromModule)) return fromModule;
  return path.resolve(process.cwd(), "data");
}

const dataDir = resolveDataDir();
const filePath = path.join(dataDir, "cdk-keys.json");
const backupsDir = path.join(dataDir, "backups");
const auditFilePath = path.join(dataDir, "cdk-keys.audit.log");
const maxBackups = 200;

function readFile(): CdkFile {
  ensure();
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw) as CdkFile;
    if (!Array.isArray(parsed?.items)) return { items: [] };
    // Self-heal productKey drift (e.g. `chatgpt-plus-1m` -> `chatgpt-plus`).
    let changed = 0;
    for (const item of parsed.items) {
      const next = normalizeProductKey(item.productKey);
      if (next && next !== item.productKey) {
        item.productKey = next;
        item.updatedAt = nowIso();
        changed += 1;
      }
    }
    if (changed > 0) {
      try {
        writeFileAtomic(parsed, "bootstrap", { normalizedProductKeys: true, changed });
      } catch {
        // If filesystem is read-only/immutable, keep serving from memory.
      }
    }
    return parsed;
  } catch {
    // Keep service alive even if file is broken: restore from latest backup if possible.
    const restored = restoreFromLatestBackup();
    if (restored) return restored;
    return { items: [] };
  }
}

function writeFileAtomic(data: CdkFile, action: CdkAuditAction, meta: Record<string, unknown> = {}) {
  ensure();
  createBackup();

  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);

  appendAudit(action, {
    ...meta,
    total: data.items.length,
  });
}

function ensure() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    writeFileAtomic({ items: [] }, "bootstrap");
  }
}

function createBackup() {
  if (!fs.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `cdk-keys-${stamp}.json`);
  try {
    fs.copyFileSync(filePath, backupPath);
  } catch {
    return;
  }

  try {
    const backups = fs
      .readdirSync(backupsDir)
      .filter((name) => name.startsWith("cdk-keys-") && name.endsWith(".json"))
      .sort();
    const extra = backups.length - maxBackups;
    if (extra > 0) {
      for (const name of backups.slice(0, extra)) {
        fs.unlinkSync(path.join(backupsDir, name));
      }
    }
  } catch {
    // best-effort cleanup
  }
}

function restoreFromLatestBackup(): CdkFile | null {
  try {
    const backups = fs
      .readdirSync(backupsDir)
      .filter((name) => name.startsWith("cdk-keys-") && name.endsWith(".json"))
      .sort()
      .reverse();
    for (const name of backups) {
      const fullPath = path.join(backupsDir, name);
      const raw = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw) as CdkFile;
      if (!Array.isArray(parsed?.items)) continue;
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), "utf8");
      fs.renameSync(tmpPath, filePath);
      appendAudit("bootstrap", { restoredFromBackup: name, total: parsed.items.length });
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function appendAudit(action: CdkAuditAction, payload: Record<string, unknown>) {
  try {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      action,
      ...payload,
    });
    fs.appendFileSync(auditFilePath, `${line}\n`, "utf8");
  } catch {
    // best-effort logging
  }
}

function normalizeCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeProductKey(value: string) {
  const normalized = String(value || "chatgpt")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  const canonical = canonicalProductKey(normalized || "chatgpt");
  return canonical || "chatgpt";
}

function nowIso() {
  return new Date().toISOString();
}

export const cdkKeysStore = {
  ensure,

  importCodes(input: { productKey?: string; codes: string[] }) {
    const productKey = normalizeProductKey(input.productKey || "chatgpt");
    const data = readFile();
    const existing = new Set(data.items.map((item) => normalizeCode(item.code)));
    const now = nowIso();

    let inserted = 0;
    let skipped = 0;
    for (const raw of input.codes) {
      const code = normalizeCode(raw);
      if (!code) continue;
      if (existing.has(code)) {
        skipped++;
        continue;
      }

      data.items.push({
        id: crypto.randomUUID(),
        code,
        productKey,
        status: "unused",
        orderId: null,
        email: null,
        createdAt: now,
        updatedAt: now,
        assignedAt: null,
      });
      existing.add(code);
      inserted++;
    }

    writeFileAtomic(data, "import", { productKey, inserted, skipped });
    return { inserted, skipped };
  },

  list(params: { status?: CdkStatus; productKey?: string; q?: string; page?: number; limit?: number }) {
    const data = readFile();
    const status = params.status;
    const productKey = params.productKey ? normalizeProductKey(params.productKey) : "";
    const q = String(params.q || "").trim().toUpperCase();
    const page = Math.max(1, Number(params.page || 1));
    const limit = Math.max(1, Math.min(200, Number(params.limit || 50)));

    let rows = data.items.slice();
    if (status) rows = rows.filter((item) => item.status === status);
    if (productKey) rows = rows.filter((item) => normalizeProductKey(item.productKey) === productKey);
    if (q) {
      rows = rows.filter((item) => {
        const hay = [item.code, item.email || "", item.orderId || "", item.productKey].join(" ").toUpperCase();
        return hay.includes(q);
      });
    }

    rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const total = rows.length;
    const offset = (page - 1) * limit;
    const items = rows.slice(offset, offset + limit);

    const unused = data.items.filter((item) => item.status === "unused").length;
    const used = data.items.filter((item) => item.status === "used").length;
    const byProduct = data.items.reduce<Record<string, { unused: number; used: number; total: number }>>((acc, item) => {
      const key = normalizeProductKey(item.productKey);
      if (!acc[key]) acc[key] = { unused: 0, used: 0, total: 0 };
      acc[key].total += 1;
      if (item.status === "unused") acc[key].unused += 1;
      if (item.status === "used") acc[key].used += 1;
      return acc;
    }, {});

    return { items, total, page, limit, stats: { unused, used, byProduct } };
  },

  assignNextUnused(input: { productKey?: string; orderId: string; email: string }) {
    const productKey = normalizeProductKey(input.productKey || "chatgpt");
    const data = readFile();
    const idx = data.items.findIndex((item) => item.status === "unused" && normalizeProductKey(item.productKey) === productKey);
    if (idx < 0) return null;

    const row = data.items[idx];
    const now = nowIso();
    const next: CdkKeyRecord = {
      ...row,
      status: "used",
      orderId: String(input.orderId || "").trim(),
      email: String(input.email || "").trim().toLowerCase(),
      assignedAt: now,
      updatedAt: now,
    };
    data.items[idx] = next;
    writeFileAtomic(data, "assign", {
      id: next.id,
      productKey,
      orderId: next.orderId,
      email: next.email,
      code: next.code,
    });
    return next;
  },

  returnToUnused(id: string) {
    const keyId = String(id || "").trim();
    if (!keyId) return null;

    const data = readFile();
    const idx = data.items.findIndex((item) => item.id === keyId);
    if (idx < 0) return null;

    const row = data.items[idx];
    const now = nowIso();
    const next: CdkKeyRecord = {
      ...row,
      status: "unused",
      orderId: null,
      email: null,
      assignedAt: null,
      updatedAt: now,
    };
    data.items[idx] = next;
    writeFileAtomic(data, "return_unused", { id: next.id, code: next.code, productKey: next.productKey });
    return next;
  },

  removeUnused(id: string) {
    const keyId = String(id || "").trim();
    if (!keyId) return { ok: false, reason: "not_found" as const };

    const data = readFile();
    const idx = data.items.findIndex((item) => item.id === keyId);
    if (idx < 0) return { ok: false, reason: "not_found" as const };
    if (data.items[idx].status !== "unused") return { ok: false, reason: "not_unused" as const };

    const removed = data.items[idx];
    data.items.splice(idx, 1);
    writeFileAtomic(data, "delete_unused", { id: removed.id, code: removed.code, productKey: removed.productKey });
    return { ok: true as const };
  },
};
