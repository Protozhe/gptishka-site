import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type Entry = {
  orderId: string;
  status: "pending" | "sending" | "sent" | "cancelled";
  attempts: number;
  createdAt: number;
  nextAttemptAt: number;
  leaseUntil?: number;
  messageId?: number;
  lastError?: string;
};
type State = { version: 1; items: Entry[] };
const LEASE_MS = 5 * 60_000;

// Persist order ids only. Customer data and recovery tokens are rebuilt from
// the authoritative order when sending, never copied into the queue file.
export class ManagerNotificationsOutbox {
  constructor(private readonly file: string, private readonly now = Date.now) {}

  private read(): State {
    try {
      const state = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (state.version !== 1 || !Array.isArray(state.items) || state.items.some((item: Entry) =>
        !item || typeof item.orderId !== "string" || !["pending", "sending", "sent", "cancelled"].includes(item.status)
        || !Number.isFinite(item.attempts) || !Number.isFinite(item.nextAttemptAt))) {
        throw new Error("Invalid manager notification outbox");
      }
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {version: 1, items: []};
      throw error;
    }
  }

  private async edit<T>(change: (state: State) => T): Promise<T> {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const lock = this.file + ".lock";
    const deadline = Date.now() + 5000;
    let fd: number;
    for (;;) {
      try {
        fd = fs.openSync(lock, "wx", 0o600);
        try { fs.writeFileSync(fd, JSON.stringify({pid: process.pid})); }
        catch (error) { fs.closeSync(fd); fs.unlinkSync(lock); throw error; }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
          try { process.kill(owner.pid, 0); }
          catch (probe) {
            if ((probe as NodeJS.ErrnoException).code === "ESRCH") { fs.unlinkSync(lock); continue; }
          }
        } catch {
          // A process may die between creating the lock and writing its pid.
          try {
            if (Date.now() - fs.statSync(lock).mtimeMs > 60_000) { fs.unlinkSync(lock); continue; }
          } catch { /* The owner may have released the lock meanwhile. */ }
        }
        if (Date.now() >= deadline) throw new Error("Manager notification outbox is busy");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    let temp = "";
    try {
      const state = this.read();
      const result = change(state);
      temp = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      const writeFd = fs.openSync(temp, "wx", 0o600);
      try { fs.writeFileSync(writeFd, JSON.stringify(state)); fs.fsyncSync(writeFd); }
      finally { fs.closeSync(writeFd); }
      fs.renameSync(temp, this.file);
      return result;
    } finally {
      if (temp && fs.existsSync(temp)) fs.unlinkSync(temp);
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }

  async enqueue(orderId: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(orderId)) throw new Error("Invalid notification order id");
    await this.edit(state => {
      if (!state.items.some(item => item.orderId === orderId)) {
        state.items.push({orderId, status: "pending", attempts: 0, createdAt: this.now(), nextAttemptAt: this.now()});
      }
    });
  }

  snapshot() { return structuredClone(this.read().items); }

  dueIds(limit = 10) {
    return this.read().items.filter(item => this.isDue(item))
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt).slice(0, limit).map(item => item.orderId);
  }

  private isDue(item: Entry) {
    return (item.status === "pending" && item.nextAttemptAt <= this.now())
      || (item.status === "sending" && Number(item.leaseUntil || 0) <= this.now());
  }

  async deliver(orderId: string, send: (orderId: string) => Promise<number | null>) {
    const claimed = await this.edit(state => {
      const item = state.items.find(entry => entry.orderId === orderId);
      if (!item || !this.isDue(item)) return null;
      item.status = "sending";
      item.attempts++;
      item.leaseUntil = this.now() + LEASE_MS;
      return {...item};
    });
    if (!claimed) return null;
    try {
      const messageId = await send(orderId);
      if (messageId !== null && (!Number.isInteger(messageId) || messageId <= 0)) {
        throw new Error("Telegram did not confirm a message id");
      }
      await this.edit(state => {
        const item = state.items.find(entry => entry.orderId === orderId)!;
        if (item.attempts !== claimed.attempts || item.leaseUntil !== claimed.leaseUntil) return;
        item.status = messageId === null ? "cancelled" : "sent";
        if (messageId !== null) item.messageId = messageId;
        delete item.leaseUntil;
        delete item.lastError;
      });
      return messageId;
    } catch (error) {
      await this.edit(state => {
        const item = state.items.find(entry => entry.orderId === orderId)!;
        if (item.attempts !== claimed.attempts || item.leaseUntil !== claimed.leaseUntil) return;
        item.status = "pending";
        item.nextAttemptAt = this.now() + Math.min(30 * 60_000, 60_000 * 2 ** Math.min(item.attempts - 1, 5));
        item.lastError = ["TimeoutError", "AbortError", "TypeError"].includes((error as Error)?.name)
          ? (error as Error).name : "DeliveryError";
        delete item.leaseUntil;
      });
      console.warn(`[manager-notifications] delivery deferred order=${orderId} attempt=${claimed.attempts}`);
      return null;
    }
  }
}
