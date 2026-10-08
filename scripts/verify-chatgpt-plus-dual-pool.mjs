import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const service = fs.readFileSync("apps/admin-backend/src/modules/orders/orders.service.ts", "utf8");
const delivery = fs.readFileSync("apps/admin-backend/src/modules/orders/delivery.service.ts", "utf8");
const activationStore = fs.readFileSync("apps/admin-backend/src/modules/orders/activation.store.ts", "utf8");

assert.match(delivery, /CHATGPT_PLUS_IOS_SITE_URL[\s\S]*CHATGPT_PLUS_FREE_SITE_URL/, "Both ChatGPT Plus pools must be declared");
assert.match(delivery, /reservedCandidates:\s*\[\]/, "New paid orders must wait for session JSON without reserving two keys");
assert.match(activationStore, /reservedCandidates\?:\s*Array/, "Activation records must support two reserved candidates");
assert.match(service, /planType === "free"[\s\S]*CHATGPT_PLUS_FREE_SITE_URL/, "Free accounts must select GPLUS/AIEE");
assert.match(service, /\["go", "plus", "prolight", "pro"\][\s\S]*CHATGPT_PLUS_IOS_SITE_URL/, "Paid plans must select the IOS pool");
assert.match(service, /force_overwrite:\s*Boolean\(input\.forceOverwrite\)/, "Paid-plan renewals must enable force overwrite");
assert.match(service, /status === 0 \|\| status >= 500/, "Network failures must be retryable");
assert.match(service, /jsonApiAttempts = Math\.min\(3, ACTIVATION_OUTSTOCK_MAX_RETRIES\)/, "Provider JSON calls must retry transient failures");
assert.match(service, /isIosProviderBase\(input\.activationSiteUrl\)/, "IOS orders must route independently of the global provider switch");

// Execute the actual allocation code with in-memory stores. No real account,
// payment, provider request or production key is touched by this verification.
const planFunctions = service.slice(service.indexOf("function resolveChatGptPlanType("), service.indexOf("function publicActivationMessage("))
  .replaceAll(": { json: Record<string, unknown> | null }", "")
  .replaceAll(" as Record<string, unknown>", "");
const selectFunction = service.slice(service.indexOf("async function selectChatGptPlusCandidate("), service.indexOf("async function startActivationUnsafe("))
  .replace("stored: ActivationRecord", "stored")
  .replace("tokenInfo: { json: Record<string, unknown> | null }", "tokenInfo")
  .replace("const interim: ActivationRecord", "const interim")
  .replace('const unreleased: NonNullable<ActivationRecord["reservedCandidates"]>', "const unreleased")
  .replace("const selectedRecord: ActivationRecord", "const selectedRecord");
const trustedFunction = delivery.slice(delivery.indexOf("export function hasTrustedPaidPayment("), delivery.indexOf("export async function deliverProduct("))
  .replace("export function", "function").replaceAll(": any", "");
const deliverFunction = delivery.slice(delivery.indexOf("export async function deliverProduct("), delivery.indexOf("function resolveActivationKeyPoolProductKey("))
  .replace("export async function", "async function").replace("order: Order", "order");
