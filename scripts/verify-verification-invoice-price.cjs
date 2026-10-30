const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies) {
  const ctx = vm.createContext({exports: {}, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }});
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, ctx);
  return ctx.exports;
}
const {isVerificationSupportProduct} = load('apps/admin-backend/src/modules/orders/verification-support.ts', {});
const {resolveActivationVariant} = load('apps/admin-backend/src/common/utils/product-activation-variants.ts', {
  '@prisma/client': {Prisma: {JsonNull: null}},
  './activation-site': {normalizeActivationSiteUrl: value => String(value || '')},
  './product-delivery': {normalizeDeliveryType: value => value},
});
const source = ts.createSourceFile('payments.ts', fs.readFileSync('apps/admin-backend/src/modules/payments/payments.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const service = source.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : [])
  .find(n => n.name.getText(source) === 'paymentsService');
const method = service.initializer.properties.find(n => n.name?.getText(source) === 'createOrderWithPayment');

async function verify(slug, base, staleVariant, expected, paymentMethod) {
  const product = {id: 'fixture-product', slug, title: slug, price: base, currency: 'RUB', isActive: true, isArchived: false, tags: ['verification-support'],
    activationVariants: {withoutLogin: {enabled: true, price: staleVariant, deliveryType: 'activation'}, withLogin: {enabled: false, price: 6500}}};
  let order, payment, invoice;
  const providerCode = paymentMethod === 'enot' ? 'gateway' : paymentMethod;
  const provider = {createPayment: async input => {invoice = input; return {provider: providerCode, paymentId: 'fixture-bill', checkoutUrl: 'https://fixture.invalid/pay', status: 'processing'};}};
  const prisma = {
    product: {findUnique: async () => product},
    order: {create: async query => (order = {...query.data, id: 'fixture-order', items: []}), update: async query => Object.assign(order, query.data)},
    payment: {create: async query => (payment = {...query.data, id: 'fixture-payment'})},
    $transaction: async action => action(prisma),
  };
  const statuses = Object.fromEntries(['PENDING', 'PAID', 'FAILED', 'SUCCESS', 'PROCESSING'].map(x => [x, x]));
  const context = vm.createContext({prisma, Math, Number, String, Date, Prisma: {JsonNull: null}, OrderStatus: statuses, PaymentStatus: statuses,
    AppError: class AppError extends Error {}, console: {info() {}, warn() {}},
    isVerificationSupportProduct, resolveActivationVariant, resolveProductDeliveryType: () => 'activation',
    resolveNewAccountSurcharge: () => 0, isDevinProductSlug: () => false,
    normalizeOrderSource: () => 'site', ORDER_SOURCE_TELEGRAM: 'telegram',
    generateRedeemToken: () => 'fixture-token', sha256Hex: () => 'fixture-hash',
    resolveProviderCodeByPaymentMethod: () => providerCode, normalizePaymentMethodCode: () => paymentMethod,
    getProviderByCode: () => provider, getPaymentProvider: () => provider,
    buildPallyOrderData: input => {assert.equal(input.amount, expected); return {name: 'fixture', items: []};},
  });
  vm.runInContext(ts.transpileModule(`const service = {${method.getText(source)}}; globalThis.create = service.createOrderWithPayment;`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
  const result = await context.create({email: 'fixture@example.invalid', productId: product.id, quantity: 1, paymentMethod,
    orderDetails: {selection: {plan: slug.includes('kyc') ? 'KYC' : 'CVP'}}});
  assert.equal(result.finalPrice, expected, `${slug}/${paymentMethod}: returned price`);
  assert.equal(invoice.amount, expected, `${slug}/${paymentMethod}: provider invoice amount`);
  assert.equal(order.totalAmount, expected, `${slug}: Order amount`);
  assert.equal(payment.amount, expected, `${slug}: Payment amount`);
  assert.equal(order.orderDetails.selection.serverUnitPrice, expected, `${slug}: persisted server price`);
}
(async () => {
  for (const payment of ['pally', 'lava', 'enot']) {
    for (const slug of ['claude-kyc', 'claude-kyc-support']) await verify(slug, 4000, 5500, 4000, payment);
    await verify('claude-cvp', 7500, 11500, 7500, payment);
    await verify('claude-cvp-support', 11500, 7500, 11500, payment);
    await verify('chatgpt-plus-1', 4000, 5500, 5500, payment);
  }
  console.log('Verification invoice pricing: 15 cases bind catalog, provider invoice, Order and Payment despite stale variants; other product variants stay intact. No live transports.');
})().catch(error => {console.error(error); process.exitCode = 1;});
