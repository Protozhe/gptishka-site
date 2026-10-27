import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const root = "apps/admin-backend/src/modules/payments/";
class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
let scenario, requests, budgets, timers, updates;
const quiet = { info() {}, warn() {}, error() {} };
const input = { orderId: "fixture-order", amount: 100, currency: "RUB", description: "fixture",
  orderData: { name: "fixture", payer_email: "fixture@example.invalid", items: [] } };
const env = { PALLY_API_TOKEN: "fixture", PALLY_SHOP_ID: "fixture", PALLY_API_BASE_URL: "https://pally.invalid",
  ENOT_API_KEY: "fixture", ENOT_SHOP_ID: "fixture", PAYMENT_API_BASE_URL: "https://enot.invalid",
  PAYMENT_CREATE_PATH: "/invoice/create", PAYMENT_REFUND_PATH: "/invoice/refund", LAVA_API_BASE_URL: "https://lava.invalid", LAVA_CREATE_PATH: "/business/invoice/create" };
const fakeAbort = { timeout(ms) {
  budgets.push(ms);
  const controller = new AbortController();
  timers.push(setTimeout(() => controller.abort(new Error("fixture deadline")), ms / 100));
  return controller.signal;
} };
function waitForAbort(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}
async function fakeFetch(url, options) {
  const provider = new URL(url).hostname.split(".")[0];
  requests.push({ provider, body: String(options.body) });
  assert.ok(options.signal, `${provider} invoice request needs a deadline`);
  if (scenario[provider] === "stall") return waitForAbort(options.signal);
  return { ok: scenario[provider] !== "reject", status: 503, text: async () => "fixture rejection",
    json: async () => scenario[provider] === "body-stall" ? waitForAbort(options.signal) :
      provider === "pally" ? { success: true, bill_id: "fixture-bill", link_page_url: "https://checkout.invalid/pay" } :
      { status_check: true, data: { id: "fixture-bill", url: "https://checkout.invalid/pay" } },
  };
}
function load(file, extra = {}) {
  const dependencies = { "../../../config/env": { env }, "../../../common/errors/app-error": { AppError },
    "../payment-return-url": { buildPaymentReturnUrls: () => ({ successUrl: new URL("https://fixture.invalid/success"), failUrl: new URL("https://fixture.invalid/fail") }) },
    "../lava.credentials": { resolveLavaCredentials: () => ({ shopId: "fixture", secretKey: "fixture" }) },
    crypto: { createHmac: () => ({ update: () => ({ digest: () => "fixture" }) }) }, ...extra };
  const context = vm.createContext({ exports: {}, URL, URLSearchParams, AbortSignal: fakeAbort, fetch: fakeFetch, console: quiet,
    require: name => { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; } });
  vm.runInContext(ts.transpileModule(fs.readFileSync(root + file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const limits = load("invoice-timeouts.ts");
assert.equal(limits.PRIMARY_INVOICE_TIMEOUT_MS, 3000);
assert.equal(limits.GATEWAY_INVOICE_TIMEOUT_MS, 4000);
const dependencies = { "../invoice-timeouts": limits };
const providers = { pally: new (load("providers/pally.provider.ts", dependencies).PallyProvider)(),
  gateway: new (load("providers/gateway.provider.ts", dependencies).GatewayProvider)(),
  lava: new (load("providers/lava.provider.ts", dependencies).LavaProvider)() };
const service = fs.readFileSync(root + "payments.service.ts", "utf8");
const flow = service.slice(service.indexOf("    let provider = input.paymentMethod"), service.indexOf("    const payment = await prisma.payment.create"));
const context = vm.createContext({ console: quiet, Date, order: { id: input.orderId }, paymentInput: input,
  getPaymentProvider: () => providers.pally, getProviderByCode: code => providers[code],
  prisma: { order: { update: async value => { updates.push(value); } } },
});
vm.runInContext(`async function create(input, selectedProviderCode) { ${flow}; return paymentResponse; }`, context);
async function run(method, stalls) {
  scenario = stalls; requests = []; budgets = []; timers = []; updates = [];
  try { return await context.create({ paymentMethod: method }, method); }
  finally { timers.forEach(clearTimeout); }
}
await run("pally", {}); assert.deepEqual(requests.map(r => r.provider), ["pally"]); assert.deepEqual(budgets, [3000]);
for (const primary of ["pally", "lava"]) {
  for (const fault of ["stall", "body-stall", "reject"]) {
    assert.equal((await run(primary, { [primary]: fault })).provider, "gateway");
    assert.deepEqual(requests.map(r => r.provider), [primary, "enot"]);
    assert.deepEqual(budgets, [3000, 4000]);
    assert.equal(JSON.parse(requests[1].body).order_id, input.orderId, "Fallback must reuse the existing order");
    assert.equal(updates.length, 1);
  }
}
await assert.rejects(run("pally", { pally: "stall", enot: "stall" }));
assert.deepEqual(requests.map(r => r.provider), ["pally", "enot"], "No parallel speculative invoice or retry loop");
await assert.rejects(run("gateway", { enot: "stall" })); assert.equal(requests.length, 1);
scenario = {}; requests = []; budgets = []; timers = [];
try { await providers.gateway.refundPayment("fixture-bill", 100); assert.deepEqual(budgets, [10000], "Refund budget must stay unchanged"); }
finally { timers.forEach(clearTimeout); }

// The form must respond before promo validation resolves and reject double-clicks.
const app = fs.readFileSync("assets/js/app.js", "utf8");
assert.equal(fs.readFileSync("assets/js/app.min.js", "utf8"), app);
const submit = app.slice(app.indexOf("  async function submitChatGptGoOrder(form) {"), app.indexOf("  function renderChatGptGoOrderCard(item, serviceKey) {"));
for (const outcome of ["success", "bad-promo", "network-error"]) {
  let resolvePromo, promoCalls = 0, checkoutCalls = 0, busy = false;
  const order = { contactEmail: "fixture@example.invalid", promoCode: "PROMO", serviceKey: "chatgpt", paymentMethod: "pally" };
  const ctx = vm.createContext({ chatGptGoOrderCheckoutInProgress: false, window: {}, localStorage: { setItem() {} },
    getCardItem: () => ({ productId: "fixture", serviceKey: "chatgpt" }), validateChatGptGoOrder: () => true,
    getChatGptGoOrderField: () => ({ value: "PROMO", focus() {} }), normalizePromoCodeInput: s => s,
    applyChatGptGoPromoCode: () => { promoCalls++; return new Promise(r => { resolvePromo = r; }); },
    setChatGptGoStatus() {}, setChatGptGoSubmitBusy: (_, value) => { busy = value; },
    collectChatGptGoOrder: () => order, saveChatGptGoOrderDraft() {}, normalizeAiServiceKey: s => s,
    getChatGptGoPaymentProvider: s => s, savePaymentMethod() {}, syncPaymentMethodUi() {}, headerCartEmailInputEl: null, cartEmailInputEl: null,
    buildChatGptGoCheckoutDetails: () => ({}), resolveCheckoutErrorMessage: e => e.message,
    startBackendCheckout: async () => { checkoutCalls++; if (outcome === "network-error") throw Error("fixture failure"); },
  });
  vm.runInContext(submit, ctx);
  const first = ctx.submitChatGptGoOrder({}); const second = ctx.submitChatGptGoOrder({});
  assert.equal(busy, true, "Visible busy state must begin before the first awaited request");
  assert.equal(promoCalls, 1); resolvePromo(outcome !== "bad-promo"); await Promise.all([first, second]);
  assert.equal(checkoutCalls, outcome === "bad-promo" ? 0 : 1);
  assert.equal(busy, outcome === "success", "Failures must restore the form; navigation stays protected");
}
console.log("Checkout latency: bounded invoice/body waits, same-order sequential fallback, unchanged refund budget, immediate busy state and duplicate-click protection pass. All transports mocked.");

