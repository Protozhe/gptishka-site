import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const helper = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/admin-backend/src/modules/orders/verification-support.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: helper.exports, URL });
const { isVerificationSupportProduct, validateVerificationSupportLink } = helper.exports;
const link = 'https://verify.fixture.invalid/session/fixture?token=fixture%2Bverification';
assert.equal(validateVerificationSupportLink(link), null);
for (const value of ['', 'http://verify.fixture.invalid', 'javascript:alert(1)', 'https://user:pass@verify.fixture.invalid', 'https://gptishka.shop/verification-support.html?t=order', 'https://127.0.0.1/test', 'https://verify.fixture.invalid/has space', 'https://verify.fixture.invalid/'+'x'.repeat(8192)]) assert.ok(validateVerificationSupportLink(value), value);

const source = fs.readFileSync('apps/admin-backend/src/modules/orders/orders.service.ts', 'utf8');
const ast = ts.createSourceFile('orders.ts', source, ts.ScriptTarget.Latest, true), functions = new Map(), methods = new Map();
function visit(n) {
  if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n.getText(ast));
  if (ts.isMethodDeclaration(n)) methods.set(n.name.getText(ast), n.getText(ast));
  ts.forEachChild(n, visit);
}
visit(ast);
class AppError extends Error { constructor(message, status) { super(message); this.status = status; } }
for (const slug of ['claude-kyc', 'claude-cvp', 'claude-kyc-support', 'claude-cvp-support']) {
  let stored = null, writes = 0, paid = true;
  const order = { id: 'fixture-order', email: 'fixture@example.invalid', status: 'PAID' };
  const scope = vm.createContext({
    URL, Date, Buffer, crypto, AppError, isVerificationSupportProduct, validateVerificationSupportLink,
    VERIFICATION_MANAGER_URL: 'https://t.me/gptishkasupport',
    env: { JWT_ACCESS_SECRET: 'fixture-encryption-key-not-production' }, STORED_CLIENT_TOKEN_TTL_MS: 7 * 86400000,
    OrderStatus: { PAID: 'PAID' }, normalizeActivationRecordForRead: x => x,
    activationStore: { findByOrderId: () => stored, upsert: record => { stored = record; writes++; } },
    assertOrderTokenAccess: async (_id, token) => { if (token !== 'fixture-access') throw new AppError('Forbidden', 403); return order; },
    assertPaidOrderAccess: async (_id, token) => { if (token !== 'fixture-access') throw new AppError('Forbidden', 403); if (!paid) throw new AppError('Unpaid', 409); return order; },
    getOrderWithFirstItem: async () => ({ ...order, items: [{ product: { slug, title: slug, tags: [] } }] }),
    resolveOrderDeliveryType: () => 'activation', readActivationSiteUrlFromOrderDetails: () => '',
    withActivationOrderLock: async (_id, fn) => fn(), canonicalProductKey: x => x,
    resolveSuperGrokDurationMonths: () => 1, resolveTokenActivationFlowForProduct: () => 'activation',
    isSupportLikeDeliveryType: () => false, isSupportActivationFlow: () => false,
  });
  const required = ['parseClientTokenInput', 'buildTokenMeta', 'buildStoredClientTokenPatch', 'encryptClientToken', 'deriveClientTokenEncryptionKey', 'hasStoredClientToken', 'isStoredClientTokenExpired', 'decryptStoredClientToken'];
  for (const name of required) vm.runInContext(ts.transpileModule(functions.get(name), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  vm.runInContext(ts.transpileModule(`globalThis.service = {${methods.get('storeActivationClientToken')},${methods.get('getActivation')}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  const read = () => scope.service.getActivation(order.id, 'fixture-access');
  const send = value => scope.service.storeActivationClientToken(order.id, value, 'fixture-access');
  assert.equal((await read()).supportState, 'awaiting_link');
  await assert.rejects(scope.service.storeActivationClientToken(order.id, link, 'wrong'), e => e.status === 403);
  paid = false; await assert.rejects(send(link), e => e.status === 409); paid = true;
  await assert.rejects(send('http://invalid.fixture'), e => e.status === 400);
  assert.equal(writes, 0);
  await send(link);
  assert.equal(writes, 1); assert.equal(scope.decryptStoredClientToken(stored), link);
  assert.equal(JSON.stringify(stored).includes(link), false, 'link must be encrypted at rest');
  assert.equal(stored.cdk, ''); assert.equal(stored.attempts, 0); assert.equal(stored.taskId, null);
  assert.equal(stored.status, 'issued', 'a manual support order must never become a provider task');
  assert.equal(stored.externalFulfillmentOwner, 'verification_support');
  const firstSubmitted = stored.verificationLinkSubmittedAt;
  await send(link); assert.equal(writes, 1, 'duplicate retry must be idempotent');
  await send(link+'&replacement=1'); assert.equal(writes, 2);
  assert.equal(stored.verificationLinkSubmittedAt, firstSubmitted, 'replacement cannot restart the 24-hour window');
  const result = await read(); assert.equal(result.supportState, 'processing');
  assert.equal(JSON.stringify(result).includes('Ciphertext'), false); assert.equal(JSON.stringify(result).includes(link), false);
  stored.status = 'success'; stored.verificationState = 'success';
  assert.equal((await read()).supportState, 'completed');
  await assert.rejects(send(link), e => e.status === 409); assert.equal(writes, 2);
}

const script = fs.readFileSync('assets/js/verification-support-receipt.js', 'utf8');
const flush = async () => { for (let i=0;i<4;i++) await new Promise(resolve => setImmediate(resolve)); };
async function page(lang, slug, initial = 'awaiting_link', responseStatus = 200) {
  const html = fs.readFileSync((lang === 'en' ? 'en/' : '') + 'verification-support.html', 'utf8');
  assert.match(html, /<form id="supportLinkForm" method="post"/, 'verification links must never enter a native GET query');
  const dom = new JSDOM(html, { url: `https://fixture.invalid/${lang === 'en' ? 'en/' : ''}verification-support.html?order_id=fixture-order&t=fixture-access`, runScripts: 'outside-only' });
  const w=dom.window, requests=[], timers=[];
  let state=initial, failure=false;
  w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};w.clearTimeout=()=>{};
  w.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(options.method==='POST') {
      if(failure) throw new Error('fixture-network');
      const body=JSON.parse(options.body);assert.equal(body.token,link);assert.equal(body.orderToken,'fixture-access');state='processing';
      return {ok:true,json:async()=>({ok:true})};
    }
    return {ok:responseStatus===200,status:responseStatus,json:async()=>({deliveryMode:'verification_support',productSlug:slug,status:'paid',supportState:state,submittedAt:new Date(Date.now()-(initial==='overdue'?25:2)*3600000).toISOString()})};
  };
  if(initial==='overdue') state='processing';
  w.eval(script);await flush();
  return {dom,w,requests,timers,get:id=>w.document.getElementById(id),state:value=>{state=value;},fail:()=>{failure=true;}};
}
for (const lang of ['ru','en']) for (const slug of ['claude-kyc','claude-cvp','claude-kyc-support','claude-cvp-support']) {
  const p=await page(lang,slug);
  try {
    assert.equal(p.get('supportPaidDetails').hidden,false);assert.equal(p.get('supportProgress').hidden,true);
    assert.equal(p.get('supportKycLinkExample').hidden, !slug.includes('kyc'));
    const disclosure=p.get('supportKycLinkExample');
    assert.equal(disclosure.tagName,'DETAILS');
    assert.equal(disclosure.open,false,'the complete example starts collapsed');
    assert.ok(disclosure.querySelector('summary'));
    const example=disclosure.querySelector('code');
    const exampleUrl=new URL(example.textContent);
    assert.equal(exampleUrl.hostname,'inquiry.withpersona.com');
    assert.ok(example.textContent.length>=1000,'show a realistic full-length example without truncation');
    assert.match(exampleUrl.searchParams.get('inquiry-id'),/^inq_EXAMPLE_/);
    const token=exampleUrl.searchParams.get('session-token').split('.');
    assert.equal(token.length,3);
    const payload=JSON.parse(Buffer.from(token[1],'base64url').toString());
    assert.equal(payload.iss,'example.invalid');
    assert.ok(payload.exp<946684810,'the example token must have expired long ago');
    assert.equal(payload.inquiry_id,exampleUrl.searchParams.get('inquiry-id'));
    assert.equal(Buffer.from(token[2],'base64url').length,256);
    assert.equal(example.querySelector('a'),null,'the fictional example must not be an active verification link');
    assert.equal(/[А-Яа-я]/.test(p.get('supportKycLinkExampleTitle').textContent),lang==='ru');
    p.get('supportLink').value='http://invalid.fixture';p.get('supportLinkForm').dispatchEvent(new p.w.Event('submit',{cancelable:true}));await flush();
    assert.equal(p.requests.filter(x=>x.options.method==='POST').length,0);
    p.get('supportLink').value=link;p.get('supportLinkForm').dispatchEvent(new p.w.Event('submit',{cancelable:true}));await flush();
    assert.equal(p.get('supportLink').value,'');assert.equal(p.get('supportProgress').hidden,false);assert.equal(p.get('supportLinkForm').hidden,true);
    assert.ok(p.timers.some(x=>x.ms===30000));
    assert.match(p.get('supportProgressText').textContent,/24/);
    p.state('completed');p.get('supportRefresh').click();await flush();
    assert.equal(p.get('supportProgress').classList.contains('is-complete'),true);assert.equal(p.get('supportReplaceLink').hidden,true);
    for(let i=0;i<p.w.localStorage.length;i++) assert.ok(!String(p.w.localStorage.getItem(p.w.localStorage.key(i))).includes(link));
    assert.ok(!p.get('supportContact').href.includes('fixture-access'),'Telegram draft must never include the protected order token');
  }finally{p.dom.window.close();}
}
for(const code of [403,409]) {
  const p=await page('ru','claude-kyc','awaiting_link',code);assert.equal(p.get('supportPaidDetails').hidden,true);assert.equal(p.get('supportRetry').hidden,false);p.dom.window.close();
}
const overdue=await page('ru','claude-kyc','overdue');assert.match(overdue.get('supportProgressText').textContent,/уточнить срок/);assert.equal(overdue.get('supportProgress').classList.contains('is-complete'),false);overdue.dom.window.close();
const failed=await page('en','claude-cvp');failed.fail();failed.get('supportLink').value=link;failed.get('supportLinkForm').dispatchEvent(new failed.w.Event('submit',{cancelable:true}));await flush();assert.equal(failed.get('supportLink').value,link);assert.equal(failed.get('supportProgress').hidden,true);assert.equal(failed.get('supportLinkSubmit').disabled,false);failed.dom.window.close();
console.log('Verification workspace: RU/EN, all four SKUs, paid access, encrypted/idempotent storage, recovery, completion and 24-hour progress verified with fixtures only.');
