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

export const activationStore = {
  ensure() {
    ensureFiles();
  },

  findByOrderId(orderId: string) {
    ensureFiles();
    const data = readJson<ActivationStoreData>(activationFile, { items: [] });
    return data.items.find((item) => item.orderId === orderId) || null;
  },

  upsert(record: ActivationRecord) {
    ensureFiles();
    const data = readJson<ActivationStoreData>(activationFile, { items: [] });
    const index = data.items.findIndex((item) => item.orderId === record.orderId);
    if (index >= 0) {
      data.items[index] = record;
    } else {
      data.items.push(record);
    }
    writeJson(activationFile, data);
  },

  list() {
    ensureFiles();
    const data = readJson<ActivationStoreData>(activationFile, { items: [] });
    return data.items.slice();
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
