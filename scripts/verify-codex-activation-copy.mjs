import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
async function page(lang, slug, initial = 'processing', { iosKeyWait = false } = {}) {
  const en = lang !== 'ru';
  const html = fs.readFileSync((lang === 'en' ? 'en/' : '') + 'redeem-start.html', 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]).find(x => x.includes('function validateTokenNow'));
  const errors = [], requests = [], intervals = [], timers = [];
  const console = new VirtualConsole();
  console.on('jsdomError', e => { if (!/Could not parse CSS/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { url: `https://fixture.invalid/${lang === 'en' ? 'en/' : ''}redeem-start.html?lang=${en ? 'en' : 'ru'}&order_id=fixture-codex-copy&t=fixture-access`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window, get = id => w.document.getElementById(id);
  let state = initial, task = 'pending';
  w.scrollTo = () => {};
  w.setInterval = fn => { const t = { fn, active: true }; intervals.push(t); return t; };
  w.clearInterval = t => { if (t) t.active = false; };
  w.setTimeout = (fn, ms) => { const t = { fn, ms, active: true }; timers.push(t); return t; };
  w.clearTimeout = t => { if (t) t.active = false; };
  w.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET', body: options.body });
    if (String(url).includes('/store-token') || String(url).includes('/validate-token')) return { ok: true, json: async () => ({ ok: true, reasons: [] }) };
    if (String(url).endsWith('/activation/start')) {
      if (iosKeyWait) {
        state = 'queued';
        return { ok: true, json: async () => ({ taskId: '', queued: true, continuousKeyWait: true }) };
      }
      return { ok: true, json: async () => ({ taskId: 'fixture-copy-task' }) };
    }
    if (String(url).includes('/activation/task/')) {
      if (task === 'error') return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, json: async () => ({ pending: task === 'pending', success: task === 'success', message: 'provider fixture message' }) };
    }
    const claude = slug === 'claude-pro';
    return { ok: true, status: 200, json: async () => ({
      deliveryMode: claude ? 'support' : 'activation',
      activationFlow: claude ? 'support_token' : 'chatgpt_token',
      product: slug, productSlug: slug, productTitle: slug,
      queued: state === 'queued',
      continuousKeyWait: state === 'queued' && iosKeyWait,
      status: state === 'queued' ? 'issued' : state,
      taskId: state === 'issued' || state === 'queued' ? '' : 'reconcile-fixture-copy',
    }) };
  };
  w.eval(script); await flush();
  assert.deepEqual(errors, []);
  return { dom, w, get, en, requests, intervals, timers, state: value => { state = value; }, task: value => { task = value; } };
}

for (const lang of ['ru', 'en', 'legacy-en']) for (const quantity of [250, 500, 1000]) {
  const p = await page(lang, `codex-${quantity}`);
  try {
    assert.match(p.get('statusText').textContent, p.en ? /Adding credits/ : /Пополняем кредиты/);
    assert.doesNotMatch(p.get('statusText').textContent, /подписк|subscription/i);
    assert.equal(p.get('startBtn').textContent, p.en ? 'Top up credits' : 'Пополнить кредиты');
    const progress = p.get('activationProgress');
    if (progress) assert.equal(progress.querySelector('[data-activation-step="process"]').textContent, p.en ? 'Adding credits' : 'Пополнение');
    p.get('checkBtn').click(); await flush();
    assert.match(p.get('statusText').textContent, p.en ? /Adding credits/ : /Пополняем кредиты/);
    p.task('success'); p.get('checkBtn').click(); await flush();
    assert.equal(p.get('statusText').textContent, p.en ? 'Credits have been added to your account.' : 'Кредиты успешно зачислены.');
    assert.match(p.get('reviewRewardTitle').textContent, p.en ? /Credits have been added/ : /Кредиты успешно зачислены/);
    assert.equal(p.get('reviewRewardBox').hidden, false);
    assert.equal(p.get('activationEntry').dataset.activationResult, 'complete');
    assert.equal(progress.querySelector('[data-activation-step="done"]').classList.contains('is-current'), true);
    assert.equal(p.intervals.some(x => x.active), false, 'completion must still stop polling');
    assert.equal(p.requests.filter(x => x.method === 'POST').length, 0, 'status checks must not start or repay an order');
  } finally { p.dom.window.close(); }
}
for (const lang of ['ru', 'en']) {
  for (const initial of ['success', 'processing']) {
    const p = await page(lang, 'codex-500', initial);
    try {
      if (initial === 'processing') { p.state('success'); p.task('error'); p.get('checkBtn').click(); await flush(); }
      assert.equal(p.get('statusText').textContent, p.en ? 'Credits have been added to your account.' : 'Кредиты успешно зачислены.');
    } finally { p.dom.window.close(); }
  }
  const start = await page(lang, 'codex-250', 'issued');
  try {
    const value = JSON.stringify({ accessToken: 'fixture-not-a-real-token', user: { email: 'fixture@example.invalid' } });
    start.get('tokenInput').value = value;
    start.get('tokenInput').dispatchEvent(new start.w.Event('input', { bubbles: true }));
    const validation = start.timers.filter(t => t.active && t.ms < 1000).at(-1);
    assert.ok(validation); await validation.fn(); await flush();
    assert.equal(start.get('startBtn').disabled, false, `${lang}: validated fixture can start the top-up`);
    start.get('startBtn').click(); await flush();
    assert.match(start.get('statusText').textContent, start.en ? /Adding credits/ : /Пополняем кредиты/);
    assert.equal(start.requests.filter(x => x.url.endsWith('/activation/start')).length, 1);
    assert.equal(JSON.parse(start.requests.find(x => x.url.endsWith('/activation/start')).body).token, value);
  } finally { start.dom.window.close(); }
  const subscription = await page(lang, 'chatgpt-plus-1');
  try {
    if (!subscription.en) {
      assert.match(subscription.get('statusText').textContent, /Подключаем подписку/);
      assert.equal(subscription.get('activationProgress').querySelector('[data-activation-step="process"]').textContent, 'Подключение');
    }
    subscription.task('success'); subscription.get('checkBtn').click(); await flush();
    assert.doesNotMatch(subscription.get('statusText').textContent, /кредит|credits/i);
    assert.doesNotMatch(subscription.get('reviewRewardTitle').textContent, /кредит|credits/i);
  } finally { subscription.dom.window.close(); }
}
const stockWaitCases = [
  ...['codex-250', 'codex-500', 'codex-1000', 'claude-pro'].map(slug => ({ slug, initial: 'queued' })),
  { slug: 'chatgpt-plus-1', initial: 'queued', iosKeyWait: true },
  { slug: 'chatgpt-plus-1', initial: 'issued', iosKeyWait: true },
];
for (const lang of ['ru', 'en', 'legacy-en']) {
  for (const { slug, initial, iosKeyWait } of stockWaitCases) {
    const p = await page(lang, slug, initial, { iosKeyWait });
    try {
      if (initial === 'issued') {
        p.get('tokenInput').value = JSON.stringify({ accessToken: 'fixture-access', account: { planType: 'plus' } });
        p.get('tokenInput').dispatchEvent(new p.w.Event('input', { bubbles: true }));
        const validation = p.timers.filter(timer => timer.active && timer.ms < 1000).at(-1);
        assert.ok(validation);
        await validation.fn(); await flush();
        p.get('startBtn').click(); await flush();
        assert.equal(p.requests.filter(request => request.url.endsWith('/activation/start')).length, 1);
      }
      const priorPosts = p.requests.filter(request => request.method === 'POST').length;
      const poll = p.intervals.find(timer => timer.active);
      assert.ok(poll, `${lang} ${slug}: queued order status is checked automatically`);
      const waitingMessage = p.get('statusText').textContent;
      assert.match(waitingMessage, p.en ? /Request received/ : /Заявка принята/);
      const now = p.w.Date.now();
      p.w.Date.now = () => now + 60 * 60 * 1000;
      await poll.fn(); await flush();
      assert.equal(poll.active, true);
      assert.equal(p.get('statusText').textContent, waitingMessage);
      assert.equal(p.get('statusSpinner').style.display, 'inline-block');
      assert.equal(p.get('startBtn').disabled, true);
      assert.ok(!p.requests.some(request => request.url.includes('/activation/task/')));

      p.state('processing');
      await poll.fn(); await flush();
      assert.equal(poll.active, true, 'Wait for a result using a fresh activation deadline');
      await poll.fn(); await flush();
      assert.ok(p.requests.some(request => request.url.includes('/activation/task/reconcile-fixture-copy')));
      p.task('success');
      await poll.fn(); await flush();
      assert.equal(p.get('statusBox').classList.contains('success'), true);
      assert.equal(poll.active, false);
      assert.equal(p.requests.filter(request => request.method === 'POST').length, priorPosts);
    } finally { p.dom.window.close(); }
  }
}
console.log('Codex, Claude Pro and ChatGPT Plus iOS activation pages: localized status, long key wait, automatic task pickup, and completion passed using mocked transports.');
