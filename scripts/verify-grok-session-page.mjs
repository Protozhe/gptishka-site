import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { assertAssetReference } from './release-assets.mjs';

const read = path => fs.readFileSync(path, 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const sample = 'eyJ0eXAiOiJKV1QifQ.Zml4dHVyZS1ub3QtYS1yZWFsLXNlc3Npb24.Zml4dHVyZS1zaWduYXR1cmU';
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
for (const file of ['redeem-start.html', 'en/redeem-start.html']) assertAssetReference(read(file), 'assets/css/grok-session-activation.css', file);

async function page(lang, slug, flow = 'grok_sso', compact = false, state = {}) {
  const en = lang !== 'ru', name = (lang === 'en' ? 'en/' : '') + 'redeem-start.html';
  const html = read(name);
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('function validateTokenNow'));
  const errors = [], requests = [], timers = [];
  const output = new VirtualConsole();
  output.on('jsdomError', error => { if (!/Could not parse CSS/.test(error.message)) errors.push(error.message); });
  const dom = new JSDOM(html, { url: `https://fixture.invalid/${name}?lang=${en ? 'en' : 'ru'}&order_id=fixture-grok&t=fixture-access`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: output });
  const w = dom.window, get = id => w.document.getElementById(id);
  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: compact });
  w.setTimeout = w.setInterval = (fn, ms) => { const t = { fn, ms, active: true }; timers.push(t); return t; };
  w.clearTimeout = w.clearInterval = t => { if (t) t.active = false; };
  w.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET', body: options.body });
    if (String(url).includes('/store-token') || String(url).includes('/validate-token')) {
      const data = JSON.parse(options.body), token = JSON.parse(data.token);
      const valid = token.sso === sample && Object.keys(token).length === 1;
      assert.equal(data.orderToken, 'fixture-access');
      return response({ ok: valid, message: valid ? '' : 'Paste the sso cookie value', reasons: valid ? [] : ['Paste the sso cookie value'] }, valid ? 200 : 400);
    }
    if (String(url).endsWith('/activation/start')) {
      if (state.queueOnStart) { state.phase = 'queued'; return response({taskId:'',queued:true}); }
      return response({ taskId: 'fixture-grok-task' });
    }
    if (String(url).includes('/activation/task/')) {
      const success = state.phase === 'success';
      return response({ pending: !success, success });
    }
    return response({ deliveryMode: flow === 'grok_account_id' ? 'support' : 'activation', activationFlow: flow, product: slug, productSlug: slug, productTitle: slug,
      status: state.phase === 'success' ? 'success' : state.phase === 'processing' ? 'processing' : 'issued',
      queued: state.phase === 'queued', taskId: state.phase === 'processing' ? 'fixture-grok-task' : '' });
  };
  w.eval(script); await flush();
  assert.deepEqual(errors, []);
  return { dom, w, get, en, requests, timers, errors, state };
}

