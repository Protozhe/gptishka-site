import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const text = fs.readFileSync(new URL("../apps/admin-backend/src/modules/orders/orders.service.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("orders.ts", text, ts.ScriptTarget.Latest, true);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
const fixture = {
  orderId: "fixture-order", productKey: "chatgpt-plus-1", cdk: "fixture-key",
  activationSiteUrl: "https://aiee.fun", status: "failed", verificationState: "failed",
  taskId: "reconcile-fixture", attempts: 3, tokenValidationAttempts: 19,
  lastProviderMessage: "Previous submission was not confirmed", reservedCandidates: [],
};
let stored, writes, reservations, providerCalls, wrongToken;
class AppError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const context = vm.createContext({
  AppError, MAX_CLIENT_TOKEN_LENGTH: 50000, MAX_ACTIVATION_START_ATTEMPTS: 3,
  CHATGPT_PLUS_PRODUCT_KEY: "chatgpt-plus-1", env: {ACTIVATION_PROVIDER: "chongzhi"},
  ordersService: {getActivation: async () => ({productSlug: "chatgpt-plus-1"})},
  assertTokenActivationDeliveryMode() {}, ensureActivationRecordForTokenFlow: async () => stored,
  parseClientTokenInput: raw => ({raw, extracted: "fixture-session", json: {account: {planType: "free"}}}),
  isCodexCreditsProductKey: () => false, isSupportTokenActivationMode: () => false,
  isIosProviderBase: () => false,
  buildStoredClientTokenPatch: () => ({clientTokenCiphertext: "fixture-encrypted"}),
  normalizeActivationRecordForRead: value => value, buildTokenMeta: () => ({}),
  isTokenBoundToAnotherFingerprint: () => wrongToken,
  canonicalProductKey: value => value,
  resolveChatGptPlusPool: () => ({siteUrl: "https://aiee.fun", planType: "free", forceOverwrite: false}),
  activationStore: {
    findByOrderId: () => stored,
    upsert(value) { writes++; stored = value; },
    async reserveCdkRecordForOrder() { reservations++; return {keyId: "fixture-new-key", code: "fixture-new-code"}; },
  },
  licenseService: {returnAssignedToAvailable: async () => true, returnAssignedValueToAvailable: async () => true},
  buildUpstreamUserCandidates: () => ["fixture-user"],
  async startOutstockTaskWithRetry() { providerCalls++; throw new Error("fixture-provider-reached"); },
});
for (const name of ["selectChatGptPlusCandidate", "startActivationUnsafe"]) {
  vm.runInContext(ts.transpileModule(functions.get(name), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
}
function reset(overrides = {}) {
  stored = structuredClone({...fixture, ...overrides});
  writes = reservations = providerCalls = 0; wrongToken = false;
  return structuredClone(stored);
}
const start = () => context.startActivationUnsafe(fixture.orderId, '{"fixture":true}');
function unchanged(before) {
  assert.deepEqual(stored, before);
  assert.equal(writes, 0, "Rejected or reused starts must not overwrite the activation record");
  assert.equal(reservations, 0, "Rejected or reused starts must not reserve another key");
  assert.equal(providerCalls, 0, "Rejected or reused starts must not submit another activation");
}
for (const overrides of [{}, {cdk: "", activationSiteUrl: ""}, {activationSiteUrl: "https://vip.sxzfd.com"}]) {
  const before = reset(overrides);
  await assert.rejects(start, error => error.status === 429);
  unchanged(before);
}
for (const overrides of [{status: "processing", verificationState: "pending"}, {status: "failed", verificationState: "pending"}]) {
  const before = reset(overrides);
  const result = await start();
  assert.equal(result.reused, true); assert.equal(result.taskId, before.taskId);
  unchanged(before);
}
for (const overrides of [{status: "success"}, {verificationState: "success"}]) {
  const before = reset(overrides);
  await assert.rejects(start, error => error.status === 409 && /completed/.test(error.message));
  unchanged(before);
}
const bound = reset(); wrongToken = true;
await assert.rejects(start, error => error.status === 409 && /another token/.test(error.message));
unchanged(bound);
reset({attempts: 2});
await assert.rejects(start, /fixture-provider-reached/);
assert.equal(providerCalls, 1, "A failed activation below the attempt limit must still allow a retry");
console.log("Activation attempt limits preserve provider state and keys; pending starts reuse their task and valid retries reach the provider.");
