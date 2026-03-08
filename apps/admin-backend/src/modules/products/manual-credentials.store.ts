import crypto from "crypto";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type ManualCredentialStatus = "available" | "assigned";

export type ManualCredentialRecord = {
  id: string;
  productId: string;
  login: string;
  password: string;
  status: ManualCredentialStatus;
  orderId: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
};

type ManualCredentialsStoreData = {
  items: ManualCredentialRecord[];
};

function resolveRuntimeDir() {
  const fromEnv = String(process.env.GPTISHKA_RUNTIME_DIR || process.env.RUNTIME_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);
  const linuxDefault = "/var/lib/gptishka-runtime";
  if (process.platform === "linux" && fs.existsSync(linuxDefault)) return linuxDefault;
  return path.resolve(process.cwd(), "data");
}

const dataDir = resolveRuntimeDir();
const manualCredentialsFile = path.join(dataDir, "manual-credentials.json");

function ensureFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(manualCredentialsFile)) {
    fs.writeFileSync(manualCredentialsFile, JSON.stringify({ items: [] }, null, 2), "utf8");
  }
}

function readStore(): ManualCredentialsStoreData {
  ensureFiles();
  try {
    const raw = fs.readFileSync(manualCredentialsFile, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw) as ManualCredentialsStoreData;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

function writeStore(data: ManualCredentialsStoreData) {
  ensureFiles();
  fs.writeFileSync(manualCredentialsFile, JSON.stringify(data, null, 2), "utf8");
}

function normalizeProductId(value: string) {
  return String(value || "").trim();
}

function normalizeLogin(value: string) {
  return String(value || "").trim();
}

function normalizePassword(value: string) {
  return String(value || "").trim();
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function pairFingerprint(productId: string, login: string, password: string) {
  return `${normalizeProductId(productId).toLowerCase()}::${normalizeLogin(login).toLowerCase()}::${normalizePassword(password)}`;
}

function sortByCreatedAsc(a: ManualCredentialRecord, b: ManualCredentialRecord) {
  const aTs = Date.parse(a.createdAt || "");
  const bTs = Date.parse(b.createdAt || "");
  if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return aTs - bTs;
  return a.id.localeCompare(b.id);
}

export const manualCredentialsStore = {
  ensure() {
    ensureFiles();
  },

  listByProduct(productId: string, options?: { status?: ManualCredentialStatus; q?: string }) {
    const pid = normalizeProductId(productId);
    if (!pid) return [];
    const status = options?.status;
    const query = String(options?.q || "").trim().toLowerCase();
    const data = readStore();
    return data.items
      .filter((item) => item.productId === pid)
      .filter((item) => (status ? item.status === status : true))
      .filter((item) => {
        if (!query) return true;
        return (
          String(item.login || "").toLowerCase().includes(query) ||
          String(item.email || "").toLowerCase().includes(query) ||
          String(item.orderId || "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => sortByCreatedAsc(b, a));
  },

  statsByProduct(productId: string) {
    const pid = normalizeProductId(productId);
    const items = this.listByProduct(pid);
    const available = items.filter((item) => item.status === "available").length;
    const assigned = items.filter((item) => item.status === "assigned").length;
    return { total: items.length, available, assigned };
  },

  import(productId: string, entries: Array<{ login: string; password: string }>) {
    const pid = normalizeProductId(productId);
    if (!pid) throw new Error("productId is required");
    const cleaned = (Array.isArray(entries) ? entries : [])
      .map((entry) => ({
        login: normalizeLogin(entry.login),
        password: normalizePassword(entry.password),
      }))
      .filter((entry) => entry.login && entry.password);

    if (!cleaned.length) {
      return { inserted: 0, skipped: 0 };
    }

    const data = readStore();
    const existingFingerprints = new Set(data.items.map((item) => pairFingerprint(item.productId, item.login, item.password)));
    let inserted = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    cleaned.forEach((entry) => {
      const fp = pairFingerprint(pid, entry.login, entry.password);
      if (existingFingerprints.has(fp)) {
        skipped += 1;
        return;
      }
      existingFingerprints.add(fp);
      data.items.push({
        id: randomUUID(),
        productId: pid,
        login: entry.login,
        password: entry.password,
        status: "available",
        orderId: null,
        email: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        assignedAt: null,
      });
      inserted += 1;
    });

    if (inserted > 0) {
      writeStore(data);
    }

    return { inserted, skipped };
  },

  deleteAvailableById(productId: string, credentialId: string) {
    const pid = normalizeProductId(productId);
    const id = String(credentialId || "").trim();
    if (!pid || !id) return { ok: false as const, reason: "invalid_input" as const };

    const data = readStore();
    const index = data.items.findIndex((item) => item.id === id && item.productId === pid);
    if (index < 0) return { ok: false as const, reason: "not_found" as const };
    if (data.items[index].status !== "available") {
      return { ok: false as const, reason: "not_available" as const };
    }

    data.items.splice(index, 1);
    writeStore(data);
    return { ok: true as const };
  },

  findByOrderId(orderId: string) {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) return null;
    const data = readStore();
    return data.items.find((item) => item.orderId === normalizedOrderId) || null;
  },

  assignNextAvailable(input: { productId: string; orderId: string; email?: string | null }) {
    const productId = normalizeProductId(input.productId);
    const orderId = String(input.orderId || "").trim();
    if (!productId || !orderId) return null;

    const data = readStore();
    const alreadyAssigned = data.items.find((item) => item.orderId === orderId && item.productId === productId);
    if (alreadyAssigned) return alreadyAssigned;

    const candidates = data.items.filter((item) => item.productId === productId && item.status === "available").sort(sortByCreatedAsc);
    const picked = candidates[0];
    if (!picked) return null;

    const nowIso = new Date().toISOString();
    picked.status = "assigned";
    picked.orderId = orderId;
    picked.email = normalizeEmail(input.email);
    picked.assignedAt = nowIso;
    picked.updatedAt = nowIso;

    writeStore(data);
    return picked;
  },
};
