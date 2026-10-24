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
    if (ts.isMethodDeclaration(node) && ["storeActivationClientToken", "getActivationProof"].includes(node.name?.getText(source))) result.set(node.name.getText(source), "async function " + node.getText(source).replace(/^async\s+/, ""));
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
  CLAUDE_ZOVO_OWNER:"website-claude-zovo-v1",isClaudeZovoProduct:()=>false,
  isAisouGrokProduct:()=>false,
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
  [service, ["startActivationUnsafe", "storeActivationClientToken", "getActivationProof"]],
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
for (const packageSize of [250, 500, 1000]) {
  reset(packageSize);
  // Existing card-worker jobs remain inspectable; this must not authorize a new one.
  stored={orderId:order.id,productKey:`codex-${packageSize}`,externalFulfillmentOwner:`pulse-site${packageSize}-v1`,status:"issued",attempts:0};
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
  assert.equal(stored.externalFulfillmentOwner, undefined, "Do not choose the card route before seeing planType");
  assert.equal(stored.status, "issued");
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
for(const size of [250,500,1000]) {
  reset(size);await context.deliverProduct(order);
  assert.equal(stored.externalFulfillmentOwner,undefined,"New Codex never enters Zovo");
  assert.equal(reservations,0,"Wait for the account session before selecting or buying its denomination");
  assert.equal(stored.activationSiteUrl,'https://aiee.fun');
  assert.equal(context.requiresActivationKey(stored),false,'No empty-pool warning while waiting for the customer');
  assert.equal(context.resolveExternalCodexOwner({source:"site",productKey:`codex-${size}`,activationSiteUrl:"https://zovocard.com",accountPlan:"plus"}),null);
}
for(const slug of ['chatgpt-plus-1','chatgpt-go-1','chatgpt-pro-5x-1','chatgpt-pro-20x-1','chatgpt-pro-25x-1']) {
 for(const plan of ['plus','go','prolite','prolight','pro','pro_5x','unknown','']) assert.equal(context.resolveExternalCodexOwner({source:'site',productKey:slug,activationSiteUrl:'https://zovocard.com',accountPlan:plan}),null);
 assert.ok(context.resolveExternalCodexOwner({source:'site',productKey:slug,activationSiteUrl:'',accountPlan:'free'}));
}
reset(250, "https://aiee.fun");
stored={orderId:order.id,productKey:'codex-250',cdk:'legacy-key',status:'issued',attempts:0};
await context.deliverProduct(order);
assert.equal(reservations, 0, "Historical AIEE routing preserves its existing key");
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

// Force-check must not overwrite externally owned progress or query CDK APIs.
let proofErrors=0, proofChecks=0;
Object.assign(context, {
  assertOrderId() {}, maskEmail: value => value,
  deriveActivationCertainty: () => ({code:"ACTIVATION_PROCESSING"}),
  isChongzhiActivationRecord: () => false,
  deriveActivationProviderProductCandidates: () => ["fixture"],
  async fetchActivationCdkCheckPayload() { proofChecks++;return {productId:"fixture",payload:{}}; },
  updateActivationFromProviderCdkPayload() {},
  updateActivationProviderCheckError() { proofErrors++;stored.lastProviderMessage="Activation key is missing"; },
  hasStoredClientToken: record => Boolean(record.clientTokenCiphertext),
});
for(const [slug,owner] of [
  ["chatgpt-plus-1","pulse-siteplus-v1"], ["chatgpt-go-1","pulse-sitego-v1"],
  ["codex-250","pulse-site250-v1"], ["codex-500","pulse-site500-v1"], ["codex-1000","pulse-site1000-v1"],
  ["chatgpt-pro-5x-1","pulse-sitepro5x-v1"], ["chatgpt-pro-20x-1","pulse-sitepro20x-v1"],
  ["chatgpt-pro-25x-1","pulse-sitepro500-v1"],
]) {
  reset(250);order.items[0].product.slug=slug;
  stored={orderId:order.id,productKey:slug,externalFulfillmentOwner:owner,activationSiteUrl:"https://zovocard.com",status:"processing",verificationState:"pending",attempts:0,lastProviderMessage:"Подписка активирована; подтверждаем отключение автопродления.",lastProviderPayload:{source:"diagnostic-overwrite"}};
  const before=JSON.stringify(stored);
  const proof=await context.getActivationProof(order.id,{forceCheck:true});
  assert.equal(JSON.stringify(stored),before,slug+": status refresh preserves worker state");
  assert.equal(proof.activation.status,"processing");assert.equal(proofChecks,0);assert.equal(proofErrors,0);
}
reset(250,"https://aiee.fun");stored={orderId:order.id,productKey:"codex-250",status:"issued",cdk:"legacy-key",attempts:0};
await context.getActivationProof(order.id,{forceCheck:true});assert.equal(proofChecks,1,"Legacy CDK orders still query their own provider");
stored={orderId:order.id,productKey:"chatgpt-plus-1",status:"issued",attempts:0};order.items[0].product.slug="chatgpt-plus-1";
await context.getActivationProof(order.id,{forceCheck:true});assert.equal(proofErrors,1,"Unowned missing-key failures remain visible");
console.log("External fulfillment proof refresh: all owned product routes preserve progress; legacy provider checks remain active.");

reset(500,"https://aiee.fun");await context.deliverProduct(order);assert.equal(reservations,0);assert.equal(stored.activationSiteUrl,"https://aiee.fun");assert.equal(stored.keyAllocationState,"awaiting_session");
