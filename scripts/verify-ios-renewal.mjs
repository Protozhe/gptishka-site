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
const sessionFixture = {
  accessToken: "fixture-access", sessionToken: "fixture-session",
  account: { id: "fixture-account", planType: "plus" }, user: { email: "fixture@example.invalid" },
  expires: "2099-01-01T00:00:00Z", authProvider: "fixture", futureAuthField: { keep: true },
  WARNING_BANNER: "fixture-warning", statsigContext: { experiment: "fixture" },
  marketingEligibility: { content: "x".repeat(29000) },
};
const originalSession = JSON.stringify(sessionFixture);
const expectedSession = Object.fromEntries(Object.entries(sessionFixture).filter(([k]) => !["WARNING_BANNER", "statsigContext", "marketingEligibility"].includes(k)));
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
    assert.equal(payload.force_overwrite, true);
    if (ios(base)) {
      assert.equal(payload.confirm_overwrite, true);
      assert.deepEqual(JSON.parse(payload.json_token), expectedSession, "Keep every auth/account field while omitting unrelated telemetry from IOS POST");
      assert.ok(payload.json_token.length < 1000, "Marketing bloat must not reach the supplier POST");
    } else {
      assert.equal(payload.json_token, originalSession, "Other suppliers retain their existing session contract");
    }
    if (mode === "slow") return new Promise((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
    if (mode.startsWith("lost-")) throw new Error("fixture transport failure");
    if (mode === "http-500") return { status: 500, json: { success: false } };
    if (mode === "accepted") return { status: 200, json: { success: true, order_id: "provider-1" } };
    return { status: 200, json: { success: true, recharge_status: "success", order_id: "provider-1" } };
  },
}, ["isChongzhiCodeUsed", "recoverCompletedChongzhiJsonTask", "waitForIosSubmitResponse", "compactIosSessionToken", "startChongzhiJsonTask", "startChongzhiTaskWithRetry"]);
function start(which) {
  mode = which; calls = []; claimed = 0; queryCount = 0; timers.length = 0;
  return flow.startChongzhiTaskWithRetry({ cdk: "fixture", deviceId: "web", userCandidates: [originalSession], forceOverwrite: true, beforeSubmit() { claimed++; } }, { baseUrl: "https://vip.sxzfd.com" });
}
let result = await start("success"); assert.equal(result.immediateSuccess, true);
assert.equal(calls.filter(c => c.action === "submit_recharge").length, 1);
assert.equal(JSON.stringify(sessionFixture), originalSession, "Request compaction cannot mutate the original session");
assert.equal(flow.compactIosSessionToken("not-json"), "not-json");
assert.equal(flow.compactIosSessionToken("[]"), "[]");
calls = []; claimed = 0;
await flow.startChongzhiJsonTask({ cdk: "fixture", userCandidates: [originalSession], forceOverwrite: true, beforeSubmit() { claimed++; } }, "https://compatible.example.invalid");
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
// The client wait may finish before the original request. Observe that same
// request exactly once, including a late rejection, without starting a new one.
for (const rejected of [false, true]) {
  const observed=[];let complete,fail;
  const response=new Promise((resolve,reject)=>{complete=resolve;fail=reject});
  timers.length=0;
  const pending=flow.waitForIosSubmitResponse(response,r=>observed.push(r));
  timers.find(t=>t.ms===20000&&!t.cleared).fn();
  assert.equal((await pending).status,202);assert.equal(observed.length,0);
  if(rejected)fail(Error('isolated late failure'));
  else complete({status:200,json:{success:false,code:'overwrite_consent_required'},raw:'fixture-sensitive-response'});
  await Promise.resolve();await Promise.resolve();
  assert.equal(observed.length,1);assert.equal(observed[0]?.json?.code,rejected?undefined:'overwrite_consent_required');
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
    if (outcome === "pending") return {ok:true,taskId:`reconcile-${Date.now()}-pending`,immediateSuccess:false,providerPayload:{recharge:{pending:true}}};
    stored = { ...stored, status: "success", verificationState: "success", taskId: "provider-1" };
    return { ok: true, taskId: "late-pending", immediateSuccess: false };
  },
}, ["isAisouGrokProduct", "selectChatGptPlusCandidate", "startActivationUnsafe"]);
function reset() { stored = { orderId: "fixture-order", productKey: "chatgpt-plus-1", cdk: "fixture-key", activationSiteUrl: "https://vip.sxzfd.com", status: "issued", attempts: 0, reservedCandidates: [] }; posts = reserves = 0; }
reset(); outcome = "crash";
await assert.rejects(state.startActivationUnsafe("fixture-order", '{"fixture":true}'), /fixture process loss/);
const taskId = stored.taskId;
result = await state.startActivationUnsafe("fixture-order", '{"fixture":true}');
assert.equal(result.reused, true); assert.equal(result.taskId, taskId); assert.equal(posts, 1); assert.equal(reserves, 0);
reset(); outcome = "late-response";
await state.startActivationUnsafe("fixture-order", '{"fixture":true}');
assert.equal(stored.status, "success", "A late submit response must not overwrite scheduler-confirmed success");
reset();outcome='pending';
await state.startActivationUnsafe('fixture-order','{"fixture":true}');
assert.equal(stored.lastProviderPayload.submissionDiagnostics.phase,'submit_recharge');
assert.equal(stored.lastProviderPayload.submissionDiagnostics.forceOverwrite,true);
assert.match(stored.lastProviderPayload.submissionDiagnostics.dispatchTask,/^reconcile-/);
stored={...stored,status:'failed',verificationState:'failed',lastProviderPayload:{recharge_status:'available'}};
const historicalTask=stored.taskId;
result=await state.startActivationUnsafe('fixture-order','{"fixture":true}');
assert.equal(result.reused,true);assert.equal(result.taskId,historicalTask);assert.equal(posts,1,'Legacy lost diagnostics cannot permit a second dispatch after the review deadline');
const serviceDeclaration=source.statements.filter(ts.isVariableStatement).flatMap(n=>n.declarationList.declarations).find(n=>n.name.getText(source)==='ordersService');
const restartMethod=serviceDeclaration.initializer.properties.find(n=>n.name?.getText(source)==='restartActivationWithNewKey');
state.withActivationOrderLock=async(id,job)=>job();state.assertPaidOrderAccess=async()=>({id:'fixture-order'});
vm.runInContext(ts.transpileModule('this.keyRetry={getActivation:ordersService.getActivation,'+restartMethod.getText(source)+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,state);
await assert.rejects(state.keyRetry.restartActivationWithNewKey('fixture-order','{"fixture":true}'),/повторная отправка и смена ключа заблокированы/);
assert.equal(posts,1);assert.equal(reserves,0,'The separate change-key endpoint must enforce the same historical dispatch guard');

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
}, ["isChongzhiCodeUsed", "updateActivationFromChongzhiCodePayload", "recordIosSubmitResult"]);
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
const confirmed=JSON.stringify(stored);
status.updateActivationFromChongzhiCodePayload('fixture-order',available);
assert.equal(JSON.stringify(stored),confirmed,'A late available response cannot undo confirmed IOS renewal');
record('https://vip.sxzfd.com',16);stored.attempts=1;stored.lastProviderPayload={submissionDiagnostics:{phase:'submit_recharge',dispatchTask:'original-dispatch'}};
status.recordIosSubmitResult('fixture-order','fixture','original-dispatch',{status:200,json:{success:false,code:'overwrite_consent_required',message:'fixture-sensitive-email@example.invalid',sid:'fixture-secret'}});
assert.equal(stored.lastProviderPayload.iosSubmitResult.code,'overwrite_consent_required');
assert.ok(!JSON.stringify(stored).includes('fixture-sensitive'));assert.ok(!JSON.stringify(stored).includes('fixture-secret'));
status.updateActivationFromChongzhiCodePayload('fixture-order',available);
assert.equal(stored.lastProviderPayload.iosSubmitResult.outcome,'rejected');
const beforeWrong=JSON.stringify(stored);
status.recordIosSubmitResult('fixture-order','another-key','original-dispatch',{status:200,json:{success:true,recharge_status:'success'}});
status.recordIosSubmitResult('fixture-order','fixture','another-dispatch',{status:200,json:{success:true,recharge_status:'success'}});
assert.equal(JSON.stringify(stored),beforeWrong);
status.recordIosSubmitResult('fixture-order','fixture','original-dispatch',{status:200,json:{success:true,recharge_status:'success',order_id:'provider-late'}});
assert.equal(stored.status,'success');assert.equal(stored.taskId,'provider-late');
// A review alert must retain query-only eligibility, including older IOS
// records whose synthetic task survived but whose diagnostic marker was lost.
const scheduler=ts.createSourceFile('scheduler.ts',fs.readFileSync('apps/admin-backend/src/modules/orders/activation-status.scheduler.ts','utf8'),ts.ScriptTarget.Latest,true);
const select=scheduler.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='processingRecords');
const watch=vm.createContext({Date,MAX_RECORD_AGE_MS:7*86400000,MAX_RECORDS_PER_CYCLE:24,activationStore:{list:()=>[stored]}});
vm.runInContext(ts.transpileModule(select.getText(scheduler),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,watch);
stored={orderId:'fixture',activationSiteUrl:'https://vip.sxzfd.com',cdk:'fixture',attempts:1,status:'failed',verificationState:'failed',taskId:`reconcile-${Date.now()-16*60000}-fixture`,issuedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastProviderPayload:{recharge_status:'available'}};
assert.equal(watch.processingRecords().length,1);
const reviewed={...stored};
for(const change of [{attempts:0},{status:'success',verificationState:'success'},{taskId:'manual-fixture'},{issuedAt:new Date(Date.now()-8*86400000).toISOString()},{lastProviderPayload:{recharge_status:'failed'}}]){stored={...reviewed,...change};assert.equal(watch.processingRecords().length,0)}
console.log("IOS renewals: consent, route/TLS, in-memory cookies, asynchronous response, one-shot dispatch, restart safety, lost replies and read-only confirmation passed.");
