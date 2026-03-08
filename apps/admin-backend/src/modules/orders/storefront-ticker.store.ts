import fs from "fs";
import path from "path";

export type StorefrontTickerSettings = {
  hiddenEmails: string[];
  hiddenOrderIds: string[];
  updatedAt: string;
};

type StorefrontTickerSettingsFile = {
  hiddenEmails?: unknown;
  hiddenOrderIds?: unknown;
  updatedAt?: unknown;
};

const MAX_HIDDEN_EMAILS = 500;
const MAX_HIDDEN_ORDER_IDS = 1000;
const DEFAULT_UPDATED_AT = new Date(0).toISOString();

function resolveDataDir() {
  const fromEnv = String(process.env.GPTISHKA_RUNTIME_DIR || process.env.RUNTIME_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);

  const linuxDefault = "/var/lib/gptishka-runtime";
  if (process.platform === "linux" && fs.existsSync(linuxDefault)) return linuxDefault;

  return path.resolve(process.cwd(), "data");
}

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeOrderId(value: unknown) {
  return String(value || "").trim();
}

function sanitizeHiddenEmails(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  const unique = new Set<string>();
  for (const item of raw) {
    const email = normalizeEmail(item);
    if (!email || !email.includes("@")) continue;
    if (email.length > 320) continue;
    unique.add(email);
    if (unique.size >= MAX_HIDDEN_EMAILS) break;
  }

  return Array.from(unique);
}

function sanitizeHiddenOrderIds(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  const unique = new Set<string>();
  for (const item of raw) {
    const orderId = normalizeOrderId(item);
    if (!orderId || orderId.length < 6 || orderId.length > 120) continue;
    unique.add(orderId);
    if (unique.size >= MAX_HIDDEN_ORDER_IDS) break;
  }

  return Array.from(unique);
}

function toSettings(input: StorefrontTickerSettingsFile | null | undefined): StorefrontTickerSettings {
  const hiddenEmails = sanitizeHiddenEmails(input?.hiddenEmails);
  const hiddenOrderIds = sanitizeHiddenOrderIds(input?.hiddenOrderIds);
  const updatedAtRaw = String(input?.updatedAt || "").trim();
  const updatedAt = Number.isNaN(Date.parse(updatedAtRaw)) ? DEFAULT_UPDATED_AT : updatedAtRaw;

  return {
    hiddenEmails,
    hiddenOrderIds,
    updatedAt,
  };
}

const dataDir = resolveDataDir();
const settingsFile = path.join(dataDir, "storefront-ticker-settings.json");

function ensureFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(settingsFile)) return;

  const initial: StorefrontTickerSettings = {
    hiddenEmails: [],
    hiddenOrderIds: [],
    updatedAt: DEFAULT_UPDATED_AT,
  };
  fs.writeFileSync(settingsFile, JSON.stringify(initial, null, 2), "utf8");
}

function readSettings(): StorefrontTickerSettings {
  ensureFile();
  try {
    const raw = fs.readFileSync(settingsFile, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw) as StorefrontTickerSettingsFile;
    return toSettings(parsed);
  } catch {
    return {
      hiddenEmails: [],
      hiddenOrderIds: [],
      updatedAt: DEFAULT_UPDATED_AT,
    };
  }
}

function writeSettings(settings: StorefrontTickerSettings) {
  ensureFile();
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf8");
}

export const storefrontTickerStore = {
  normalizeEmail,

  get() {
    return readSettings();
  },

  update(input: { hiddenEmails?: string[]; hiddenOrderIds?: string[] }) {
    const current = readSettings();
    const next: StorefrontTickerSettings = {
      hiddenEmails:
        input.hiddenEmails === undefined
          ? current.hiddenEmails
          : sanitizeHiddenEmails(input.hiddenEmails),
      hiddenOrderIds:
        input.hiddenOrderIds === undefined
          ? current.hiddenOrderIds
          : sanitizeHiddenOrderIds(input.hiddenOrderIds),
      updatedAt: new Date().toISOString(),
    };

    writeSettings(next);
    return next;
  },
};