const writes = [], reservations = [], releases = [];
let available = true, existing = null, fullOrder;
class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
const context = vm.createContext({
  AppError, console: {info() {}, warn() {}},
  CHATGPT_PLUS_PRODUCT_KEY: "chatgpt-plus-1",
  CHATGPT_PLUS_FREE_SITE_URL: "https://aiee.fun", CHATGPT_PLUS_IOS_SITE_URL: "https://vip.sxzfd.com",
  OrderStatus: {PAID: "PAID"}, PaymentStatus: {SUCCESS: "SUCCESS"},
  canonicalProductKey: value => value,
  activationStore: {
    ensure() {}, findByOrderId: () => existing,
    upsert: value => writes.push(value),
    async reserveCdkRecordForOrder(request) {
      reservations.push(request);
      return available ? {keyId: "test-key", code: "test-code", activationSiteUrl: request.activationSiteUrl} : null;
    },
  },
  licenseService: {
    async returnAssignedToAvailable(key, order) { releases.push({key, order}); return true; },
    async returnAssignedValueToAvailable(_pool, code, order) { releases.push({code, order}); return true; },
  },
  prisma: {order: {findUnique: async () => fullOrder}},
  resolveOrderDeliveryType: () => "activation", resolveVpnProvisionPayload: () => null,
  resolveProductPoolBaseKey: () => "chatgpt-plus-1",
  resolveActivationKeyPoolProductKey: value => value,
  readActivationSiteUrlFromOrderDetails: () => "",
  isTelegramOrderEmail: () => false, isMidjourneyProductSlug: () => false, isSunoPaymentLinkOrder: () => false,
});
vm.runInContext(planFunctions + selectFunction + trustedFunction + deliverFunction, context);
const order = {id: "test-order", email: "test@example.com", status: "PAID", paymentMethod: "pally", payments: [{status: "SUCCESS", provider: "pally"}], items: [{product: {slug: "chatgpt-plus-1-month", tags: []}}]};
for (const invalid of [null, {...order, status: "PENDING"}, {...order, payments: []}, {...order, payments: [{status: "PENDING", provider: "pally"}]}, {...order, paymentMethod: "stub"}, {...order, payments: [{status: "SUCCESS", provider: "stub"}]}]) {
  context.order = invalid;
  assert.equal(vm.runInContext("hasTrustedPaidPayment(order)", context), false, "Untrusted payment must not deliver");
  fullOrder = invalid;
  context.inputOrder = order;
  await vm.runInContext("deliverProduct(inputOrder)", context);
  assert.equal(reservations.length, 0); assert.equal(writes.length, 0);
}
fullOrder = order; context.inputOrder = order;
await vm.runInContext("deliverProduct(inputOrder)", context);
assert.equal(reservations.length, 0, "Paid Plus delivery must reserve no key before session submission");
assert.equal(writes.at(-1).cdk, ""); assert.equal(writes.at(-1).reservedCandidates.length, 0);
const stored = {orderId: order.id, email: order.email, productKey: "chatgpt-plus-1", cdk: "", reservedCandidates: []};
for (const [plan, site, overwrite] of [["free", "https://aiee.fun", false], ["go", "https://vip.sxzfd.com", true], ["plus", "https://vip.sxzfd.com", true], ["pro_light", "https://vip.sxzfd.com", true], ["pro", "https://vip.sxzfd.com", true]]) {
  const before = reservations.length; context.stored = stored; context.token = {json: {account: {planType: plan}}};
  const result = await vm.runInContext("selectChatGptPlusCandidate(stored, token)", context);
  assert.equal(reservations.length, before + 1, `${plan}: reserve exactly one key`);
  assert.equal(reservations.at(-1).activationSiteUrl, site); assert.equal(result.forceOverwrite, overwrite);
  assert.equal(result.record.reservedCandidates.length, 0);
  context.stored = result.record;
  await vm.runInContext("selectChatGptPlusCandidate(stored, token)", context);
  assert.equal(reservations.length, before + 1, `${plan}: repeated submission reuses its key`);
}
for (const json of [null, {}, {account: []}, {account: {planType: "enterprise"}}]) {
  const before = reservations.length; context.stored = stored; context.token = {json};
  await assert.rejects(() => vm.runInContext("selectChatGptPlusCandidate(stored, token)", context), error => error.status === 400);
  assert.equal(reservations.length, before, "Missing or unknown plan must reserve nothing");
}
available = false; context.stored = stored; context.token = {json: {account: {planType: "free"}}};
const before = reservations.length;
await assert.rejects(() => vm.runInContext("selectChatGptPlusCandidate(stored, token)", context), error => error.status === 409);
assert.equal(reservations.length, before + 1, "Exhaustion must not fall back to the other pool");
assert.equal(writes.at(-1).keyAllocationState, "exhausted");
available = true;
context.stored = {...stored, reservedCandidates: [{keyId: "legacy-free", code: "free-key", activationSiteUrl: "https://aiee.fun"}, {keyId: "legacy-ios", code: "ios-key", activationSiteUrl: "https://vip.sxzfd.com"}]};
const legacyBefore = reservations.length;
const legacy = await vm.runInContext("selectChatGptPlusCandidate(stored, token)", context);
assert.equal(legacy.record.cdk, "free-key"); assert.equal(reservations.length, legacyBefore);
assert.deepEqual(releases.at(-1), {key: "legacy-ios", order: order.id});
assert.equal(legacy.record.reservedCandidates.length, 0);
console.log("ChatGPT Plus paid guard, single-key allocation, both pools, renewals, exhaustion and legacy release verified.");
