import fs from "node:fs";
import path from "node:path";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import sqlite3 from "sqlite3";
import { ProxyAgent, fetch } from "undici";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";

const schema = z.object({
  enabled: z.literal(true),
  botToken: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/),
  users: z.record(z.string(), z.string().regex(/^[1-9][0-9]+$/)),
  marketplaceMaintainers: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).max(8).default([]),
  proxyUrl: z.literal("http://127.0.0.1:18082"),
  database: z.string().startsWith("/var/lib/gptishka-runtime/website/"),
});
type Config = z.infer<typeof schema>;
let cached: Config | null | undefined;

function configuration(): Config | null {
  if (cached !== undefined) return cached;
  const file = process.env.ADMIN_MFA_CONFIG_FILE || (env.NODE_ENV === "production" ? "/etc/gptishka-admin-mfa.json" : "");
  if (!file) return (cached = null);
  try {
    const stat = fs.statSync(file);
    if ((stat.mode & 0o007) !== 0) throw new Error("Public configuration");
    return (cached = schema.parse(JSON.parse(fs.readFileSync(file, "utf8"))));
  } catch {
    throw new AppError("Вход временно недоступен: проверьте настройку второго фактора", 503);
  }
}

export function telegramMfaRequired() { return configuration() !== null; }

export function canMaintainMarketplaceAccounts(userId: string, role: string) {
  if (role === "OWNER") return true;
  if (role !== "ADMIN") return false;
  const config = configuration();
  // Individual delegation, never a grant to every administrator. A private
  // Telegram MFA binding is required in addition to the configured user ID.
  return Boolean(config?.users[userId] && config.marketplaceMaintainers.includes(userId));
}

function digest(value: string) {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(value).digest("hex");
}

export function requestBinding(ip: string, userAgent: string) {
  return digest(JSON.stringify([canonicalIp(ip) || ip, userAgent]));
}

export function canonicalIp(value: string): string | null {
  const ip = String(value || "").trim().toLowerCase();
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6 || ip.includes("%")) return null;
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(normalized);
  if (!mapped) return normalized;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function credentialVersion(userId: string, passwordHash: string) {
  return digest(JSON.stringify(["admin-credentials-v1", userId, passwordHash]));
}

type Challenge = { id: string; user_id: string; code_hash: string; binding: string; expires: number; attempts: number; used: number; credential_version: string };
type VerifiedChallenge = { userId: string; credentialVersion: string };
const databaseQueues = new Map<string, Promise<void>>();

// Each transaction owns a connection, so concurrent requests cannot interleave
// BEGIN/COMMIT on one shared SQLite connection. No clear-text codes are stored.
export class ChallengeStore {
  constructor(private file: string, private hash = digest) {}