for (const lang of ['ru', 'en', 'legacy-en']) {
  const p = await page(lang, 'grok-premium-1', 'grok_sso', false, {queueOnStart:true});
  try {
    p.get('tokenInput').value = sample;
    p.get('tokenInput').dispatchEvent(new p.w.Event('input',{bubbles:true}));
    await p.timers.filter(t=>t.active&&t.ms<1000).at(-1).fn();await flush();
    p.get('startBtn').click();await flush();
    assert.match(p.get('statusText').textContent,p.en?/Request received/:/Заявка принята/);
    assert.doesNotMatch(p.get('statusText').textContent,/ключ|CDK|AISOU|stock|\bkey\b/i);
    assert.equal(p.get('startBtn').disabled,true);
    p.get('startBtn').click();await flush();
    assert.equal(p.requests.filter(r=>r.url.endsWith('/activation/start')).length,1);
    const poll=p.timers.filter(t=>t.active&&t.ms===2000).at(-1);
    assert.ok(poll,'Waiting for inventory must keep the existing client poll active');
    await poll.fn();await flush();
    assert.ok(p.requests.at(-1).url.includes('/activation?t=fixture-access'));
    assert.ok(!p.requests.some(r=>r.url.includes('/task/?')),'Do not query an empty provider task');
    const waitingMessage = p.get('statusText').textContent;
    const startedAt = p.w.Date.now();
    p.w.Date.now = () => startedAt + 60 * 60 * 1000;
    await poll.fn();await flush();
    assert.ok(poll.active, 'Keep checking the order after the normal activation timeout');
    assert.equal(p.get('statusText').textContent, waitingMessage);
    assert.equal(p.get('statusSpinner').style.display, 'inline-block');
    p.state.phase='processing';await poll.fn();await flush();
    assert.ok(poll.active, 'Start the activation timeout when the task appears');
    await poll.fn();await flush();
    assert.ok(p.requests.some(r=>r.url.includes('/activation/task/fixture-grok-task')));
    p.state.phase='success';await poll.fn();await flush();
    assert.equal(p.get('statusBox').classList.contains('success'), true);
    assert.equal(poll.active, false);
    assert.equal(p.requests.filter(r=>r.url.endsWith('/activation/start')).length,1);
    assert.deepEqual(p.errors,[]);
  } finally {p.dom.window.close();}
  const restored=await page(lang,'grok-plus-1','grok_sso',false,{phase:'queued'});
  try {
    assert.equal(restored.get('startBtn').disabled,true);
    assert.equal(restored.requests.filter(r=>r.method==='POST').length,0);
    restored.state.phase='success';
    await restored.timers.filter(t=>t.active&&t.ms===2000).at(-1).fn();await flush();
    assert.match(restored.get('statusText').textContent,restored.en?/success/i:/успешно/i);
    assert.equal(restored.requests.filter(r=>r.url.endsWith('/activation/start')).length,0);
    assert.deepEqual(restored.errors,[]);
  } finally {restored.dom.window.close();}
}

for (const lang of ['ru', 'en', 'legacy-en']) for (const plan of ['plus', 'premium', 'super', 'ultra']) {
  const p = await page(lang, `grok-${plan}-1`);
  try {
    assert.equal(p.w.document.body.classList.contains('redeem-grok-sso'), true);
    assert.match(p.get('tokenGuideSummary').textContent, p.en ? /How to get your Grok session/ : /Как получить сессию Grok/);
    assert.equal(p.get('tokenLabel').textContent, p.en ? 'Plan activation' : 'Подключение тарифа');
    const guide = p.get('tokenGuideList');
    const screenshot = guide.querySelector('.grok-session-screenshot');
    assert.ok(screenshot, 'the screenshot is available inside a native disclosure');
    assert.equal(screenshot.open, false, 'the screenshot starts collapsed');
    assert.match(screenshot.querySelector('summary').textContent, /sso/);
    assert.ok(screenshot.querySelector('img'));
    assert.doesNotMatch(guide.textContent, /Сессия Grok|Grok session field/);
    assert.equal(guide.children.length, 4);
    assert.match(guide.textContent, /F12/); assert.match(guide.textContent, /Application/); assert.match(guide.textContent, /Cookies/); assert.match(guide.textContent, /sso/);
    assert.doesNotMatch(guide.innerHTML, /chatgpt\.com|api\/auth\/session|account ID|ID аккаунта/);
    assert.equal(guide.querySelector('a').href, 'https://grok.com/');
    assert.equal(guide.querySelector('img').getAttribute('src'), '/assets/img/grok-session-guide-v1.png');
    const zoom = guide.querySelector('.grok-session-figure__zoom');
    assert.equal(zoom.getAttribute('href'), '/assets/img/grok-session-guide-v1.png');
    assert.equal(zoom.getAttribute('target'), '_blank');
    assert.match(zoom.getAttribute('rel'), /noopener/);
    assert.equal(p.get('startBtn').closest('.grok-session-form'), p.get('tokenInput').closest('.grok-session-form'));
    assert.equal(p.w.document.querySelectorAll('.grok-session-form').length, 1);
    assert.equal(p.get('tokenInput').classList.contains('masked'), true);
    assert.equal(p.get('tokenInput').getAttribute('aria-labelledby'), 'tokenLabel');
    assert.equal(p.get('startBtn').disabled, true, 'empty session cannot start an activation');
    assert.equal(p.requests.filter(request => request.method === 'POST').length, 0, 'do not submit an empty session on page load');
    p.get('tokenInput').value = sample;
    p.get('tokenInput').dispatchEvent(new p.w.Event('input', { bubbles: true }));
    const validation = p.timers.filter(t => t.active && t.ms < 1000).at(-1);
    assert.ok(validation); await validation.fn(); await flush();
    assert.equal(p.get('startBtn').disabled, false, `${lang}/${plan}: validated Grok session can start`);
    p.get('startBtn').click(); await flush();
    const starts = p.requests.filter(request => request.url.endsWith('/activation/start'));
    assert.equal(starts.length, 1);
    assert.deepEqual(JSON.parse(JSON.parse(starts[0].body).token), { sso: sample });
    assert.equal(JSON.parse(starts[0].body).orderToken, 'fixture-access');
    assert.equal(p.get('startBtn').disabled, true, 'submitted activation cannot be started twice');
    p.get('startBtn').click(); await flush();
    assert.equal(p.requests.filter(request => request.url.endsWith('/activation/start')).length, 1);
    assert.equal([...Array(p.w.localStorage.length)].some((_, index) => String(p.w.localStorage.getItem(p.w.localStorage.key(index))).includes(sample)), false);
    assert.deepEqual(p.errors, []);
  } finally { p.dom.window.close(); }
}

