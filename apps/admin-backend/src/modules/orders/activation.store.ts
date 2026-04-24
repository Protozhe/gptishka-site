import fs from "fs";
import path from "path";
import { cdkKeysStore } from "../cdks/cdk-keys.store";

export type ActivationRecord = {
  orderId: string;
  email: string;
  productKey: string;
  cdk: string;
  // Safe debug info (never store raw tokens).
  tokenMeta?: {
    kind: "raw" | "json_accessToken" | "json_sessionToken" | "json_token" | "json_unknown";
    length: number;
    fingerprint: string; // sha256(extracted).slice(0, 16)
  } | null;
  // Some upstream providers bind tasks to a device id; keep it stable per order activation.
  deviceId?: string | null;
  status: "issued" | "processing" | "success" | "failed";
  taskId?: string | null;
  attempts?: number;
  tokenValidationAttempts?: number;
  lastTokenValidatedAt?: string | null;
  clientTokenCiphertext?: string | null;
  clientTokenIv?: string | null;
  clientTokenAuthTag?: string | null;
  clientTokenStoredAt?: string | null;
  clientTokenExpiresAt?: string | null;
  verificationState?: "unknown" | "pending" | "success" | "failed";
  lastProviderMessage?: string | null;
  lastProviderCheckedAt?: string | null;
  lastProviderPayload?: Record<string, unknown> | null;
  issuedAt: string;
  updatedAt: string;
};

type ActivationStoreData = {
  items: ActivationRecord[];
};

function resolveDataDir() {
  const fromEnv = String(process.env.GPTISHKA_RUNTIME_DIR || process.env.RUNTIME_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);

  // Production-safe default: keep runtime state outside the git working tree.
  // On our Ubuntu hosts this path is persistent across deploys.
  const linuxDefault = "/var/lib/gptishka-runtime";
  if (process.platform === "linux" && fs.existsSync(linuxDefault)) return linuxDefault;

  // Dev fallback.
  return path.resolve(process.cwd(), "data");
}

const dataDir = resolveDataDir();
const activationFile = path.join(dataDir, "order-activations.json");
let cachedData: ActivationStoreData | null = null;
let cachedMtimeMs: number | null = null;

function ensureFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(activationFile)) {
    fs.writeFileSync(activationFile, JSON.stringify({ items: [] }, null, 2), "utf8");
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function readStore(): ActivationStoreData {
  ensureFiles();
  try {
    const stat = fs.statSync(activationFile);
    const mtimeMs = Number(stat.mtimeMs || 0);
    if (cachedData && cachedMtimeMs !== null && mtimeMs === cachedMtimeMs) {
      return cachedData;
    }
    const fresh = readJson<ActivationStoreData>(activationFile, { items: [] });
    cachedData = fresh;
    cachedMtimeMs = mtimeMs;
    return fresh;
  } catch {
    const fallback = { items: [] };
    cachedData = fallback;
    cachedMtimeMs = null;
    return fallback;
  }
}

function writeStore(data: ActivationStoreData) {
  ensureFiles();
  writeJson(activationFile, data);
  cachedData = data;
  try {
    cachedMtimeMs = Number(fs.statSync(activationFile).mtimeMs || 0);
  } catch {
    cachedMtimeMs = null;
  }
}

export const activationStore = {
  ensure() {
    ensureFiles();
  },

  findByOrderId(orderId: string) {
    const data = readStore();
    return data.items.find((item) => item.orderId === orderId) || null;
  },

  upsert(record: ActivationRecord) {
    const data = readStore();
    const index = data.items.findIndex((item) => item.orderId === record.orderId);
    if (index >= 0) {
      data.items[index] = record;
    } else {
      data.items.push(record);
    }
    writeStore(data);
  },

  list() {
    const data = readStore();
    return data.items.slice();
  },

  findByOrderIds(orderIds: string[]) {
    const normalized = Array.from(
      new Set(
        (Array.isArray(orderIds) ? orderIds : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
    if (!normalized.length) return new Map<string, ActivationRecord>();

    const wanted = new Set(normalized);
    const result = new Map<string, ActivationRecord>();
    const data = readStore();

    for (const item of data.items) {
      const key = String(item.orderId || "").trim();
      if (!key || !wanted.has(key)) continue;
      result.set(key, item);
      if (result.size >= wanted.size) break;
    }

    return result;
  },

  async reserveCdkForOrder(input: { productKey: string; orderId: string; email: string; excludeCdk?: string }) {
    const reserved = await cdkKeysStore.assignNextUnused({
      productKey: input.productKey,
      orderId: input.orderId,
      email: input.email,
      excludeCode: input.excludeCdk,
    });
    return reserved?.code || null;
  },
};
