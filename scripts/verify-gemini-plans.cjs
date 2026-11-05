const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { spawnSync } = require("node:child_process");
const { JSDOM } = require("jsdom");
const { plans, productData } = require("../apps/admin-backend/scripts/configure-gemini-plans.js");
const ultra = require("../apps/admin-backend/scripts/configure-gemini-ultra.js");

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
  const isUltra = plan.slug.startsWith("gemini-ultra-");
  const product = { id: "fixture-product", ...(isUltra ? ultra.productData(plan) : productData(plan)) };
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
  const input = { email: "contact@example.test", productId: product.id, quantity: 1, paymentMethod: "pally", orderDetails: { language: lang, selection: { activationVariant: plan.account === "ready" ? "withoutLogin" : "withLogin", needsNewAccount: newAccount } } };
  const result = await context.service.createOrderWithPayment(input);
  const expected = plan.price + (newAccount ? 200 : 0);
  assert.equal(result.finalPrice, expected); assert.equal(invoice.amount, expected); assert.equal(order.totalAmount, expected);
  assert.equal(order.orderDetails.selection.serverNewAccountSurcharge, newAccount ? 200 : 0);
  assert.equal(order.orderDetails.selection.serverDeliveryType, newAccount || isUltra ? "manual_login" : "activation");
  const url = returns.buildPaymentReturnUrls(invoice).successUrl;
  assert.equal(url.pathname, `${lang === "en" ? "/en" : ""}/gemini-activation.html`);
  assert.equal(url.searchParams.get("t"), "fixture-private-link");
  assert.equal(reads, 0, 'Gemini checkout does not require preloaded keys');
  assert.equal(writes, 1);
}

