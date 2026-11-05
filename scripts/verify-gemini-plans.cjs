const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { spawnSync } = require("node:child_process");
const { JSDOM } = require("jsdom");
const { plans, productData } = require("../apps/admin-backend/scripts/configure-gemini-plans.js");

const backend = spawnSync(process.execPath, ["--import", "tsx", "--test", "apps/admin-backend/src/modules/orders/gemini-activation.test.ts"], { encoding: "utf8" });
if (backend.status !== 0) { process.stderr.write(backend.stdout + backend.stderr); process.exit(backend.status || 1); }
class AppError extends Error { constructor(message, status) { super(message); this.statusCode = status; } }
function load(file, dependencies = {}) {
  const context = vm.createContext({ exports: {}, URL, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  } });
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const base = "apps/admin-backend/src/";
const gemini = load(base + "common/utils/gemini-product.ts", { "../errors/app-error": { AppError } });
const surcharge = load(base + "modules/payments/new-account-option.ts", { "../../common/errors/app-error": { AppError } });
const variants = load(base + "common/utils/product-activation-variants.ts", {
  "@prisma/client": { Prisma: { JsonNull: null } }, "./activation-site": { normalizeActivationSiteUrl: (value) => String(value || "") },
  "./product-delivery": { normalizeDeliveryType: (value) => value },
});
const returns = load(base + "modules/payments/payment-return-url.ts", { "../../config/env": { env: { PAYMENT_SUCCESS_URL: "https://fixture.invalid/success.html", PAYMENT_FAIL_URL: "https://fixture.invalid/fail.html" } } });
const source = ts.createSourceFile("payments.ts", fs.readFileSync(base + "modules/payments/payments.service.ts", "utf8"), ts.ScriptTarget.Latest, true);
const service = source.statements.flatMap((node) => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []).find((node) => node.name.getText(source) === "paymentsService");
const method = service.initializer.properties.find((node) => node.name?.getText(source) === "createOrderWithPayment");

