const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('assets/js/verification-support-checkout.js', 'utf8');
const helper = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/admin-backend/src/modules/orders/verification-support.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: helper.exports });
for (const slug of ['claude-kyc', 'claude-cvp', 'claude-kyc-support', 'claude-cvp-support']) assert.equal(helper.exports.isVerificationSupportProduct(slug), true);
assert.equal(helper.exports.isVerificationSupportProduct('chatgpt-plus-1'), false);
for (const file of ['claude.html', 'en/claude.html']) {
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /id="claudeVerificationPrice"[^>]*>4 000 ₽/);
  assert.match(html, /name="kycWarningAcknowledged"[^>]*required/);
  assert.doesNotMatch(html, /6 500 ₽|\bCVP\b|name="claude-verification"/i);
}
async function verify(slug, price) {
  const handlers = {};
  const nodes = {};
  const node = name => nodes[name] ||= { textContent: '', addEventListener(event, handler) { handlers[name + ':' + event] = handler; }, setAttribute() {}, removeAttribute() {} };
  const workspace = {};
  const form = node('form');
  form.querySelector = node;
  const acknowledgement = { checked: false };
  form.reportValidity = () => acknowledgement.checked;
  form.elements = { email: { value: 'fixture@example.com' }, telegram: { value: '@fixture' }, payment: { value: 'pally' }, kycWarningAcknowledged: acknowledgement };
  const dialog = node('dialog');
  dialog.querySelector = node;
  dialog.showModal = () => {};
  const ids = { verificationSupportCheckout: dialog, verificationSupportCheckoutForm: form, claudeVerificationSubmit: node('open'), claudeVerificationPrice: node('price') };
  ids.claudeVerificationSubmit.disabled = true;
  let payment;
  const context = {
    document: { documentElement: { lang: 'ru' }, querySelector: () => workspace, getElementById: id => ids[id] },
    URL, location: { assign() {} },
    async fetch(url, options) {
      if (url === '/api/public/verification-support-products') return { ok: true, json: async () => ({ items: [{ slug, price, currency: 'RUB' }] }) };
      payment = JSON.parse(options.body);
      return { ok: true, json: async () => ({ pay_url: 'https://example.com/payment' }) };
    },
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  if (slug.includes('cvp')) {
    assert.equal(ids.claudeVerificationSubmit.disabled, true, 'retired CVP does not open checkout');
    handlers['open:click']();
    await handlers['form:submit']({ preventDefault() {} });
    assert.equal(payment, undefined, 'retired CVP does not create a payment');
    return;
  }
  assert.equal(ids.claudeVerificationSubmit.disabled, false);
  assert.equal(ids.claudeVerificationPrice.textContent.replace(/\s/g, ''), price + '₽');
  handlers['open:click']();
  assert.equal(nodes['[data-support-price]'].textContent.replace(/\s/g, ''), price + '₽');
  assert.equal(acknowledgement.checked, false, 'acknowledgement is never preselected');
  await handlers['form:submit']({ preventDefault() {} });
  assert.equal(payment, undefined, 'KYC payment must not be created before acknowledgement');
  acknowledgement.checked = true;
  await handlers['form:submit']({ preventDefault() {} });
  assert.equal(payment.product_slug, slug);
  assert.equal(payment.quantity, 1);
  assert.equal(payment.order_details.selection.plan, 'KYC');
  handlers['open:click']();
  assert.equal(acknowledgement.checked, false, 'reopening checkout requires a fresh acknowledgement');
}
(async () => {
  for (const [slug, price] of [['claude-kyc', 4000], ['claude-kyc-support', 4000], ['claude-cvp', 7500], ['claude-cvp-support', 11500]]) await verify(slug, price);
  console.log('Both KYC SKUs require fresh acknowledgement. Retired CVP cannot open checkout.');
})().catch(error => { console.error(error); process.exitCode = 1; });
