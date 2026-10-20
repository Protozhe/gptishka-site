import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const read = name => fs.readFileSync(new URL(name, import.meta.url), "utf8");
function functions(text) {
  const source = ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true);
  const result = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) result.set(node.name.text, node.getText(source));
    if (ts.isMethodDeclaration(node) && node.name?.getText(source) === "storeActivationClientToken") result.set("storeActivationClientToken", "async function " + node.getText(source).replace(/^async\s+/, ""));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
const helper = functions(read("../apps/admin-backend/src/modules/orders/external-codex.ts"));
const delivery = functions(read("../apps/admin-backend/src/modules/orders/delivery.service.ts"));
const service = functions(read("../apps/admin-backend/src/modules/orders/orders.service.ts"));
const bot = functions(read("../ops/telegram-monitor-bot/worker.mjs"));
let order, stored, reservations = 0, providerCalls = 0, wrongToken = false, accountPlan = "free";
class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
const context = vm.createContext({
  assertOrderTokenAccess: async () => order,
  isVerificationSupportProduct: () => false, isDevinProductSlug: () => false,
  resolveTokenActivationFlowForProduct: () => "chatgpt_token", isSupportActivationFlow: () => false, isSupportLikeDeliveryType: () => false,
  resolveActivationPoolProductKeyForOrder: () => order.items[0].product.slug,
  exports: {}, console: { info() {}, warn() {} }, AppError,
  CHATGPT_PLUS_PRODUCT_KEY: "chatgpt-plus-1",
  OrderStatus: { PAID: "PAID" }, PaymentStatus: { SUCCESS: "SUCCESS" },
  prisma: { order: { findUnique: async () => order } },
  normalizeActivationSiteUrl: value => String(value || "").replace(/\/+$/, ""),
  readActivationSiteUrlFromOrderDetails: details => details?.selection?.serverActivationSiteUrl || "",
  resolveOrderDeliveryType: () => "activation", resolveVpnProvisionPayload: () => null,
  canonicalProductKey: value => value, resolveProductPoolBaseKey: value => value.slug,
  isTelegramOrderEmail: () => false, isMidjourneyProductSlug: () => false, isSunoPaymentLinkOrder: () => false,
  activationStore: {
    ensure() {}, findByOrderId: () => stored,
    upsert(value) { stored = value; },
    async reserveCdkRecordForOrder() { reservations++; return { code: "legacy-key", activationSiteUrl: "https://aiee.fun" }; },
  },
  MAX_CLIENT_TOKEN_LENGTH: 500000, MAX_ACTIVATION_START_ATTEMPTS: 3, env: { ACTIVATION_PROVIDER: "chongzhi" },
  ordersService: { getActivation: async () => ({ productSlug: order.items[0].product.slug }) },
  getOrderWithFirstItem: async () => order, assertTokenActivationDeliveryMode() {},
  ensureActivationRecordForTokenFlow: async () => stored,
  parseClientTokenInput: raw => ({ raw, extracted: "fixture-session", json: { sessionToken: "fixture-session" } }),
  resolveChatGptPlanType: () => accountPlan,
  isCodexCreditsProductKey: value => /^codex-(250|500|1000)$/.test(value), validateAieeSessionJson: () => null,
  isSupportTokenActivationMode: () => false,
  buildStoredClientTokenPatch: () => ({ clientTokenCiphertext: "encrypted-fixture", clientTokenStoredAt: "fixture" }),
  normalizeActivationRecordForRead: value => value, buildTokenMeta: () => ({ fingerprint: "same" }),
  isTokenBoundToAnotherFingerprint: () => wrongToken,
  async startOutstockTaskWithRetry() { providerCalls++; throw Error("unexpected provider call"); },
});
for (const [table, names] of [
  [helper, ["resolveExternalCodexOwner"]],
  [delivery, ["hasTrustedPaidPayment", "resolveActivationKeyPoolProductKey", "deliverProduct"]],
  [service, ["startActivationUnsafe", "storeActivationClientToken"]],
  [bot, ["activationState", "requiresActivationKey"]],
]) for (const name of names) vm.runInContext(ts.transpileModule(table.get(name), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);

function reset(packageSize, site = "https://zovocard.com") {
  stored = null; reservations = providerCalls = 0; wrongToken = false;
  order = { id: "fixture", email: "fixture@example.invalid", source: "site", status: "PAID", paymentMethod: "pally",
    payments: [{ status: "SUCCESS", provider: "pally" }], orderDetails: { selection: { serverActivationSiteUrl: site } },
    items: [{ product: { slug: `codex-${packageSize}`, id: "fixture-product", tags: [] } }] };
}
for (const packageSize of [250, 1000]) {
  reset(packageSize);
  await context.deliverProduct(order);
  assert.equal(reservations, 0);
  assert.equal(stored.status, "issued", "Keep the session form available before the first token");
  assert.equal(stored.externalFulfillmentOwner, `pulse-site${packageSize}-v1`);
  assert.equal(context.requiresActivationKey(stored), false);
  await context.startActivationUnsafe(order.id, '{"fixture":true}');
  assert.equal(stored.clientTokenCiphertext, "encrypted-fixture");
  assert.equal(stored.status, "processing");
  await context.startActivationUnsafe(order.id, '{"fixture":true}');
  assert.equal(stored.attempts, 0);
  assert.equal(reservations, 0);
  assert.equal(providerCalls, 0);
  stored.lastProviderPayload = { source: "diagnostic-overwrite" };
  assert.equal(context.requiresActivationKey(stored), false);
  const before = JSON.stringify(stored); wrongToken = true;
  await assert.rejects(context.startActivationUnsafe(order.id, '{"fixture":true}'), e => e.status === 409);
  assert.equal(JSON.stringify(stored), before);
}
reset(250, "https://aiee.fun");
for (const size of ["go", 5, 20, 25]) {
  reset(250);
  order.items[0].product.slug = size === "go" ? "chatgpt-go-1" : `chatgpt-pro-${size}x-1`;
  await context.deliverProduct(order);
  assert.equal(stored.externalFulfillmentOwner, size === "go" ? "pulse-sitego-v1" : size === 25 ? "pulse-sitepro500-v1" : `pulse-sitepro${size}x-v1`);
  assert.equal(stored.status, "issued");
  assert.equal(context.requiresActivationKey(stored), false);
  await context.startActivationUnsafe(order.id, '{"fixture":true}');
  await context.startActivationUnsafe(order.id, '{"fixture":true}');
  assert.equal(stored.status, "processing");
  assert.equal(stored.attempts, 0);
  assert.equal(reservations, 0);
  assert.equal(providerCalls, 0);
  const before = JSON.stringify(stored); wrongToken = true;
  await assert.rejects(context.startActivationUnsafe(order.id, '{"fixture":true}'), e => e.status === 409);
  assert.equal(JSON.stringify(stored), before);
  assert.equal(context.resolveExternalCodexOwner({ source: "site", productKey: `chatgpt-pro-${size}x-1-month-login`,
    activationSiteUrl: "https://zovocard.com" }), null);
  for (const record of [{cdk: "old"}, {taskId: "old"}, {attempts: 1}]) {
    assert.equal(context.resolveExternalCodexOwner({ source: "site", productKey: order.items[0].product.slug,
      activationSiteUrl: "https://zovocard.com", record }), null);
  }
}
reset(250, "https://aiee.fun");
await context.deliverProduct(order);
assert.equal(reservations, 1, "Historical AIEE routing still allocates its own key");
assert.equal(stored.cdk, "legacy-key");
for (const record of [{cdk: "old-key"}, {taskId: "old-task"}, {attempts: 1}]) {
  assert.equal(context.resolveExternalCodexOwner({source: "site", productKey: "codex-250",
    activationSiteUrl: "https://zovocard.com", record}), null);
}
assert.equal(context.resolveExternalCodexOwner({source: "telegram", productKey: "codex-250",
  activationSiteUrl: "https://zovocard.com"}), null);
assert.equal(context.requiresActivationKey({productKey: "codex-250", status: "issued"}), true);
assert.equal(context.requiresActivationKey({productKey: "codex-250", status: "success"}), false);
reset(250); order.status = "PENDING";
await context.deliverProduct(order);
assert.equal(stored, null); assert.equal(reservations, 0);
console.log("External Codex: paid delivery, session persistence, binding, no CDK/provider retries, legacy routing and notification guards pass.");

reset(250, "https://vip.sxzfd.com");order.items[0].product.slug="chatgpt-plus-1";
await context.deliverProduct(order);
assert.equal(stored.status,"issued");assert.equal(reservations,0);
assert.equal(stored.externalFulfillmentOwner,undefined);
await context.startActivationUnsafe(order.id,'{"fixture":true}');
assert.equal(stored.externalFulfillmentOwner,"pulse-siteplus-v1");
assert.equal(stored.activationSiteUrl,"https://zovocard.com");
assert.equal(stored.status,"processing");assert.equal(context.requiresActivationKey(stored),false);
assert.equal(reservations,0);assert.equal(providerCalls,0);
const routeAt=stored.lastProviderPayload.routeAssignedAt;
await context.startActivationUnsafe(order.id,'{"fixture":true}');
assert.equal(stored.lastProviderPayload.routeAssignedAt,routeAt);
for(const plan of ["plus","go","pro",""]) {
 assert.equal(context.resolveExternalCodexOwner({source:"site",productKey:"chatgpt-plus-1",activationSiteUrl:"https://vip.sxzfd.com",accountPlan:plan}),null);
}
for(const record of [{cdk:"allocated"},{taskId:"already-started"},{attempts:1},{reservedCandidates:[{keyId:"allocated"}]}]) {
 assert.equal(context.resolveExternalCodexOwner({source:"site",productKey:"chatgpt-plus-1",activationSiteUrl:"",accountPlan:"free",record}),null);
}
assert.equal(context.resolveExternalCodexOwner({source:"telegram",productKey:"chatgpt-plus-1",activationSiteUrl:"",accountPlan:"free"}),null);

// Repeated form submissions must retain fulfillment ownership and key reservations.
const ownerBefore=stored.externalFulfillmentOwner;
const routeBefore=stored.lastProviderPayload.routeAssignedAt;
stored.reservedCandidates=[{keyId:"private-reservation",code:"fixture",activationSiteUrl:"https://vip.sxzfd.com"}];
stored.keyAllocationState="selected";stored.keyAllocationSite="https://vip.sxzfd.com";
await context.storeActivationClientToken(order.id,'{"fixture":true}');
assert.equal(stored.externalFulfillmentOwner,ownerBefore);
assert.equal(stored.lastProviderPayload.routeAssignedAt,routeBefore);
assert.equal(stored.reservedCandidates[0].keyId,"private-reservation");
assert.equal(stored.keyAllocationState,"selected");assert.equal(stored.keyAllocationSite,"https://vip.sxzfd.com");
assert.equal(stored.status,"processing");assert.equal(stored.clientTokenCiphertext,"encrypted-fixture");
