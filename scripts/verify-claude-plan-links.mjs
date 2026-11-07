import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { assertAssetReference } from './release-assets.mjs';

const cases = [
  ['claude', '', false, 'pro'],
  ['claude', '?plan=pro', false, 'pro'],
  ['claude', '?plan=max-5x', false, 'max-5x'],
  ['claude', '?plan=max-20x', false, 'max-20x'],
  ['claude', '?plan=max5x', false, 'max-5x'],
  ['claude', '?plan=20x', true, 'max-20x'],
  ['claude', '?plan=%20MAX-5X%20&utm_source=yandex', false, 'max-5x'],
  ['claude', '?plan=unavailable', false, 'pro'],
  ['claude', '?plan=constructor', false, 'pro'],
  ['chatgpt', '', false, 'plus'],
  ['chatgpt', '?plan=pro', false, 'pro-5x'],
  ['chatgpt', '?plan=pro-20x', false, 'pro-20x'],
  ['chatgpt', '?plan=pro500', false, 'pro-25x'],
  ['chatgpt', '', true, 'all'],
  ['gemini', '', false, 'all'],
];
for (const path of ['main.js', 'assets/js/app.js', 'assets/js/app.min.js']) {
  const source = fs.readFileSync(path, 'utf8');
  const start = source.indexOf('  const requestedServicePlan = (() => {');
  const end = source.indexOf('  const servicePageState = {', start);
  assert.ok(start >= 0 && end > start, path);
  const selector = source.slice(start, end) + '\nrequestedServicePlan;';
  for (const [service, search, english, expected] of cases) {
    const actual = vm.runInNewContext(selector, {
      URLSearchParams,
      window: { location: { search } },
      servicePageRootEl: { getAttribute: () => service },
      isEnglishRequest: () => english,
    });
    assert.equal(actual, expected, `${path}: ${service} ${search}`);
  }
}
console.log(`Claude plan links: ${cases.length * 3} URL selection and other-service regression cases passed.`);
const flush = () => new Promise(setImmediate);
for (const [file, pathname, lang] of [['claude.html','/claude','ru'], ['en/claude.html','/en/claude.html','en'], ['claude.html','/claude','en']]) {
  const html = fs.readFileSync(file, 'utf8');
  for (const asset of ['assets/css/claude-workspace.css', 'assets/js/claude-workspace.js']) assertAssetReference(html,asset,file);
  const dom = new JSDOM(html, {
    url: 'https://fixture.invalid' + pathname + '?lang=' + lang,
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window, d = w.document;
  w.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
  const plans = [['pro','claude-pro',2299,'withoutLogin','activation',1],
    ['max-5x','claude-5x-max',12500,'withLogin','support',4],
    ['max-20x','claude-20x-max',24200,'withLogin','support',4]];
  const items = plans.map(([key,slug,price,activationVariant,deliveryType,deliveryMethod]) => ({
    id:'fixture-' + key, baseSlug:slug, slug:slug + (activationVariant === 'withLogin' ? '-login' : '-link'), product:slug + (activationVariant === 'withLogin' ? '-login' : '-link'),
    title:'Claude ' + key, description:lang === 'en' ? '1 month' : '1 месяц',
    modalDescription:'Fixture plan', price, currency:'RUB', activationVariant, deliveryType, deliveryMethod, stock:null, tags:['claude',key]
  }));
  w.fetch = async (url, options = {}) => {
    assert.ok(!options.method || options.method === 'GET', 'Preview checks never submit orders');
    return {ok:true,json:async()=>String(url).includes('service-pages/claude')
      ? {page:{serviceKey:'claude',constructorTitle:'Claude',infoSections:[],faqItems:[]},products:items,meta:{}}
      : {items}};
  };
  w.eval(fs.readFileSync('assets/js/app.min.js','utf8'));
  w.eval(fs.readFileSync('assets/js/claude-workspace.js','utf8'));
  w.eval(fs.readFileSync('assets/js/claude-onboarding-v1.js','utf8'));
  for (let i = 0; i < 6; i++) await flush();
  const pro = d.getElementById('claudeProNotice'), max = d.getElementById('claudeAccountAgeNotice');
  assert.equal(pro.querySelectorAll('li').length,2);
  assert.match(pro.textContent,lang === 'en' ? /before 15 September 2026/ : /до 15 сентября 2026 года/);
  assert.match(pro.textContent,/KYC/);
  if (lang === 'en') assert.doesNotMatch(pro.textContent,/[А-Яа-яЁё]/);
  for (const key of ['pro','max-5x','max-20x','pro']) {
    d.querySelector('#servicePlanFilters [data-service-filter-key="' + key + '"]').click();
    for (let i = 0; i < 3; i++) await flush();
    assert.equal(d.querySelector('#servicePlansGrid .price-card').dataset.planKey,key);
    assert.equal(pro.hidden,key !== 'pro', 'Pro notice follows the selected plan');
    assert.equal(max.hidden,!key.startsWith('max-'), 'Max keeps its own requirements');
    assert.equal(d.querySelectorAll('.claude-plan-notice:not([hidden])').length,1);
    d.querySelector('#servicePlansGrid .buy-btn').click(); await flush();
    const form = d.querySelector('#chatGptGoOrderModal form');
    assert.ok(form,'Checkout still opens');
    const kycNotice = form.querySelector('[data-claude-kyc-notice]');
    assert.ok(kycNotice, 'Every Claude plan shows the KYC requirement before payment');
    assert.equal(form.querySelectorAll('[data-claude-kyc-notice]').length, 1);
    assert.equal(kycNotice.hidden, false);
    assert.match(kycNotice.textContent, lang === 'en' ? /KYC is required before activation/ : /Для зачисления необходимо пройти KYC/);
    assert.match(kycNotice.textContent, lang === 'en' ? /losses caused by missing KYC on the selected account/ : /потери, связанные с отсутствием KYC на выбранном аккаунте/);
    if (lang === 'en') assert.doesNotMatch(kycNotice.textContent, /[А-Яа-яЁё]/);
    assert.ok(kycNotice.compareDocumentPosition(form.querySelector('[data-chatgpt-go-submit]')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(form.dataset.productId,'fixture-' + key);
    const price = plans.find(x=>x[0]===key)[2];
    assert.equal(Number(form.querySelector('[data-chatgpt-go-total]').textContent.replace(/\D/g,'')),price);
    d.querySelector('#chatGptGoOrderModal [data-chatgpt-go-order-close]').click();
  }
  d.getElementById('verification-tab').click();
  assert.equal(d.getElementById('subscriptions').hidden,true);
  assert.equal(d.getElementById('verification').hidden,false);
  d.getElementById('subscriptions-tab').click();
  assert.equal(d.getElementById('subscriptions').hidden,false);
  dom.window.close();
}
console.log('Claude notices: Pro/Max selection, RU/EN and legacy English, unchanged checkout SKU/prices and verification tabs passed.');
