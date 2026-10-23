import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import ts from "typescript";

const text = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const source = ts.createSourceFile("orders.ts", text, ts.ScriptTarget.Latest, true);
const functions = new Map(source.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, n.getText(source)]));
function load(context, names) {
  const ctx = vm.createContext(context);
  for (const name of names) vm.runInContext(ts.transpileModule(functions.get(name), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, ctx);
  return ctx;
}
const ios = value => String(value).includes("vip.sxzfd.com");
const timers = [];
const fakeTimer = (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; };
const clearTimer = t => { t.cleared = true; };
let requests = [];
const transport = load({
  env: { ACTIVATION_CHONGZHI_IP: "203.0.113.42" }, URL, Buffer,
  CHONGZHI_JSON_API_TIMEOUT_MS: 15000, CHONGZHI_SUBMIT_API_TIMEOUT_MS: 45000, IOS_SUBMIT_API_TIMEOUT_MS: 150000,
  isAieeProviderBase: () => false, isIosProviderBase: ios,
  buildActivationSiteEndpointUrl: (base, endpoint) => new URL(endpoint, base + "/").href,
  tryParseJson: raw => JSON.parse(raw), setTimeout: fakeTimer, clearTimeout: clearTimer,
  https: { request(options, callback) {
    const req = new EventEmitter(); req.setTimeout = ms => { req.timeout = ms; }; req.destroy = () => {};
    req.end = raw => {
      const payload = JSON.parse(raw); requests.push({ options, payload, timeout: req.timeout });
      queueMicrotask(() => {
        const response = new EventEmitter(); response.statusCode = 200; response.setEncoding = () => {};
        response.headers = { "set-cookie": payload.action === "verify_code" ? ["PHPSESSID=fixture-cookie; Secure; HttpOnly"] : [] };
        callback(response); response.emit("data", Buffer.from('{"success":true}')); response.emit("end");
      });
    };
    return req;
  } },
}, ["callChongzhiJsonApi"]);
const session = { cookies: new Map() };
await transport.callChongzhiJsonApi("https://vip.sxzfd.com", "verify_code", { cdk: "fixture" }, session);
await transport.callChongzhiJsonApi("https://vip.sxzfd.com", "submit_recharge", { json_token: "fixture-sensitive" }, session);
assert.equal(requests[0].timeout, 15000); assert.equal(requests[1].timeout, 150000);
assert.equal(requests[1].options.hostname, "203.0.113.42", "Preserve the working production route");
assert.equal(requests[1].options.servername, "vip.sxzfd.com", "Keep certificate hostname verification");
assert.equal(requests[1].options.headers.Cookie, "PHPSESSID=fixture-cookie", "Verify and submit must share supplier cookies in RAM");
assert.equal(requests[1].options.rejectUnauthorized, undefined, "Do not disable TLS verification");
assert.ok(!JSON.stringify(requests[1].options).includes("fixture-sensitive"), "Credentials belong only in the request body");

// Run the actual JSON/retry flow. All provider traffic below is a deterministic
// fixture, including transport failures and late upstream responses.
let calls, mode, resolveLate, rejectLate, claimed, queryCount;
const flow = load({
  env: {}, Date, Math, Map, setTimeout: fakeTimer, clearTimeout: clearTimer,
  IOS_SUBMIT_CLIENT_WAIT_MS: 20000, ACTIVATION_OUTSTOCK_MAX_RETRIES: 3,
  ACTIVATION_OUTSTOCK_RETRY_DELAY_MS: 2000,
  isAieeProviderBase: () => false, isIosProviderBase: ios,
  buildActivationSiteEndpointUrl: (base, endpoint) => new URL(endpoint, base + "/").href,
  tryParseUrl: raw => new URL(raw), sleep: async () => {},
  async callChongzhiJsonApi(base, action, payload) {
    calls.push({ action, payload });
    if (action === "query_code") {
      queryCount++;
      if (queryCount > 1 && mode === "lost-pending") return { status: 200, json: { success: true, status: "locked", recharge_status: "pending", order_id: "provider-1" } };
      if (queryCount > 1 && mode === "lost-completed") return { status: 200, json: { success: true, status: "used", recharge_status: "success", order_id: "provider-1" } };
      return { status: 200, json: { success: true, status: "available", recharge_status: "available" } };
    }
    if (action === "verify_code") return { status: 200, json: { success: true, status: "active", sid: "fixture-sid", can_submit: mode !== "invalid-key" } };
    assert.equal(action, "submit_recharge");
    assert.equal(claimed, 1, "A durable dispatch must be recorded before the POST");
    assert.equal(payload.force_overwrite, true); assert.equal(payload.confirm_overwrite, true);
    if (mode === "slow") return new Promise((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
    if (mode.startsWith("lost-")) throw new Error("fixture transport failure");
    if (mode === "http-500") return { status: 500, json: { success: false } };
    if (mode === "accepted") return { status: 200, json: { success: true, order_id: "provider-1" } };
    return { status: 200, json: { success: true, recharge_status: "success", order_id: "provider-1" } };
  },
}, ["isChongzhiCodeUsed", "recoverCompletedChongzhiJsonTask", "waitForIosSubmitResponse", "startChongzhiJsonTask", "startChongzhiTaskWithRetry"]);
function start(which) {
  mode = which; calls = []; claimed = 0; queryCount = 0; timers.length = 0;
  return flow.startChongzhiTaskWithRetry({ cdk: "fixture", deviceId: "web", userCandidates: ['{"account":{"planType":"plus"}}'], forceOverwrite: true, beforeSubmit() { claimed++; } }, { baseUrl: "https://vip.sxzfd.com" });
}
let result = await start("success"); assert.equal(result.immediateSuccess, true);
assert.equal(calls.filter(c => c.action === "submit_recharge").length, 1);
result = await start("accepted"); assert.equal(result.immediateSuccess, false, "Acceptance alone must not claim success");
result = await start("invalid-key"); assert.equal(result.ok, false); assert.equal(claimed, 0);
assert.equal(calls.filter(c => c.action === "submit_recharge").length, 0);
for (const which of ["lost-pending", "lost-completed", "http-500"]) {
  result = await start(which);
  assert.equal(calls.filter(c => c.action === "submit_recharge").length, 1, `${which}: never replay an uncertain POST`);
  assert.equal(result.immediateSuccess, which === "lost-completed");
  if (which === "lost-pending") assert.equal(result.taskId, "provider-1");
  if (which === "http-500") assert.match(result.taskId, /^reconcile-/);
}
for (const lateFailure of [false, true]) {
  const pending = start("slow");
  for (let i = 0; i < 10 && !resolveLate; i++) await Promise.resolve();
  const timer = timers.find(t => t.ms === 20000 && !t.cleared); assert.ok(timer);
  timer.fn(); result = await pending;
  assert.equal(result.immediateSuccess, false); assert.match(result.taskId, /^reconcile-/);
  if (lateFailure) rejectLate(new Error("late transport error"));
  else resolveLate({ status: 200, json: { success: true, recharge_status: "success" } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.filter(c => c.action === "submit_recharge").length, 1);
  resolveLate = undefined; rejectLate = undefined;
}

// Process loss after dispatch: the persisted pending state must stop another
// request before it reserves a key, resets the task or reaches the supplier.
class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
let stored, posts, reserves, outcome;
const state = load({
  AppError, Date, Math, MAX_CLIENT_TOKEN_LENGTH: 500000, MAX_ACTIVATION_START_ATTEMPTS: 3,
  CHATGPT_PLUS_PRODUCT_KEY: "chatgpt-plus-1", env: {},
  ordersService: { getActivation: async () => ({ productSlug: "chatgpt-plus-1" }) },
  assertTokenActivationDeliveryMode() {}, ensureActivationRecordForTokenFlow: async () => stored,
  parseClientTokenInput: raw => ({ raw, extracted: "fixture-session", json: { account: { planType: "plus" } } }),
  isCodexCreditsProductKey: () => false, isSupportTokenActivationMode: () => false, isIosProviderBase: ios,
  buildStoredClientTokenPatch: () => ({ clientTokenCiphertext: "fixture-encrypted" }),
  normalizeActivationRecordForRead: value => value, buildTokenMeta: () => ({ fingerprint: "fixture" }),
  isTokenBoundToAnotherFingerprint: () => false, canonicalProductKey: value => value,
  resolveChatGptPlusPool: () => ({ siteUrl: "https://vip.sxzfd.com", planType: "plus", forceOverwrite: true }),
  activationStore: { findByOrderId: () => stored, upsert: value => { stored = value; }, reserveCdkRecordForOrder: async () => { reserves++; throw Error("unexpected key allocation"); } },
  licenseService: {}, buildUpstreamUserCandidates: () => ["fixture-session"],
  async startOutstockTaskWithRetry(input) {
    input.beforeSubmit(); posts++;
    assert.equal(stored.status, "processing"); assert.equal(stored.attempts, 1); assert.match(stored.taskId, /^reconcile-/);
    if (outcome === "crash") throw Error("fixture process loss");
    stored = { ...stored, status: "success", verificationState: "success", taskId: "provider-1" };
    return { ok: true, taskId: "late-pending", immediateSuccess: false };
  },
}, ["selectChatGptPlusCandidate", "startActivationUnsafe"]);
function reset() { stored = { orderId: "fixture-order", productKey: "chatgpt-plus-1", cdk: "fixture-key", activationSiteUrl: "https://vip.sxzfd.com", status: "issued", attempts: 0, reservedCandidates: [] }; posts = reserves = 0; }
reset(); outcome = "crash";
await assert.rejects(state.startActivationUnsafe("fixture-order", '{"fixture":true}'), /fixture process loss/);
const taskId = stored.taskId;
result = await state.startActivationUnsafe("fixture-order", '{"fixture":true}');
assert.equal(result.reused, true); assert.equal(result.taskId, taskId); assert.equal(posts, 1); assert.equal(reserves, 0);
reset(); outcome = "late-response";
await state.startActivationUnsafe("fixture-order", '{"fixture":true}');
assert.equal(stored.status, "success", "A late submit response must not overwrite scheduler-confirmed success");

// Reconciliation grace applies only to IOS; confirmation requires a successful
// recharge, not merely the supplier marking a key used after a failed attempt.
const now = 1792758000000;
const status = load({
  normalizeActivationRecordForRead: value => value,
  Date: class extends Date { static now() { return now; } },
  IOS_SUBMISSION_RECONCILE_MS: 900000,
  isAieeProviderBase: value => String(value).includes("aiee.fun"), isIosProviderBase: ios,
  activationStore: { findByOrderId: () => stored, upsert: value => { stored = value; } },
  buildStoredClientTokenPatch: () => ({ clientTokenCiphertext: null }),
}, ["isChongzhiCodeUsed", "updateActivationFromChongzhiCodePayload"]);
const available = { status: 200, json: { success: true, status: "available", recharge_status: "available" } };
function record(site, minutes) { stored = { orderId: "fixture-order", cdk: "fixture", activationSiteUrl: site, taskId: `reconcile-${now - minutes * 60000}-fixture`, status: "processing", verificationState: "pending" }; }
record("https://vip.sxzfd.com", 6); status.updateActivationFromChongzhiCodePayload("fixture-order", available); assert.equal(stored.status, "processing");
record("https://vip.sxzfd.com", 16); status.updateActivationFromChongzhiCodePayload("fixture-order", available); assert.equal(stored.status, "failed");
record("https://aiee.fun", 6); status.updateActivationFromChongzhiCodePayload("fixture-order", available); assert.equal(stored.status, "failed");
record("https://vip.sxzfd.com", 1);
status.updateActivationFromChongzhiCodePayload("fixture-order", { status: 200, json: { success: true, status: "used", recharge_status: "failed" } });
assert.equal(stored.status, "failed");
record("https://vip.sxzfd.com", 1);
status.updateActivationFromChongzhiCodePayload("fixture-order", { status: 200, json: { success: true, status: "used", recharge_status: "success", order_id: "provider-1" } });
assert.equal(stored.status, "success"); assert.equal(stored.taskId, "provider-1"); assert.equal(stored.clientTokenCiphertext, null);
console.log("IOS renewals: consent, route/TLS, in-memory cookies, asynchronous response, one-shot dispatch, restart safety, lost replies and read-only confirmation passed.");