async function checkout(plan, stock, newAccount, lang) {
  const product = { id: "fixture-product", ...productData(plan) };
  let order, invoice, writes = 0, reads = 0;
  const provider = { createPayment: async (data) => { invoice = data; return { provider: "pally", paymentId: "fixture-bill", checkoutUrl: "https://fixture.invalid/pay", status: "processing" }; } };
  const prisma = {
    product: { findUnique: async () => product },
    licenseKey: { count: async (query) => { reads++; assert.equal(query.where.productKey, plan.slug); assert.equal(query.where.activationSiteUrl, gemini.GEMINI_ACTIVATION_SITE); return stock; } },
    order: { create: async (query) => { writes++; order = { ...query.data, id: "fixture-order", items: [] }; return order; }, update: async (query) => Object.assign(order, query.data) },
    payment: { create: async (query) => ({ ...query.data, id: "fixture-payment" }) },
    $transaction: async (fn) => fn(prisma),
  };
  const statuses = Object.fromEntries(["PAID", "PENDING", "FAILED", "SUCCESS", "PROCESSING"].map((key) => [key, key]));
  const context = vm.createContext({ ...gemini, AppError, prisma, Prisma: { JsonNull: null }, OrderStatus: statuses, PaymentStatus: statuses,
    console: { info() {}, warn() {} },
    resolveActivationVariant: variants.resolveActivationVariant, resolveProductDeliveryType: () => "activation",
    resolveNewAccountSurcharge: surcharge.resolveNewAccountSurcharge,
    isVerificationSupportProduct: () => false, appStoreCard: () => null, isDevinProductSlug: () => false,
    normalizeOrderSource: () => "site", ORDER_SOURCE_TELEGRAM: "telegram",
    generateRedeemToken: () => "fixture-private-link", sha256Hex: () => "fixture-hash",
    resolveProviderCodeByPaymentMethod: () => "pally", normalizePaymentMethodCode: () => "pally", getProviderByCode: () => provider, getPaymentProvider: () => provider,
    buildPallyOrderData: () => ({ name: "fixture", items: [] }),
  });
  vm.runInContext(ts.transpileModule(`globalThis.service = { ${method.getText(source)} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const input = { email: "contact@example.test", productId: product.id, quantity: 1, paymentMethod: "pally", orderDetails: { language: lang, selection: { activationVariant: "withLogin", needsNewAccount: newAccount } } };
  if (!stock && !newAccount) {
    await assert.rejects(context.service.createOrderWithPayment(input), /keys are being replenished/);
    assert.equal(writes, 0); assert.equal(invoice, undefined); assert.equal(reads, 1); return;
  }
  const result = await context.service.createOrderWithPayment(input);
  const expected = plan.price + (newAccount ? 200 : 0);
  assert.equal(result.finalPrice, expected); assert.equal(invoice.amount, expected); assert.equal(order.totalAmount, expected);
  assert.equal(order.orderDetails.selection.serverNewAccountSurcharge, newAccount ? 200 : 0);
  assert.equal(order.orderDetails.selection.serverDeliveryType, newAccount ? "manual_login" : "activation");
  const url = returns.buildPaymentReturnUrls(invoice).successUrl;
  assert.equal(url.pathname, `${lang === "en" ? "/en" : ""}/gemini-activation.html`);
  assert.equal(url.searchParams.get("t"), "fixture-private-link");
  assert.equal(reads, newAccount ? 0 : 1);
}

const html = fs.readFileSync("gemini-activation.html", "utf8");
const script = fs.readFileSync("assets/js/gemini-order-activation.js", "utf8");
const flush = () => new Promise(setImmediate);
async function storefrontCheckout() {
  const dom = new JSDOM(fs.readFileSync("gemini.html", "utf8"), { url: "https://fixture.invalid/gemini?lang=ru", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const items = plans.map((plan, index) => ({ ...productData(plan), id: `fixture-${index}`, baseSlug: plan.slug, product: plan.slug + "-login", slug: plan.slug + "-login", activationVariant: "withLogin", deliveryType: "activation", deliveryMethod: 1 }));
  w.fetch = async (url) => ({ ok: true, json: async () => String(url).includes("service-pages/gemini")
    ? { page: { serviceKey: "gemini", heroTitle: "Gemini Pro", constructorTitle: "Gemini Pro", infoSections: [], faqItems: [] }, products: items, meta: { title: "Gemini Pro" } }
    : { items } });
  w.eval(fs.readFileSync("assets/js/app.min.js", "utf8"));
  for (let i = 0; i < 6; i++) await flush();
  assert.equal(d.querySelectorAll('#serviceDurationFilters button:not(:disabled)').length, 3);
  const accountOption = d.querySelector('[data-service-new-account]');
  assert.equal(accountOption.disabled, false);
  accountOption.checked = true; accountOption.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match(d.querySelector('#serviceConstructorPrice').textContent.replaceAll('\u00a0', ' '), /2\s*690/);
  d.querySelector('#servicePlansGrid .buy-btn').click(); await flush();
  const form = d.querySelector('[data-chatgpt-go-form]') || d.querySelector('#chatGptGoOrderModal form');
  assert.ok(form, 'Gemini checkout must open');
  assert.equal(form.querySelector('[name="serviceLogin"]'), null, 'Google credentials belong only on the paid-order page');
  assert.equal(form.querySelector('[name="servicePassword"]'), null);
  assert.match(form.querySelector('[data-chatgpt-go-total]').textContent.replaceAll('\u00a0', ' '), /2\s*690/);
  dom.window.close();
}
async function browser(lang, forbidden = false) {
  const dom = new JSDOM(html, { url: `https://fixture.invalid/${lang === "en" ? "en/" : ""}gemini-activation.html?order_id=demo-order&t=fixture-private-link&lang=${lang}`, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, d = w.document; let phase = "awaiting_account", submits = 0, reads = 0; const timers = [];
  w.setInterval = (fn) => { timers.push(fn); return 1; };
  w.fetch = async (url, options) => {
    assert.match(url, /^\/api\/public\/orders\/demo-order\/activation/);
    assert.equal(options.cache, "no-store"); assert.equal(options.referrerPolicy, "no-referrer");
    if (options.method === "POST") {
      submits++; assert.equal(JSON.parse(options.body).orderToken, "fixture-private-link"); phase = "processing";
    } else { reads++; assert.match(url, /t=fixture-private-link/); }
    return { ok: !forbidden, status: forbidden ? 403 : 200, json: async () => forbidden ? { message: "forbidden" } : ({ orderId: "demo-order", deliveryMode: "activation", activationFlow: "gemini_account", productSlug: "gemini-pro-12m", productTitle: "Gemini Pro", phase }) };
  };
  w.eval(script); await flush(); await flush();
  assert.ok(reads > 0);
  if (forbidden) {
    assert.equal(d.getElementById("gemini-fields").disabled, true);
    d.getElementById("gemini-account-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await flush(); assert.equal(submits, 0);
  } else {
    assert.equal(d.getElementById("gemini-fields").disabled, false);
    d.getElementById("gemini-email").value = "buyer@example.test";
    d.getElementById("gemini-password").value = "fixture-password-only";
    d.getElementById("gemini-consent").checked = true;
    d.getElementById("gemini-twofa").value = "123456";
    d.getElementById("gemini-account-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await flush(); assert.equal(submits, 0);
    d.getElementById("gemini-twofa").value = "12345678";
    d.getElementById("gemini-account-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await flush(); await flush(); assert.equal(submits, 1);
    assert.equal(d.getElementById("gemini-fields").disabled, true);
    assert.equal(d.getElementById("gemini-password").value, "");
    assert.equal(d.getElementById("gemini-twofa").value, "");
    assert.equal(d.getElementById("gemini-progress").hidden, false);
    assert.equal(w.localStorage.length, 0); assert.equal(w.sessionStorage.length, 0);
    phase = "success"; timers[0](); await flush(); await flush();
    assert.equal(d.getElementById("gemini-status").dataset.state, "success");
    assert.equal(d.getElementById("gemini-workspace").hidden, true);
    if (lang === "en") assert.doesNotMatch(d.querySelector("main").textContent, /[А-Яа-яЁё]/);
  }
  dom.window.close();
}

(async () => {
  assert.deepEqual(plans.map(({ months, price }) => [months, price]), [[6, 2490], [12, 3490], [24, 4990]]);
  for (const plan of plans) for (const lang of ["ru", "en"]) {
    await checkout(plan, 0, false, lang); await checkout(plan, 1, false, lang); await checkout(plan, 0, true, lang);
  }
  for (const lang of ["ru", "en"]) { await browser(lang); await browser(lang, true); }
  await storefrontCheckout();
  console.log("Gemini: exact-term stock gate, server prices, +200 account option, RU/EN payment returns and private activation form verified with mocks only.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
