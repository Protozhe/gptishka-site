import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {JSDOM,VirtualConsole} from 'jsdom';
const require=createRequire(import.meta.url),native=require('../ops/subscription-routes/native-claude.cjs');
const html=fs.readFileSync('redeem-start.html','utf8');
for(const file of ['main.js','assets/js/app.js','assets/js/app.min.js']){
 const js=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile('ui.js',js,ts.ScriptTarget.Latest,true),functions=new Map();
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(ast));ts.forEachChild(n,visit)}visit(ast);
 const scope=vm.createContext({isEnPage:false,GROK_ORDER_MODAL_PLAN_KEYS:new Set(['grok-plus','grok-premium','grok-super','grok-ultra']),normalizeAiServiceKey:x=>x,getProductSearchText:x=>[x.slug,x.baseSlug,x.title,...(x.tags||[])].join(' ').toLowerCase(),resolveDeliveryType:x=>x,isStandaloneVpnProduct:()=>false});
 for(const name of ['getServicePlanKey','getServiceDeliveryKey','getServiceDurationKey','getPublicServiceItems','getConstructorFilterOptions'])vm.runInContext(functions.get(name),scope);
 for(const tier of ['plus','premium','super','ultra']){
  const item={baseSlug:'grok-'+tier+'-1',slug:'grok-'+tier+'-1-link',title:'Grok '+tier+' — 1 месяц',activationVariant:'withoutLogin',deliveryType:'activation',tags:['grok','month:1']};
  assert.equal(scope.getServicePlanKey(item,'grok'),'grok-'+tier,file);
  assert.equal(scope.getServiceDeliveryKey(item),'sso',file);
  assert.equal(scope.getPublicServiceItems([item],'grok').length,1,file);
  for(const months of [2,3,12])assert.equal(scope.getPublicServiceItems([{...item,title:'Grok '+tier+' — '+months+' months',tags:['grok','month:'+months]}],'grok').length,0,file+': monthly only');
 }
 const legacy={slug:'supergrok-3-link',title:'SuperGrok',activationVariant:'withoutLogin',tags:['month:1']};
 assert.equal(scope.getServiceDeliveryKey(legacy),'id');assert.equal(scope.getPublicServiceItems([legacy],'grok').length,0,file+': retired offer hidden');
 assert.equal(scope.getPublicServiceItems([{...legacy,slug:'supergrok-heavy-link'}],'grok').length,0);
 assert.deepEqual(Array.from(scope.getConstructorFilterOptions('grok','plan',[]),x=>x.key),['grok-plus','grok-premium','grok-super','grok-ultra']);
 assert.deepEqual(Array.from(scope.getConstructorFilterOptions('grok','duration',[]),x=>x.key),['1m']);
 assert.match(js,/fetchServicePageConfig\('supergrok'\)/,'new plans must load from the actual admin page slug');
}
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('function validateTokenNow'));
const source=fs.readFileSync('apps/admin-backend/src/modules/orders/orders.service.ts','utf8'),tree=ts.createSourceFile('orders.ts',source,ts.ScriptTarget.Latest,true),fns=new Map();
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)fns.set(n.name.text,n.getText(tree));ts.forEachChild(n,walk)}walk(tree);
const validation=vm.createContext({});
for(const n of ['isAisouGrokProduct','validateGrokSsoSession'])vm.runInContext(ts.transpileModule(fns.get(n),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,validation);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function page(payload,url='http://127.0.0.1/redeem-start.html?order_id=fixtureorder0000000001&t=fixture-link'){
 const errors=[],calls=[],requests=[],intervals=[];let clock=Date.now();
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Could not parse CSS/.test(e.message))errors.push(e.message)});
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.Date.now=()=>clock;w.setInterval=(fn)=>{const timer={fn,active:true};intervals.push(timer);return timer};w.clearInterval=t=>{if(t)t.active=false};w.scrollTo=()=>{};
 w.fetch=async(url,options={})=>{
  requests.push(String(url));
  if(String(url).includes('/store-token')){
   const raw=JSON.parse(options.body).token;calls.push(raw);
   const reason=payload.activationFlow==='claude_zovo'?native.validate(raw):payload.activationFlow==='grok_sso'?validation.validateGrokSsoSession({json:JSON.parse(raw)}):'';
   return {ok:!reason,status:reason?400:200,json:async()=>({ok:!reason,message:reason})};
  }
  if(String(url).includes('/activation/task/'))return {ok:true,json:async()=>({pending:true,success:false})};
  return {ok:true,status:200,json:async()=>payload};
 };
 w.eval(script);await sleep(30);
 return {w,dom,errors,calls,requests,intervals,advance:ms=>{clock+=ms}};
}
for(const tier of ['plus','premium','super','ultra']){
 const p=await page(null,'http://127.0.0.1/redeem-start.html?preview=1&service=grok'+tier);
 try{
  const d=p.w.document;
  assert.equal(p.errors.length,0,p.errors.join('\n'));
  assert.match(d.getElementById('tokenGuideList').textContent,/cookie sso/);
  assert.match(d.getElementById('tokenLabel').textContent,/Grok/);
  assert.match(d.getElementById('orderId').textContent,/ПРЕДПРОСМОТР/);
  const input=d.getElementById('tokenInput');input.value='preview-session-not-real';input.dispatchEvent(new p.w.Event('input',{bubbles:true}));await sleep(50);
  assert.equal(d.getElementById('startBtn').disabled,true);
  assert.equal(d.getElementById('checkBtn').disabled,true);
  assert.equal(p.requests.length,0,'preview cannot send order/session requests');
  assert.equal(p.calls.length,0);
  for(let i=0;i<p.w.localStorage.length;i++)assert.ok(!String(p.w.localStorage.getItem(p.w.localStorage.key(i))).includes(input.value));
 }finally{p.dom.window.close()}
}
for(const tier of ['plus','premium','super','ultra']){
 const p=await page({deliveryMode:'activation',activationFlow:'grok_sso',product:'grok-'+tier+'-1',productSlug:'grok-'+tier+'-1',productTitle:'Grok '+tier,status:'issued'});
 try{
  assert.equal(p.errors.length,0,p.errors.join('\n'));assert.match(p.w.document.getElementById('tokenLabel').textContent,/Grok/);
  const guide=p.w.document.getElementById('tokenGuideList').innerHTML;assert.match(guide,/cookie sso/);assert.doesNotMatch(guide,/chatgpt.com/);assert.equal(p.w.document.getElementById('claudeZovoConsentBox').hidden,true);
  if(tier==='plus'){
   const input=p.w.document.getElementById('tokenInput');input.value='eyJ0eXAiABC.fixture.signature';input.dispatchEvent(new p.w.Event('input',{bubbles:true}));await sleep(700);
   assert.ok(p.calls.length);assert.deepEqual(JSON.parse(p.calls.at(-1)),{sso:input.value});
   for(let i=0;i<p.w.localStorage.length;i++)assert.ok(!String(p.w.localStorage.getItem(p.w.localStorage.key(i))).includes(input.value),'SSO must never enter browser storage');
  }
 }finally{p.dom.window.close()}
}
const c=await page({deliveryMode:'activation',activationFlow:'claude_zovo',product:'claude-5x-max',productSlug:'claude-5x-max',productTitle:'Claude Max 5×',status:'issued'});
try{
 assert.equal(c.errors.length,0,c.errors.join('\n'));const d=c.w.document;assert.equal(d.getElementById('claudeZovoConsentBox').hidden,false);assert.match(d.getElementById('tokenGuideList').textContent,/sessionKey/);assert.doesNotMatch(d.getElementById('tokenGuideList').innerHTML,/chatgpt.com/);
 d.getElementById('tokenInput').value='sk-ant-sid02-'+'x'.repeat(50);d.getElementById('tokenInput').dispatchEvent(new c.w.Event('input',{bubbles:true}));await sleep(700);assert.equal(d.getElementById('startBtn').disabled,true);
 d.getElementById('claudeZovoConsent').checked=true;d.getElementById('claudeZovoConsent').dispatchEvent(new c.w.Event('change',{bubbles:true}));await sleep(700);
 assert.equal(JSON.parse(c.calls.at(-1)).riskAccepted,true);assert.equal(d.getElementById('startBtn').disabled,false);
 for(let i=0;i<c.w.localStorage.length;i++)assert.ok(!String(c.w.localStorage.getItem(c.w.localStorage.key(i))).includes('sk-ant-sid'),'Claude session must never enter browser storage');
}finally{c.dom.window.close()}
for(const [slug,minutes] of [['chatgpt-plus-1',30],['chatgpt-go-1',30],['chatgpt-pro-20x-1',30],['codex-250',15]]){
 const p=await page({deliveryMode:'activation',activationFlow:'chatgpt_token',product:slug,productSlug:slug,productTitle:slug,status:'processing',taskId:'reconcile-fixture',verificationState:'pending'});
 try{
  assert.equal(p.errors.length,0,p.errors.join('\n'));const t=p.intervals.find(x=>x.active);assert.ok(t,slug+': processing must keep polling');
  p.advance((minutes-1)*60000);await t.fn();assert.ok(t.active,slug+': no premature support timeout');
  p.advance(2*60000);await t.fn();assert.equal(t.active,false);assert.match(p.w.document.body.textContent,new RegExp('более '+minutes+' минут'));
 }finally{p.dom.window.close()}
}
console.log('Grok SSO, Claude consent/session privacy, exact monthly tiers and ChatGPT 30-minute support delay passed.');
