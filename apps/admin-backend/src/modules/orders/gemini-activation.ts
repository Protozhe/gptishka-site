import crypto from "crypto";
import { AppError } from "../../common/errors/app-error";
import { GEMINI_ACTIVATION_SITE, GEMINI_WORKFLOWS, isGeminiAutomaticProduct, parseGeminiAccount } from "../../common/utils/gemini-product";
import type { ActivationRecord } from "./activation.store";

export const GEMINI_FULFILLMENT_OWNER = "gemini-pro-cdk-v1";
type Phase = "awaiting_account" | "awaiting_key" | "checking" | "dispatching" | "processing" | "success" | "needs_help" | "credentials_expired";
type Dependencies = {
  loadOrder: (id: string) => Promise<any>;
  isPaid: (order: any) => boolean;
  records: { findByOrderId: (id: string) => ActivationRecord | null; upsert: (record: ActivationRecord) => void; list: () => ActivationRecord[] };
  lock: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  protect: (raw: string) => Partial<ActivationRecord>;
  unprotect: (record: ActivationRecord) => string;
  reserve: (input: { productKey: string; activationSiteUrls: string[]; orderId: string; email: string }) => Promise<{ code: string } | null>;
  provider: (action: "verifyCdk" | "activate" | "status", data: Record<string, unknown>) => Promise<{ status: number; json: any }>;
  notifyStock: (id: string) => Promise<unknown>;
};

function metadata(record: ActivationRecord) {
  return record.lastProviderPayload?.source === GEMINI_FULFILLMENT_OWNER ? record.lastProviderPayload : {};
}

function phase(record: ActivationRecord): Phase {
  if (record.status === "success" || record.verificationState === "success") return "success";
  return (metadata(record).phase as Phase) || "awaiting_account";
}