  private async connection() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    // Create the file with restrictive permissions before SQLite opens it.
    fs.closeSync(fs.openSync(this.file, "a", 0o600));
    if (process.platform !== "win32") fs.chmodSync(this.file, 0o600);
    const db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const opened = new sqlite3.Database(this.file, error => error ? reject(error) : resolve(opened));
    });
    db.configure("busyTimeout", 5000);
    return db;
  }

  private run(db: sqlite3.Database, sql: string, params: unknown[] = []) {
    return new Promise<void>((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
  }
  private get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []) {
    return new Promise<T | undefined>((resolve, reject) => db.get<T>(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  }
  private close(db: sqlite3.Database) {
    return new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }
  private async transaction<T>(fn: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    // Avoid filling Node's SQLite thread pool with connections waiting for
    // another connection's COMMIT. BEGIN IMMEDIATE also guards other processes.
    const previous = databaseQueues.get(this.file) || Promise.resolve();
    const task = previous.then(() => this.performTransaction(fn));
    databaseQueues.set(this.file, task.then(() => undefined, () => undefined));
    return task;
  }
  private async performTransaction<T>(fn: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    const db = await this.connection();
    try {
      await this.run(db, "CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,code_hash TEXT NOT NULL,binding TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0,credential_version TEXT NOT NULL DEFAULT '')");
      await this.run(db, "BEGIN IMMEDIATE");
      try {
        const column = await this.get<{ count: number }>(db, "SELECT count(*) AS count FROM pragma_table_info('challenges') WHERE name='credential_version'");
        if (!column?.count) await this.run(db, "ALTER TABLE challenges ADD COLUMN credential_version TEXT NOT NULL DEFAULT ''");
        await this.run(db, "CREATE TABLE IF NOT EXISTS trusted_ips(user_id TEXT NOT NULL,ip_hash TEXT NOT NULL,credential_version TEXT NOT NULL,verified_at INTEGER NOT NULL,last_used_at INTEGER NOT NULL,PRIMARY KEY(user_id,ip_hash))");
        const value = await fn(db);
        await this.run(db, "COMMIT");
        return value;
      } catch (error) { await this.run(db, "ROLLBACK"); throw error; }
    } finally { await this.close(db); }
  }
  async create(userId: string, binding: string, code: string, now = Date.now(), version = "") {
    return this.transaction(async db => {
      await this.run(db, "DELETE FROM challenges WHERE expires < ?", [now - 300_000]);
      const recent = await this.get<{ created: number }>(db, "SELECT created FROM challenges WHERE user_id=? ORDER BY created DESC LIMIT 1", [userId]);
      if (recent && recent.created > now - 60_000) throw new AppError("Код уже отправлен. Повторите вход через минуту", 429);
      await this.run(db, "UPDATE challenges SET used=1 WHERE user_id=?", [userId]);
      const id = randomUUID();
      await this.run(db, "INSERT INTO challenges(id,user_id,code_hash,binding,created,expires,credential_version) VALUES(?,?,?,?,?,?,?)", [id, userId, this.hash(`${id}:${code}`), binding, now, now + 300_000, version]);
      return id;
    });
  }
  async invalidate(id: string) {
    await this.transaction(db => this.run(db, "UPDATE challenges SET used=1 WHERE id=?", [id]));
  }
  async consume(id: string, code: string, binding: string, now = Date.now()): Promise<string | null> {
    return (await this.consumeVerified(id, code, binding, now))?.userId || null;
  }
  async consumeVerified(id: string, code: string, binding: string, now = Date.now()): Promise<VerifiedChallenge | null> {
    return this.transaction(async db => {
      const row = await this.get<Challenge>(db, "SELECT * FROM challenges WHERE id=?", [id]);
      if (!row || row.used || row.expires <= now || row.attempts >= 5) return null;
      const expected = Buffer.from(row.code_hash, "hex"), actual = Buffer.from(this.hash(`${id}:${code}`), "hex");
      const ok = row.binding === binding && expected.length === actual.length && timingSafeEqual(expected, actual);
      await this.run(db, "UPDATE challenges SET attempts=attempts+1,used=? WHERE id=?", [ok || row.attempts >= 4 ? 1 : 0, id]);
      return ok ? { userId: row.user_id, credentialVersion: row.credential_version } : null;
    });
  }

  private ipHash(ip: string) {
    const normalized = canonicalIp(ip);
    return normalized ? this.hash(JSON.stringify(["admin-ip-v1", normalized])) : null;
  }
  async rememberIp(userId: string, ip: string, version: string, now = Date.now()) {
    const hash = this.ipHash(ip);
    if (!hash || !version) return;
    await this.transaction(db => this.run(db, "INSERT INTO trusted_ips VALUES(?,?,?,?,?) ON CONFLICT(user_id,ip_hash) DO UPDATE SET credential_version=excluded.credential_version,verified_at=excluded.verified_at,last_used_at=excluded.last_used_at", [userId, hash, version, now, now]));
  }
  async trustsIp(userId: string, ip: string, version: string, now = Date.now()) {
    const hash = this.ipHash(ip);
    if (!hash || !version) return false;
    return this.transaction(async db => {
      const row = await this.get<{ credential_version: string }>(db, "SELECT credential_version FROM trusted_ips WHERE user_id=? AND ip_hash=?", [userId, hash]);
      if (!row || row.credential_version !== version) return false;
      await this.run(db, "UPDATE trusted_ips SET last_used_at=? WHERE user_id=? AND ip_hash=?", [now, userId, hash]);
      return true;
    });
  }
}

export async function sendCode(config: Config, chatId: string, code: string) {
  if (!/^[0-9]{6}$/.test(code)) throw new Error("invalid_mfa_code");
  const dispatcher = new ProxyAgent(config.proxyUrl);
  async function call(method: string, params: Record<string, string> = {}) {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}?${new URLSearchParams(params)}`, {
      dispatcher, signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    const body = await response.json() as { ok?: boolean; result?: any };
    if (!response.ok || !body.ok) throw new Error("telegram_delivery_failed");
    return body.result;
  }
  try {
    const identity = await call("getMe");
    const chat = await call("getChat", { chat_id: chatId });
    if (String(identity.username).toLowerCase() !== "myadminiibot" || chat.type !== "private") throw new Error("telegram_destination_invalid");
    await call("sendMessage", {
      chat_id: chatId,
      text: `🔐 <b>GPTishka · Вход в админку</b>\n\n<b>Код подтверждения</b>\n<code>${code}</code>\n⏳ Действует <b>5 минут</b>.\n\n🔗 Вводите только на <a href="https://gptishka.shop/admin/login">странице входа GPTishka</a>.\n\n🛡 Никому не сообщайте код.\nЕсли вы не входили, смените пароль.`,
      parse_mode: "HTML", protect_content: "false", disable_web_page_preview: "true",
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: "📋 Скопировать код", copy_text: { text: code } }]],
      }),
    });
  } finally { await dispatcher.close(); }
}

export async function hasTrustedIp(userId: string, ip: string, version: string) {
  const config = configuration();
  if (!config?.users[userId]) return false;
  return new ChallengeStore(config.database).trustsIp(userId, ip, version);
}

export async function rememberVerifiedIp(userId: string, ip: string, version: string) {
  const config = configuration();
  if (!config?.users[userId]) throw new AppError("Unauthorized", 401);
  await new ChallengeStore(config.database).rememberIp(userId, ip, version);
}

export async function beginTelegramChallenge(userId: string, binding: string, version: string) {
  const config = configuration();
  if (!config || !config.users[userId]) throw new AppError("Для аккаунта не настроен личный чат второго фактора", 503);
  const store = new ChallengeStore(config.database);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = await store.create(userId, binding, code, Date.now(), version);
  try { await sendCode(config, config.users[userId], code); }
  catch {
    await store.invalidate(id);
    throw new AppError("Не удалось доставить код в Telegram. Повторите вход через минуту", 503);
  }
  return { requiresMfa: true as const, challengeId: id, expiresIn: 300 };
}

export async function consumeTelegramChallenge(id: string, code: string, binding: string) {
  const config = configuration();
  if (!config) throw new AppError("Unauthorized", 401);
  const verified = await new ChallengeStore(config.database).consumeVerified(id, code, binding);
  if (!verified || !config.users[verified.userId]) throw new AppError("Неверный или истёкший код. Повторите вход, если использованы все попытки", 401);
  return verified;
}
