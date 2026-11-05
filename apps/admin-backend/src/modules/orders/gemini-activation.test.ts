import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createGeminiActivation, GEMINI_FULFILLMENT_OWNER } from "./gemini-activation";
import { GEMINI_ACTIVATION_SITE, GEMINI_WORKFLOWS, isGeminiAutomaticProduct, parseGeminiAccount } from "../../common/utils/gemini-product";
import { resolveNewAccountSurcharge } from "../payments/new-account-option";

const account = { email: "buyer@example.test", password: "fixture-password-only", twofa: "12345678", consent: true };
const raw = JSON.stringify(account);
function fixture(slug = "gemini-pro-6m") {
  const records = new Map<string, any>(), calls: any[] = [];
  const order: any = { id: "fixture-order", email: "contact@example.test", status: "PAID", paid: true, items: [{ quantity: 1, product: { slug, title: "Gemini Pro" } }] };
  let gate: Promise<unknown> = Promise.resolve(), hasStock = true, complete = false, timeOut = false, wrongPlan = false, consumed = false;
  let reserveCount = 0, notifications = 0;
  const key = crypto.randomBytes(32);
  function protect(value: string) {
    if (!value) return { clientTokenCiphertext: null, clientTokenIv: null, clientTokenAuthTag: null, clientTokenExpiresAt: null };
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    return { clientTokenCiphertext: Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64"), clientTokenIv: iv.toString("base64"), clientTokenAuthTag: cipher.getAuthTag().toString("base64") };
  }
  const service = createGeminiActivation({
    loadOrder: async () => order, isPaid: (value) => value.paid && value.status === "PAID",
    records: { findByOrderId: (id) => records.get(id) || null, upsert: (value) => records.set(value.orderId, { ...value }), list: () => [...records.values()] },
    lock: <T>(_id: string, fn: () => Promise<T>) => { const result = gate.then(fn); gate = result.catch(() => {}); return result; },
    protect,
    unprotect: (record: any) => {
      if (!record.clientTokenCiphertext || Date.parse(record.clientTokenExpiresAt) < Date.now()) return "";
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(record.clientTokenIv, "base64"));
      decipher.setAuthTag(Buffer.from(record.clientTokenAuthTag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(record.clientTokenCiphertext, "base64")), decipher.final()]).toString("utf8");
    },
    reserve: async (input) => { assert.equal(input.productKey, slug); assert.deepEqual(input.activationSiteUrls, [GEMINI_ACTIVATION_SITE]); reserveCount++; return hasStock ? { code: "CaseSensitive-Fixture-CDK" } : null; },
    provider: async (action, data) => {
      calls.push({ action, data });
      if (action === "verifyCdk") return { status: 200, json: { ok: true, workflow: wrongPlan ? "gemini_24m" : GEMINI_WORKFLOWS[slug], status: consumed ? "done" : "unused", final: consumed } };
      if (action === "activate") { if (timeOut) throw Error("fixture transport timeout"); return { status: 200, json: { ok: true, status: "processing", job_id: "fixture-task", email: account.email, password: account.password } }; }
      return { status: 200, json: { ok: true, status: complete ? "done" : "processing", final: complete, workflow: GEMINI_WORKFLOWS[slug], password: account.password } };
    },
    notifyStock: async () => { notifications++; },
  });
  function allowPoll() { const record = records.get(order.id); record.lastProviderCheckedAt = null; }
  return { service, records, calls, order, allowPoll, protect,
    stock: (value: boolean) => { hasStock = value; }, finish: () => { complete = true; }, timeout: () => { timeOut = true; }, wrongPlan: () => { wrongPlan = true; }, consumed: () => { consumed = true; },
    get reserved() { return reserveCount; }, get notifications() { return notifications; } };
}

test("Gemini whitelist isolates historical and unrelated products; +200 is server-calculated", () => {
  for (const months of [6, 12, 24]) {
    assert.equal(isGeminiAutomaticProduct(`gemini-pro-${months}m`), true);
    assert.equal(resolveNewAccountSurcharge(`gemini-pro-${months}m`, "RUB", true), 200);
  }
  for (const slug of ["gemini-pro-18", "gemini-pro-12", "gemini-ultra", "chatgpt-plus-1", "gemini-pro-6m-copy"]) {
    assert.equal(isGeminiAutomaticProduct(slug), false);
  }
  assert.equal(resolveNewAccountSurcharge("chatgpt-plus-1", "RUB", true), 250);
  assert.throws(() => resolveNewAccountSurcharge("gemini-pro-18", "RUB", true));
  assert.throws(() => resolveNewAccountSurcharge("gemini-pro-6m", "USD", true));
});