const html = fs.readFileSync("gemini-activation.html", "utf8");
const script = fs.readFileSync("assets/js/gemini-order-activation.js", "utf8");
const flush = () => new Promise(setImmediate);
async function storefrontCheckout(lang) {
  const dom = new JSDOM(fs.readFileSync("gemini.html", "utf8"), { url: `https://fixture.invalid/${lang === "en" ? "en/" : ""}gemini?lang=${lang}`, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  const observers = [], Observer = w.MutationObserver;
  w.MutationObserver = class extends Observer { constructor(callback) { super(callback); observers.push(this); } };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const items = plans.map((plan, index) => ({ ...productData(plan), id: `fixture-${index}`, baseSlug: plan.slug, product: plan.slug + "-login", slug: plan.slug + "-login", activationVariant: "withLogin", deliveryType: "activation", deliveryMethod: 1 }));
  items.push(...ultra.plans.map((plan, index) => ({ ...ultra.productData(plan), id: `fixture-ultra-${index}`, baseSlug: plan.slug, product: plan.slug + (plan.account === "ready" ? "-link" : "-login"), slug: plan.slug, activationVariant: plan.account === "ready" ? "withoutLogin" : "withLogin", deliveryType: "support", deliveryMethod: 4 })));
  if (lang === "en") for (const item of items) { item.title = item.titleEn; item.description = item.descriptionEn; item.modalDescription = item.modalDescriptionEn; }
  w.fetch = async (url) => ({ ok: true, json: async () => String(url).includes("service-pages/gemini")
    ? { page: { serviceKey: "gemini", heroTitle: "Gemini Pro", constructorTitle: "Gemini Pro", infoSections: [], faqItems: [] }, products: items, meta: { title: "Gemini Pro" } }
    : { items } });
  w.eval(fs.readFileSync("assets/js/app.min.js", "utf8"));
  w.eval(fs.readFileSync("assets/js/client-i18n.js", "utf8"));
  for (let i = 0; i < 6; i++) await flush();
  assert.equal(d.querySelectorAll('#serviceDurationFilters button:not(:disabled)').length, 3);
  const accountOption = d.querySelector('[data-service-new-account]');
  assert.equal(accountOption.disabled, false);
  accountOption.checked = true; accountOption.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match(d.querySelector('#serviceConstructorPrice').textContent.replaceAll('\u00a0', ' '), /2[\s,]*690/);
  d.querySelector('#servicePlansGrid .buy-btn').click(); await flush();
  const form = d.querySelector('[data-chatgpt-go-form]') || d.querySelector('#chatGptGoOrderModal form');
  assert.ok(form, 'Gemini checkout must open');
  assert.equal(form.querySelector('[name="serviceLogin"]'), null, 'Google credentials belong only on the paid-order page');
  assert.equal(form.querySelector('[name="servicePassword"]'), null);
  assert.match(form.querySelector('[data-chatgpt-go-total]').textContent.replaceAll('\u00a0', ' '), /2[\s,]*690/);
  d.querySelector('#chatGptGoOrderModal [data-chatgpt-go-order-close]').click();
  d.querySelector('#servicePlanFilters [data-service-filter-key="ultra"]').click(); await flush();
  assert.equal(d.querySelectorAll('#serviceDurationFilters button').length, 1);
  assert.equal(d.querySelector('#serviceDurationFilters button').dataset.serviceFilterKey, "1m");
  assert.equal(accountOption.disabled, false); assert.equal(accountOption.checked, false);
  assert.equal(d.querySelector('#serviceDeliveryFilters'), null, 'Ultra uses the same account checkbox as Pro');
  assert.match(d.querySelector('#serviceConstructorPrice').textContent.replaceAll('\u00a0', ' '), /16[\s,]*990/);
  for (const [ready, price, id] of [[false, /16[\s,]*990/, 'fixture-ultra-1'], [true, /14[\s,]*990/, 'fixture-ultra-0'], [false, /16[\s,]*990/, 'fixture-ultra-1']]) {
    accountOption.checked = ready; accountOption.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(accountOption.checked, ready);
    assert.match(d.querySelector('#serviceConstructorPrice').textContent.replaceAll('\u00a0', ' '), price);
    assert.equal(d.querySelector('#servicePlansGrid .price-card').dataset.productId, id);
    d.querySelector('#servicePlansGrid .buy-btn').click(); await flush();
    const ultraForm = d.querySelector('#chatGptGoOrderModal form');
    assert.ok(ultraForm, 'Both Ultra options open checkout');
    assert.equal(ultraForm.querySelector('[name="servicePassword"]'), null);
    assert.equal(ultraForm.querySelector('[name="serviceLogin"]'), null);
    assert.equal(ultraForm.querySelector('[name="needsNewAccount"]'), null);
    assert.equal(ultraForm.dataset.productId, id, 'The checkbox changes the purchased SKU, not the Pro account surcharge');
    assert.match(ultraForm.querySelector('[data-chatgpt-go-total]').textContent.replaceAll('\u00a0', ' '), price);
    if (lang === "en") {
      assert.match(ultraForm.querySelector('.chatgpt-order-security-note').textContent, /After payment, contact the manager/);
      assert.match(ultraForm.textContent, ready ? /Ready account/ : /Your account/);
      assert.doesNotMatch(d.querySelector('[data-gemini-requirements]').textContent, /[А-Яа-яЁё]/);
    }
    d.querySelector('#chatGptGoOrderModal [data-chatgpt-go-order-close]').click();
  }
  d.querySelector('#servicePlanFilters [data-service-filter-key="pro"]').click();
  assert.equal(d.querySelectorAll('#serviceDurationFilters button:not(:disabled)').length, 3);
  assert.equal(d.querySelector('#serviceDeliveryFilters'), null);
  assert.equal(accountOption.disabled, false);
  assert.equal(accountOption.checked, false);
  assert.match(d.querySelector('#serviceConstructorPrice').textContent.replaceAll('\u00a0', ' '), /2[\s,]*490/);
  assert.match(d.querySelector('.service-new-account__price').textContent.replaceAll('\u00a0', ' '), /\+200/);
  await flush();
  for (const observer of observers) observer.disconnect();
  dom.window.close();
}

async function ultraBrowser(lang, plan) {
  const dom = new JSDOM(lang === "en" ? fs.readFileSync("en/gemini-activation.html", "utf8") : html, { url: `https://fixture.invalid/gemini-activation.html?order_id=demo-ultra&t=private&lang=${lang}`, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  w.setInterval = () => 1;
  w.fetch = async (_url, options) => {
    assert.equal(options.method, "GET", "Manual Ultra never sends automatic activation or credentials");
    return { ok: true, json: async () => ({ deliveryMode: "manual_login", activationFlow: "gemini_ultra_manual", productSlug: plan.slug, productTitle: ultra.productData(plan).title, phase: "ultra_manual" }) };
  };
  w.eval(script); await flush(); await flush();
  assert.equal(d.getElementById("gemini-workspace").hidden, true);
  assert.equal(d.getElementById("gemini-account-form").hidden, true);
  assert.equal(d.getElementById("gemini-fields").disabled, true);
  assert.match(d.getElementById("gemini-plan").textContent, /Ultra/);
  assert.equal(d.getElementById("gemini-manager").href, "https://t.me/gptishkasupport");
  if (lang === "en") assert.doesNotMatch(d.querySelector("main").textContent, /[А-Яа-яЁё]/);
  dom.window.close();
}

async function ultraOrderAccess(plan) {
  const source = ts.createSourceFile("orders.ts", fs.readFileSync(base + "modules/orders/orders.service.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const service = source.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []).find(node => node.name.getText(source) === "ordersService");
  const method = service.initializer.properties.find(node => node.name?.getText(source) === "getActivation");
  let paid = true, deliveries = 0;
  const order = { id: "fixture-ultra", items: [{ product: { id: "fixture-product", ...ultra.productData(plan) } }], orderDetails: { selection: { serverDeliveryType: "manual_login" } } };
  const context = vm.createContext({
    AppError, isGeminiAutomaticProduct: gemini.isGeminiAutomaticProduct,
    assertPaidOrderAccess: async (id, token) => { if (!paid || token !== "private") throw new AppError("forbidden", 403); assert.equal(id, order.id); return order; },
    getOrderWithFirstItem: async () => order, resolveOrderDeliveryType: () => "manual_login",
    readActivationSiteUrlFromOrderDetails: () => null, resolveSuperGrokDurationMonths: () => 1, canonicalProductKey: slug => slug,
    resolveTokenActivationFlowForProduct: () => null, isSupportLikeDeliveryType: () => false, isSupportActivationFlow: () => false,
    isVerificationSupportProduct: () => false, resolveSupportEmail: () => "support@example.test",
    deliverProduct: async value => { assert.equal(value.id, order.id); deliveries++; },
  });
  vm.runInContext(ts.transpileModule(`globalThis.service = { ${method.getText(source)} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await assert.rejects(context.service.getActivation(order.id, "wrong"));
  paid = false; await assert.rejects(context.service.getActivation(order.id, "private"));
  assert.equal(deliveries, 0);
  paid = true;
  const result = await context.service.getActivation(order.id, "private");
  assert.equal(result.activationFlow, "gemini_ultra_manual");
  assert.equal(result.phase, "ultra_manual"); assert.equal(result.productSlug, plan.slug);
  assert.equal(result.supportUrl, "https://t.me/gptishkasupport");
  assert.equal(result.tokenStored, undefined); assert.equal(result.credentials, undefined);
  assert.equal(deliveries, 1);
}

async function scopedUltraCatalog() {
  const touched = [];
  const productIds = new Set();
  const db = {
    servicePage: { update: async q => { assert.equal(q.where.slug, "gemini"); touched.push("page"); return { id: "gemini-page" }; } },
    product: { upsert: async q => {
      assert.ok(ultra.plans.some(plan => plan.slug === q.where.slug));
      assert.equal(q.update.price, undefined, "Reruns must preserve admin prices");
      assert.equal(q.update.activationVariants, undefined);
      const id = q.where.slug; productIds.add(id); touched.push(id); return { id, ...q.create };
    } },
    productVisualConfig: { upsert: async q => assert.ok(productIds.has(q.where.productId)) },
    servicePageProductPlacement: { upsert: async q => { assert.equal(q.create.servicePageId, "gemini-page"); assert.ok(productIds.has(q.create.productId)); assert.ok(q.create.sortOrder >= 40); assert.deepEqual(q.update, {}); } },
    productShowcaseServiceCard: { update: async q => { assert.equal(q.where.serviceKey, "gemini"); assert.deepEqual(Object.keys(q.data), ["planSummary"]); } },
  };
  const result = await ultra.apply(db);
  assert.equal(result.length, 2); assert.equal(touched.length, 3);
  assert.throws(() => surcharge.resolveNewAccountSurcharge(ultra.plans[0].slug, "RUB", true));
}
async function browser(lang, forbidden = false) {
  const dom = new JSDOM(lang === "en" ? fs.readFileSync("en/gemini-activation.html", "utf8") : html, { url: `https://fixture.invalid/${lang === "en" ? "en/" : ""}gemini-activation.html?order_id=demo-order&t=fixture-private-link&lang=${lang}`, runScripts: "outside-only", pretendToBeVisual: true });
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
  for (const plan of ultra.plans) {
    await ultraOrderAccess(plan);
    for (const lang of ["ru", "en"]) { await checkout(plan, 0, false, lang); await ultraBrowser(lang, plan); }
  }
  await scopedUltraCatalog();
  for (const lang of ["ru", "en"]) { await browser(lang); await browser(lang, true); }
  for (const lang of ["ru", "en"]) await storefrontCheckout(lang);
  console.log("Gemini: Pro waits for keys after payment; Ultra options, prices, scoped catalog, private manager page and RU/EN checkout verified with mocks only.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
