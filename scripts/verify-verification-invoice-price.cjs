const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies) {
  const ctx = vm.createContext({exports: {}, URL, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }});
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, ctx);
  return ctx.exports;
}
const {isVerificationSupportProduct} = load('apps/admin-backend/src/modules/orders/verification-support.ts', {});
const {appStoreCard} = load('apps/admin-backend/src/common/utils/app-store-card.ts', {});
const {buildPaymentReturnUrls} = load('apps/admin-backend/src/modules/payments/payment-return-url.ts', {
  '../../config/env': {env: {PAYMENT_SUCCESS_URL: 'https://fixture.invalid/success.html', PAYMENT_FAIL_URL: 'https://fixture.invalid/fail.html'}},
});
const {resolveActivationVariant} = load('apps/admin-backend/src/common/utils/product-activation-variants.ts', {
  '@prisma/client': {Prisma: {JsonNull: null}},
  './activation-site': {normalizeActivationSiteUrl: value => String(value || '')},
  './product-delivery': {normalizeDeliveryType: value => value},
});
const source = ts.createSourceFile('payments.ts', fs.readFileSync('apps/admin-backend/src/modules/payments/payments.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const service = source.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : [])
  .find(n => n.name.getText(source) === 'paymentsService');
const method = service.initializer.properties.find(n => n.name?.getText(source) === 'createOrderWithPayment');

async function verify(slug, base, staleVariant, expected, paymentMethod, card = false, blocked = false) {
  const product = {id: 'fixture-product', slug, title: slug, price: base, currency: 'RUB', isActive: true, isArchived: false, tags: ['verification-support'],
    activationVariants: {withoutLogin: {enabled: true, price: staleVariant, deliveryType: 'activation'}, withLogin: {enabled: false, price: 6500}}};
  if (card) product.tags = ['itunes', 'delivery:code'];
  if (card || blocked) product.activationVariants.withoutLogin.deliveryType = 'code';
  let order, payment, invoice, stockChecks = 0;
  const providerCode = paymentMethod === 'enot' ? 'gateway' : paymentMethod;
  const provider = {createPayment: async input => {invoice = input; return {provider: providerCode, paymentId: 'fixture-bill', checkoutUrl: 'https://fixture.invalid/pay', status: 'processing'};}};
  const prisma = {
    product: {findUnique: async () => product},
    order: {create: async query => (order = {...query.data, id: 'fixture-order', items: []}), update: async query => Object.assign(order, query.data)},
    payment: {create: async query => (payment = {...query.data, id: 'fixture-payment'})},
    licenseKey: {count: async () => { stockChecks++; return 0; }},
    $transaction: async action => action(prisma),
  };
  const statuses = Object.fromEntries(['PENDING', 'PAID', 'FAILED', 'SUCCESS', 'PROCESSING'].map(x => [x, x]));
  const context = vm.createContext({prisma, Math, Number, String, Date, Prisma: {JsonNull: null}, OrderStatus: statuses, PaymentStatus: statuses,
    AppError: class AppError extends Error {}, console: {info() {}, warn() {}},
    isVerificationSupportProduct, appStoreCard, canonicalProductKey: value => value,
    isGeminiAutomaticProduct: value => /^gemini-pro-(6|12|24)m$/.test(String(value || "")),
    resolveActivationVariant, resolveProductDeliveryType: () => 'activation',
    resolveNewAccountSurcharge: () => 0, isDevinProductSlug: () => false,
    normalizeOrderSource: () => 'site', ORDER_SOURCE_TELEGRAM: 'telegram',
    generateRedeemToken: () => 'fixture-token', sha256Hex: () => 'fixture-hash',
    resolveProviderCodeByPaymentMethod: () => providerCode, normalizePaymentMethodCode: () => paymentMethod,
    getProviderByCode: () => provider, getPaymentProvider: () => provider,
    buildPallyOrderData: input => {assert.equal(input.amount, expected); return {name: 'fixture', items: []};},
  });
  vm.runInContext(ts.transpileModule(`const service = {${method.getText(source)}}; globalThis.create = service.createOrderWithPayment;`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
  const input = {email: 'fixture@example.invalid', productId: product.id, quantity: 1, paymentMethod,
    orderDetails: {language: 'en', selection: {plan: slug.includes('kyc') ? 'KYC' : 'CVP'}}};
  if (blocked) {
    await assert.rejects(() => context.create(input), /out of stock/);
    assert.equal(stockChecks, 1); assert.equal(invoice, undefined); return;
  }
  const result = await context.create(input);
  if (card) {
    assert.equal(stockChecks, 0);
    assert.equal(invoice.metadata.appStoreCard, true);
    const urls = buildPaymentReturnUrls(invoice);
    assert.equal(urls.successUrl.pathname, '/en/itunes.html');
    assert.equal(urls.successUrl.searchParams.get('order_id'), 'fixture-order');
    assert.equal(urls.successUrl.searchParams.get('t'), 'fixture-token');
  }
  assert.equal(result.finalPrice, expected, `${slug}/${paymentMethod}: returned price`);
  assert.equal(invoice.amount, expected, `${slug}/${paymentMethod}: provider invoice amount`);
  assert.equal(order.totalAmount, expected, `${slug}: Order amount`);
  assert.equal(payment.amount, expected, `${slug}: Payment amount`);
  assert.equal(order.orderDetails.selection.serverUnitPrice, expected, `${slug}: persisted server price`);
}
(async () => {
  for (const payment of ['pally', 'enot']) {
    for (const slug of ['claude-kyc', 'claude-kyc-support']) await verify(slug, 4000, 5500, 4000, payment);
    await verify('claude-cvp', 7500, 11500, 7500, payment);
    await verify('claude-cvp-support', 11500, 7500, 11500, payment);
    await verify('chatgpt-plus-1', 4000, 5500, 5500, payment);
    for (const slug of ['itunes-ru-500', 'itunes-app-store-5', 'itunes-us-2', 'itunes-tr-100', 'itunes-in-100', 'itunes-ae-50']) await verify(slug, 628, 628, 628, payment, true);
    await verify('other-digital-card', 628, 628, 628, payment, false, true);
  }
  console.log('Invoice pricing: 24 cases bind catalog/provider/order/payment; App Store allows empty stock and returns securely to the card page; other digital stock guards remain active. No live transports.');
})().catch(error => {console.error(error); process.exitCode = 1;});
