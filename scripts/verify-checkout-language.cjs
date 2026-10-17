const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const ts = require('typescript');
const app = fs.readFileSync('main.js', 'utf8');
const translator = fs.readFileSync('assets/js/client-i18n.js', 'utf8');
const ast = ts.createSourceFile('main.js', app, ts.ScriptTarget.Latest, true);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const presenterAst = ts.createSourceFile('presenter.ts', fs.readFileSync('apps/admin-backend/src/modules/products/public-product-presenter.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const presenterFunctions = [];
for (const node of presenterAst.statements) {
  if (ts.isFunctionDeclaration(node) && ['localizedCategory', 'localizedTitle', 'localizedDescription', 'buildVisualPayload'].includes(node.name?.text)) presenterFunctions.push(node.getText(presenterAst));
}
const presenter = vm.createContext({});
vm.runInContext(ts.transpileModule(presenterFunctions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, presenter);
const product = { title: 'ChatGPT Plus — 1 месяц', titleEn: 'ChatGPT Plus — 1 month', description: 'Подключение на ваш аккаунт', descriptionEn: 'Activation on your account', visualConfig: { cardTitle: 'Подписка ChatGPT Plus', cardDescription: 'Автоматическая активация', buttonText: 'Купить', imageAlt: 'Подписка', imageUrl: '/assets/img/example.webp', textColor: '#ffffff' } };
const englishVisual = presenter.buildVisualPayload(product, 'en');
assert.equal(englishVisual.cardTitle, product.titleEn);
assert.equal(englishVisual.cardDescription, product.descriptionEn);
assert.equal(englishVisual.imageAlt, product.titleEn);
assert.equal(englishVisual.buttonText, 'Choose plan');
assert.equal(englishVisual.imageUrl, product.visualConfig.imageUrl);
assert.equal(englishVisual.textColor, product.visualConfig.textColor);
assert.equal(presenter.buildVisualPayload(product, 'ru').cardTitle, product.visualConfig.cardTitle);
assert.equal(presenter.buildVisualPayload({ ...product, visualConfig: { cardTitle: 'My custom English title' } }, 'en').cardTitle, 'My custom English title');
assert.equal(presenter.localizedCategory('Подписки ИИ', 'en'), 'AI subscriptions');
function page(html, en = true) {
  const dom = new JSDOM(html, { url: 'https://gptishka.shop/' + (en ? 'en/chatgpt.html' : 'chatgpt'), runScripts: 'outside-only' });
  const observers = [];
  const Observer = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends Observer {
    constructor(callback) { super(callback); observers.push(this); }
  };
  const close = dom.window.close.bind(dom.window);
  dom.window.close = () => { observers.forEach(observer => observer.disconnect()); close(); };
  dom.window.eval(translator);
  return dom;
}
const failures = [];
// CMS content arrives after the initial page; every Gemini sentence must translate.
const geminiCopy = JSON.parse(fs.readFileSync('scripts/fixtures/gemini-page-copy.json', 'utf8'));
const geminiStrings = [];
function collectGeminiStrings(value) {
  if (typeof value === 'string') geminiStrings.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(collectGeminiStrings);
}
collectGeminiStrings(geminiCopy);
const geminiFallbackContext = vm.createContext({ normalizeAiServiceKey: value => value });
vm.runInContext(functions.get('getEnglishServicePageContent'), geminiFallbackContext);
const geminiEnglishFallback = geminiFallbackContext.getEnglishServicePageContent('gemini');
assert.doesNotMatch(JSON.stringify(geminiEnglishFallback), /12.month|1,500|2,100/);
assert.match(geminiEnglishFallback.metaTitle, /18 months/);
for (const path of ['catalog/index.html', 'catalog/ai/index.html', 'en/catalog/index.html', 'en/catalog/ai/index.html']) {
  assert.doesNotMatch(fs.readFileSync(path, 'utf8'), /12 или 18|12 or 18/);
}
const geminiDom = page('<html><body></body></html>');
for (const value of geminiStrings) {
  const translated = geminiDom.window.gptishkaI18n.translateText(value);
  assert.doesNotMatch(translated, /[А-Яа-яЁё]/, 'Gemini CMS translation: ' + value);
  assert.doesNotMatch(value, /12 месяцев|1 500|2 100/);
  assert.doesNotMatch(translated, /12 months|1,500|2,100/);
}
assert.match(geminiDom.window.gptishkaI18n.translateText(geminiCopy.faqItems[0].answer), /One subscription.*18 months/);
geminiDom.window.close();
function check(root, label) {
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement.closest('script,style,textarea,[translate="no"]') && /[А-Яа-яЁё]/.test(node.nodeValue)) failures.push(label + ': ' + node.nodeValue.trim());
  }
  for (const element of root.querySelectorAll('[placeholder],[aria-label],[title],[alt],[aria-description]')) {
    for (const attribute of ['placeholder', 'aria-label', 'title', 'alt', 'aria-description']) {
      const value = element.getAttribute(attribute) || '';
      if (/[А-Яа-яЁё]/.test(value)) failures.push(label + ' (' + attribute + '): ' + value);
    }
  }
}
let rendered = 0;
for (const service of ['chatgpt', 'claude', 'grok', 'perplexity', 'gemini', 'suno', 'devin', 'midjourney', 'itunes', 'vpn']) {
  for (const delivery of ['link', 'login', 'id', 'support']) {
    const dom = page('<html lang="en"><body></body></html>');
    const { window } = dom;
    const context = vm.createContext({
      window, document: window.document, localStorage: window.localStorage,
      normalizeAiServiceKey: value => value,
      getAiOrderModalServiceConfig: () => ({ displayName: service === 'chatgpt' ? 'ChatGPT' : service === 'claude' ? 'Claude' : service }),
      toAmount: Number, getServicePlanLabel: (_, plan) => plan,
      getServiceDeliveryDisplayLabel: () => delivery === 'login' ? 'Со входом в аккаунт' : 'По ID',
      getServiceDurationLabel: () => '1 месяц', resolveDeliveryType: () => 'link',
      getAiOrderModalSummaryTitle: (name, plan) => name + ' ' + plan,
      escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
      readChatGptGoOrderDraft: () => ({ isGift: true, giftSender: 'Иван', giftRecipient: 'Мария', giftMessage: 'Спасибо', orderComment: 'Продление', cameByRecommendation: true }),
      getNewAccountSurcharge: key => key === 'chatgpt' ? 500 : key === 'claude' ? 3000 : 0,
      servicePageRootEl: null, DEFAULT_PAYMENT_METHOD: 'pally', activePaymentMethod: 'pally', activePromoCode: '',
      normalizeChatGptGoPaymentChoice: value => value, normalizePromoCodeInput: value => value,
      getChatGptGoDiscount: () => 0, formatPriceByCurrency: value => value + ' RUB',
      getChatGptGoPasswordIcon: () => '', renderChatGptPaymentOption: (_, title) => '<button>' + title + '</button>',
      getChatGptGoOrderField: (form, name) => form.elements.namedItem(name),
    });
    for (const name of ['renderChatGptGoOrderCard', 'applyAiOrderModalServiceCopy', 'setChatGptGoStatus']) vm.runInContext(functions.get(name), context);
    window.document.body.innerHTML = context.renderChatGptGoOrderCard({ product: service + '-plan', id: service + '-plan', serviceKey: service, price: 2000, planKey: 'max-5x', deliveryKey: delivery, durationKey: '1m' }, service);
    const form = window.document.querySelector('form');
    context.applyAiOrderModalServiceCopy(form, service);
    context.setChatGptGoStatus(form, 'Проверьте обязательные поля.', 'error');
    assert.equal(form.querySelector('[data-chatgpt-go-status]').textContent, 'Please check the required fields.');
    window.gptishkaI18n.translateElement(window.document.body);
    check(window.document.body, service + '/' + delivery);
    assert.equal(form.elements.giftSender.value, 'Иван');
    assert.equal(form.elements.giftRecipient.value, 'Мария');
    assert.equal(form.elements.giftMessage.value, 'Спасибо');
    assert.equal(form.elements.orderComment.value, 'Продление');
    dom.window.close(); rendered++;
  }
}
for (const filename of execFileSync('git', ['ls-files', '*.html'], { encoding: 'utf8' }).trim().split('\n')) {
  if (!filename) continue;
  const dom = page(fs.readFileSync(filename, 'utf8'));
  dom.window.gptishkaI18n.translateElement(dom.window.document.body);
  for (const form of dom.window.document.querySelectorAll('form,dialog,[role="dialog"],.modal,[id$="Modal"]')) check(form, filename);
  if (dom.window.document.querySelector('form,dialog,[role="dialog"]') && /app\.min\.js/.test(fs.readFileSync(filename, 'utf8'))) {
    assert.match(fs.readFileSync(filename, 'utf8'), /client-i18n\.js/, filename + ': checkout translation script is missing');
  }
  dom.window.close();
}
const dom = page('<html lang="en"><body><div id="dynamic"></div><textarea>Спасибо</textarea><p translate="no">Оригинал клиента</p></body></html>');
assert.equal(dom.window.gptishkaI18n.translateText('Никита'), 'Никита');
dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
const dynamic = dom.window.document.getElementById('dynamic');
dynamic.innerHTML = '<h4>Аккаунт</h4><input value="Нужен новый аккаунт" placeholder="Никита" aria-label="Почта или логин Claude"><p></p>';
assert.equal(dom.window.gptishkaI18n.translateError('Неизвестная ошибка провайдера'), 'Could not complete the request. Please check your details or contact support.');
assert.match(dom.window.gptishkaI18n.translateText('У вас уже есть аккаунт Claude?'), /^Do you/);
setImmediate(() => {
  check(dynamic, 'MutationObserver insertion');
  dynamic.querySelector('p').textContent = 'Нужен новый аккаунт';
  dynamic.querySelector('input').setAttribute('aria-label', 'Пароль от ChatGPT');
  setImmediate(async () => {
    check(dynamic, 'MutationObserver text and attributes');
    assert.equal(dynamic.querySelector('input').value, 'Нужен новый аккаунт');
    assert.equal(dom.window.document.querySelector('textarea').value, 'Спасибо');
    assert.equal(dom.window.document.querySelector('[translate="no"]').textContent, 'Оригинал клиента');
    const ru = page('<html lang="ru"><body><h4>Аккаунт</h4></body></html>', false);
    assert.equal(ru.window.gptishkaI18n, undefined);
    assert.equal(ru.window.document.querySelector('h4').textContent, 'Аккаунт');
    ru.window.close(); dom.window.close();
    for (const service of ['suno', 'devin', 'midjourney']) {
      const linkPage = new JSDOM(fs.readFileSync(service + '-link.html', 'utf8'), { url: `https://gptishka.shop/${service}-link.html?lang=en&order_id=fixture&t=fixture`, runScripts: 'outside-only' });
      const w = linkPage.window;
      const observers = [];
      const Observer = w.MutationObserver;
      w.MutationObserver = class extends Observer { constructor(callback) { super(callback); observers.push(this); } };
      w.eval(translator);
      w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
      w.fetch = async (_url, options) => ({ ok: !options?.method, status: options?.method ? 400 : 200, json: async () => options?.method ? { message: 'Неизвестная ошибка провайдера' } : { productSlug: service + '-pro-1-month', productTitle: service + ' Pro — 1 месяц', deliveryMode: 'payment_link', status: 'submitted' } });
      w.eval(fs.readFileSync('assets/js/' + service + '-link.js', 'utf8'));
      await new Promise(resolve => setImmediate(resolve));
      for (const node of w.document.querySelectorAll('#status,#orderPlan,#orderNumber,#linkForm')) check(node, service + ' paid order');
      const linkForm = w.document.getElementById('linkForm');
      const linkInput = w.document.getElementById('paymentLink');
      linkInput.value = 'invalid';
      linkForm.dispatchEvent(new w.Event('submit', { cancelable: true }));
      await new Promise(resolve => setImmediate(resolve));
      check(w.document.getElementById('status'), service + ' invalid link');
      linkInput.value = 'https://checkout.stripe.com/' + (service === 'midjourney' ? 'c' : 'g') + '/pay/cs_live_fixture';
      linkForm.dispatchEvent(new w.Event('submit', { cancelable: true }));
      await new Promise(resolve => setImmediate(resolve));
      check(w.document.getElementById('status'), service + ' backend error');
      observers.forEach(observer => observer.disconnect());
      w.close();
    }
    assert.deepEqual([...new Set(failures)], [], 'Untranslated public checkout text');
    console.log(`${rendered} checkout variants, static English forms, dynamic updates, accessibility labels and user-entered values verified.`);
  });
});