function safeProviderResult(response: { status: number; json: any }) {
  const data = response.json;
  if (response.status < 200 || response.status >= 300 || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
  const success = data.ok === true && (status === "done" || (data.final === true && (status === "success" || data.success === true)));
  return {
    ok: data.ok === true, success, failed: data.final === true && !success,
    pending: data.ok === true && ["processing", "queued", "pending", "running"].includes(status),
    workflow: typeof data.workflow === "string" ? data.workflow : "",
    // Persist only a short task identifier. Raw replies can contain account data.
    taskId: /^[a-z\d_-]{1,128}$/i.test(String(data.job_id || data.task_id || "")) ? String(data.job_id || data.task_id) : "",
  };
}

export function createGeminiActivation(deps: Dependencies) {
  async function orderFor(id: string) {
    const order = await deps.loadOrder(id);
    const product = order?.items?.[0]?.product;
    if (!order || !isGeminiAutomaticProduct(product?.slug)) throw new AppError("Gemini order not found", 404);
    if (!deps.isPaid(order)) throw new AppError("Order is not paid yet", 409);
    if (order.items.length !== 1 || Number(order.items[0].quantity) !== 1) throw new AppError("Gemini activation requires one plan per order", 409);
    const selection = order.orderDetails?.selection;
    if (selection?.needsNewAccount === true && Number(selection?.serverNewAccountSurcharge) > 0) {
      throw new AppError("New accounts are delivered by the manager", 409);
    }
    return { order, product };
  }

  function save(record: ActivationRecord, next: Phase, extra: Partial<ActivationRecord> = {}, meta: Record<string, unknown> = {}) {
    const done = next === "success";
    const failed = next === "needs_help" || next === "credentials_expired";
    const clear = done || failed || next === "dispatching" || next === "processing";
    const updated: ActivationRecord = {
      ...record, ...(clear ? deps.protect("") : {}), ...extra,
      externalFulfillmentOwner: GEMINI_FULFILLMENT_OWNER,
      status: done ? "success" : failed ? "failed" : next === "awaiting_account" ? "issued" : "processing",
      verificationState: done ? "success" : failed ? "failed" : next === "awaiting_account" ? "unknown" : "pending",
      lastProviderPayload: { ...metadata(record), source: GEMINI_FULFILLMENT_OWNER, ...meta, phase: next },
      // Fixed messages only: never persist a provider error or customer credentials.
      lastProviderMessage: done ? "Gemini Pro activated" : failed ? "Gemini activation requires attention" : "Gemini activation in progress",
      updatedAt: new Date().toISOString(),
    };
    deps.records.upsert(updated);
    return updated;
  }

  function ensure(order: any, product: any) {
    let record = deps.records.findByOrderId(order.id);
    if (!record) {
      const now = new Date().toISOString();
      record = { orderId: order.id, email: order.email, productKey: product.slug, cdk: "", status: "issued", issuedAt: now, updatedAt: now };
      record = save(record, "awaiting_account");
    }
    if (record.productKey !== product.slug || (record.externalFulfillmentOwner && record.externalFulfillmentOwner !== GEMINI_FULFILLMENT_OWNER)) {
      throw new AppError("Gemini order route requires review", 409);
    }
    return record;
  }

  function view(record: ActivationRecord, product: any) {
    return {
      orderId: record.orderId, deliveryMode: "activation", activationFlow: "gemini_account",
      product: product.slug, productSlug: product.slug, productTitle: product.title,
      status: record.status, verificationState: record.verificationState || "unknown", phase: phase(record),
      taskId: record.taskId || null, pending: record.status === "processing", success: phase(record) === "success",
    };
  }

  async function submitStored(record: ActivationRecord, order: any, product: any) {
    const raw = deps.unprotect(record);
    if (!raw) return save(record, "credentials_expired");
    const account = parseGeminiAccount(raw);
    if (!record.cdk) {
      // The existing stock service recovers an assignment after a crash and
      // atomically reserves only this exact term and provider, never another plan.
      const assigned = await deps.reserve({ productKey: product.slug, activationSiteUrls: [GEMINI_ACTIVATION_SITE], orderId: order.id, email: order.email });
      if (!assigned) {
        record = save(record, "awaiting_key", { keyAllocationState: "exhausted", keyAllocationSite: GEMINI_ACTIVATION_SITE });
        await deps.notifyStock(order.id).catch(() => {});
        return record;
      }
      record = save(record, "checking", { cdk: assigned.code, activationSiteUrl: GEMINI_ACTIVATION_SITE, keyAllocationState: "selected" });
    }
    let verified;
    try { verified = safeProviderResult(await deps.provider("verifyCdk", { code: record.cdk, product: "gemini" })); }
    catch { return record; } // Verification is read-only and may be retried.
    if (!verified) return record;
    if (!verified.ok || verified.success || verified.failed || verified.pending || verified.workflow !== GEMINI_WORKFLOWS[product.slug]) {
      // A previously consumed or mismatched CDK is not proof that this account
      // was activated. Hold the key for review; never consume or rotate another.
      return save(record, "needs_help");
    }
    // Durable intent BEFORE the network write. A timeout, process restart, or
    // duplicate click can only query this CDK afterwards, never submit it twice.
    record = save(record, "dispatching", { attempts: 1, taskId: `gemini-${order.id}` }, { submittedAt: new Date().toISOString() });
    try {
      const result = safeProviderResult(await deps.provider("activate", { code: record.cdk, product: "gemini", token: JSON.stringify(account), cookie: "", credential_mode: "session_json" }));
      if (!result) return save(record, "processing");
      if (result.workflow && result.workflow !== GEMINI_WORKFLOWS[product.slug]) return save(record, "needs_help");
      if (result.success) return save(record, "success", { taskId: result.taskId || record.taskId });
      if (result.failed || !result.ok) return save(record, "needs_help");
      return save(record, "processing", { taskId: result.taskId || record.taskId });
    } catch { return save(record, "processing"); }
  }

  async function refreshUnlocked(order: any, product: any, record: ActivationRecord) {
    const current = phase(record);
    if (current === "success") return save(record, "success");
    if (["awaiting_key", "checking"].includes(current) && !Number(record.attempts || 0)) {
      return submitStored(record, order, product);
    }
    if (!["dispatching", "processing", "needs_help"].includes(current) || !record.cdk || !Number(record.attempts || 0)) return record;
    const lastCheck = Date.parse(String(record.lastProviderCheckedAt || ""));
    if (Number.isFinite(lastCheck) && Date.now() - lastCheck < 15_000) return record;
    // Persist a check timestamp before querying so tabs and the scheduler share
    // a single polling budget. The response never stores arbitrary provider data.
    record = { ...record, lastProviderCheckedAt: new Date().toISOString() };
    deps.records.upsert(record);
    try {
      const result = safeProviderResult(await deps.provider("status", { code: record.cdk, product: "gemini" }));
      if (result && (!result.workflow || result.workflow === GEMINI_WORKFLOWS[product.slug])) {
        if (result.success) return save(record, "success");
        if (result.failed) return save(record, "needs_help");
        if (result.pending) return save(record, "processing");
      }
    } catch { /* An uncertain result is queried later; never resubmit. */ }
    const submittedAt = Date.parse(String(metadata(record).submittedAt || record.updatedAt));
    if (Date.now() - submittedAt > 30 * 60_000) return save(record, "needs_help");
    return record;
  }

  return {
    async read(id: string, refresh = false) {
      return deps.lock(id, async () => {
        const { order, product } = await orderFor(id);
        let record = ensure(order, product);
        if (refresh) record = await refreshUnlocked(order, product, record);
        return view(record, product);
      });
    },
    async start(id: string, raw: string) {
      return deps.lock(id, async () => {
        const { order, product } = await orderFor(id);
        let record = ensure(order, product);
        if (Number(record.attempts || 0) || phase(record) === "success") return view(await refreshUnlocked(order, product, record), product);
        const account = parseGeminiAccount(raw);
        const fingerprint = crypto.createHash("sha256").update(account.email).digest("hex");
        const prior = metadata(record).accountFingerprint;
        if (prior && prior !== fingerprint) throw new AppError("gemini_account_already_bound", 409);
        record = save(record, "checking", {
          ...deps.protect(JSON.stringify({ ...account, consent: true })),
          clientTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        }, { accountFingerprint: fingerprint });
        return view(await submitStored(record, order, product), product);
      });
    },
    async tick() {
      const records = deps.records.list().filter((record) => isGeminiAutomaticProduct(record.productKey) &&
        record.externalFulfillmentOwner === GEMINI_FULFILLMENT_OWNER &&
        !["awaiting_account", "success", "credentials_expired"].includes(phase(record)))
        .sort((a, b) => Date.parse(a.lastProviderCheckedAt || a.updatedAt) - Date.parse(b.lastProviderCheckedAt || b.updatedAt)).slice(0, 12);
      for (const record of records) {
        try { await this.read(record.orderId, true); } catch { /* No credential-bearing error logs. */ }
      }
    },
  };
}