for (const lang of ['ru', 'en']) {
  const compact = await page(lang, 'grok-plus-1', 'grok_sso', true);
  try {
    assert.equal(compact.get('tokenGuideSummary').closest('details').open, false, 'compact screens start with the full guide collapsed');
    assert.equal(compact.w.document.querySelector('.grok-session-screenshot').open, false);
    assert.ok(compact.get('startBtn').closest('.grok-session-form'));
    assert.equal(compact.requests.filter(request => request.method === 'POST').length, 0);
  } finally { compact.dom.window.close(); }
  const invalid = await page(lang, 'grok-plus-1');
  try {
    invalid.get('tokenInput').value = 'e191659c-0258-4be3-951a-e1cbffa3322f';
    invalid.get('tokenInput').dispatchEvent(new invalid.w.Event('input', { bubbles: true }));
    const timer = invalid.timers.filter(t => t.active && t.ms < 1000).at(-1);
    assert.ok(timer); await timer.fn(); await flush();
    assert.equal(invalid.get('startBtn').disabled, true, 'an account ID is not a Grok session');
    assert.equal(invalid.requests.filter(request => request.url.endsWith('/activation/start')).length, 0);
  } finally { invalid.dom.window.close(); }
  const old = await page(lang, 'supergrok-1', 'grok_account_id');
  try {
    assert.equal(old.w.document.body.classList.contains('redeem-grok-sso'), false);
    assert.equal(old.w.document.querySelector('.grok-session-form'), null);
    assert.match(old.get('tokenLabel').textContent, /ID/);
    assert.match(old.get('tokenGuideList').innerHTML, /grok\.com\/api\/auth\/session/);
    assert.equal(old.requests.filter(request => request.method === 'POST').length, 0);
  } finally { old.dom.window.close(); }
  const chatgpt = await page(lang, 'chatgpt-plus-1', 'chatgpt_token');
  try {
    assert.equal(chatgpt.w.document.body.classList.contains('redeem-grok-sso'), false);
    assert.equal(chatgpt.w.document.querySelector('.grok-session-form'), null);
    assert.match(chatgpt.get('tokenGuideList').innerHTML, /chatgpt\.com\/api\/auth\/session/);
  } finally { chatgpt.dom.window.close(); }
}

const image = fs.readFileSync('assets/img/grok-session-guide-v1.png');
assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'a valid processed screenshot must be packaged');
assert.equal(image.readUInt32BE(16), 1006);
assert.equal(image.readUInt32BE(20), 1564);
const server = read('server.js');
const route = server.match(/app\.get\(\["\/en\/supergrok-activation", "\/en\/supergrok-activation\.html"\], \(_req, res\) => \{[\s\S]*?\n  \}\);/);
assert.ok(route, 'the English activation alias must be served after language switching');
let served;
vm.runInNewContext(route[0], { app: { get(paths, handler) {
  assert.equal(paths.length, 2);
  handler({}, {});
} }, path, __dirname: '/fixture', sendFreshHtml(_res, file) { served = file; } });
assert.equal(served, path.join('/fixture', 'en', 'redeem-start.html'));
assert.ok(server.slice(0, server.indexOf(']);', server.indexOf('"/redeem-start.html"'))).includes('"/en/supergrok-activation.html"'), 'the English order page remains excluded from indexing');
console.log('Grok session page: all four plans, RU/EN/legacy language, protected sso payload, masked input, single activation, safe illustration and unchanged legacy/ChatGPT flows passed with mocked transports.');