test("Reject malformed credentials, current six-digit codes and missing consent without echoing credentials", () => {
  for (const candidate of ["{}", "not json", JSON.stringify({ ...account, consent: false }), JSON.stringify({ ...account, twofa: "123456" }), JSON.stringify({ ...account, email: "not-an-email" }), JSON.stringify({ ...account, extra: account.password })]) {
    assert.throws(() => parseGeminiAccount(candidate), (error: any) => !error.message.includes(account.password) && error.statusCode === 422);
  }
  assert.equal(parseGeminiAccount(raw).password, account.password);
  assert.equal(parseGeminiAccount(JSON.stringify({ ...account, twofa: "ABCD EFGH IJKL MNOP" })).twofa, "ABCDEFGHIJKLMNOP");
});

test("Unpaid, wrong-plan, multi-item and new-account orders cannot reach the provider", async () => {
  for (const change of [
    (f: any) => { f.order.status = "PENDING"; },
    (f: any) => { f.order.paid = false; },
    (f: any) => { f.order.items[0].product.slug = "gemini-pro-18"; },
    (f: any) => { f.order.items[0].quantity = 2; },
    (f: any) => { f.order.orderDetails = { selection: { needsNewAccount: true, serverNewAccountSurcharge: 200 } }; },
  ]) {
    const f = fixture(); change(f); await assert.rejects(f.service.start(f.order.id, raw));
    assert.equal(f.calls.length, 0); assert.equal(f.reserved, 0); assert.equal(f.records.size, 0);
  }
});

test("Double-click, reload and status polling submit exactly once; credentials never appear in records or public status", async () => {
  const f = fixture();
  const results = await Promise.all([f.service.start(f.order.id, raw), f.service.start(f.order.id, raw)]);
  assert.ok(results.every((result) => result.phase === "processing"));
  assert.equal(f.calls.filter((call) => call.action === "activate").length, 1);
  assert.equal(f.reserved, 1);
  const submitted = f.calls.find((call) => call.action === "activate").data;
  assert.deepEqual(JSON.parse(submitted.token), { email: account.email, password: account.password, twofa: account.twofa, recovery_email: "" });
  assert.equal(submitted.product, "gemini");
  for (const secret of [account.password, account.twofa, account.email]) assert.ok(!JSON.stringify([...f.records.values()]).includes(secret));
  assert.ok(!JSON.stringify(results).includes("CaseSensitive-Fixture-CDK"));
  f.finish(); f.allowPoll(); const completed = await f.service.read(f.order.id, true);
  assert.equal(completed.success, true); assert.equal(completed.phase, "success");
  await f.service.start(f.order.id, raw); assert.equal(f.calls.filter((call) => call.action === "activate").length, 1);
});

test("Timeout after dispatch or crash intent only permits read-only recovery, never another activation POST", async () => {
  const f = fixture(); f.timeout();
  assert.equal((await f.service.start(f.order.id, raw)).phase, "processing");
  for (let i = 0; i < 3; i++) { f.allowPoll(); await f.service.start(f.order.id, raw); }
  assert.equal(f.calls.filter((call) => call.action === "activate").length, 1);
  f.finish(); f.allowPoll(); await f.service.tick();
  assert.equal(f.records.get(f.order.id).status, "success");
  assert.equal(f.records.get(f.order.id).clientTokenCiphertext, null);
});

test("Wrong duration or a used key is held for review and is never activated for another account", async () => {
  for (const mode of ["wrongPlan", "consumed"] as const) {
    const f = fixture(); f[mode]();
    const result = await f.service.start(f.order.id, raw);
    assert.equal(result.phase, "needs_help");
    assert.equal(f.calls.some((call) => call.action === "activate"), false);
    assert.equal(f.records.get(f.order.id).clientTokenCiphertext, null);
  }
});

test("Stock queue stores only ciphertext; exact-term replenishment resumes and expired credentials are discarded", async () => {
  const f = fixture(); f.stock(false);
  assert.equal((await f.service.start(f.order.id, raw)).phase, "awaiting_key");
  assert.equal(f.notifications, 1);
  let stored = JSON.stringify([...f.records.values()]);
  assert.ok(!stored.includes(account.password)); assert.ok(!stored.includes(account.twofa));
  assert.equal(f.records.get(f.order.id).externalFulfillmentOwner, GEMINI_FULFILLMENT_OWNER);
  f.stock(true); await f.service.tick();
  assert.equal(f.calls.filter((call) => call.action === "activate").length, 1);
  const expired = fixture(); expired.stock(false); await expired.service.start(expired.order.id, raw);
  expired.records.get(expired.order.id).clientTokenExpiresAt = new Date(0).toISOString();
  await expired.service.tick();
  assert.equal(expired.records.get(expired.order.id).status, "failed");
  assert.equal(expired.records.get(expired.order.id).clientTokenCiphertext, null);
  assert.equal(expired.calls.length, 0);
});
