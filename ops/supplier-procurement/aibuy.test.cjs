'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {start,status,isRoute}=require('./aibuy-activation.cjs');
function response(d){return {ok:true,text:async()=>JSON.stringify(d)}}
const unused={ok:true,workflow:'codex_500',status:'unused'};
test('provider requires the exact denomination and a never-used key before dispatch',async()=>{
 let submits=0,claims=0;
 for(const verify of [{...unused,workflow:'codex_250'},{...unused,status:'done'},{...unused,job_id:'old-job'},{...unused,ok:false}]){
  await assert.rejects(start({cdk:'isolated-fixture',productKey:'codex-500',userCandidates:['{"account":{"planType":"plus"}}'],beforeSubmit:()=>claims++},{fetchImpl:async url=>{if(url.includes('activate'))submits++;return response(verify)}}));
 }
 assert.equal(submits,0);assert.equal(claims,0);
});
test('a lost activation response retains the durable claim and never retries activate',async()=>{
 const events=[];
 const result=await start({cdk:'isolated-fixture',productKey:'codex-500',userCandidates:['{"account":{"planType":"plus"}}'],beforeSubmit:()=>events.push('claim')},{now:()=>1700000000000,fetchImpl:async(url,opts)=>{
  const d=JSON.parse(opts.body);assert.equal(d.code,'isolated-fixture');
  if(url.includes('verifyCdk'))return response(unused);
  events.push('activate');assert.equal(d.product,'gpt');throw Error('timeout');
 }});
 assert.deepEqual(events,['claim','activate']);assert.equal(result.ok,true);assert.equal(result.immediateSuccess,false);assert.match(result.taskId,/^reconcile-/);
});
test('success is confirmed by final provider result; pending and unused are never success',async()=>{
 for(const d of [{ok:true,status:'unused'},{ok:true,status:'processing',job_id:'job'},{ok:true,status:'done',final:false}]){
  const r=await status('fixture','codex-500',async()=>response(d));assert.notEqual(r.json.recharge_status,'success');
 }
 const r=await status('fixture','codex-500',async()=>response({ok:true,status:'done',final:true,workflow:'codex_500',job_id:'job'}));assert.equal(r.json.recharge_status,'success');
 await assert.rejects(status('fixture','codex-500',async()=>response({ok:true,status:'done',final:true,workflow:'codex_250'})));
});
test('route is exact HTTPS origin and no other subscription is redirected',()=>{
 assert.equal(isRoute('https://aichongzhi.fun'),true);assert.equal(isRoute('https://aichongzhi.fun.attacker.test'),false);assert.equal(isRoute('http://aichongzhi.fun'),false);
});
test('AI-BUY demand cutoff excludes older paid orders',()=>{
 const {managed}=require('./aibuy-live.cjs');
 const p={enabled:true,enabledAfter:'2026-10-24T20:00:00Z'};
 const order={source:'site',createdAt:'2026-10-24T19:59:59Z',items:[{product:{slug:'codex-1000'}}]};
 assert.equal(managed(p,order),false);order.createdAt='2026-10-24T20:01:00Z';assert.equal(managed(p,order),true);
 order.items[0].product.slug='chatgpt-plus-1';assert.equal(managed(p,order),false);
});

function prepaidFixture(){
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const now=Date.now(),audits=[],keys=[],events=[];
 const cutoff=new Date(now-60000).toISOString();
 const policy={enabled:true,enabledAfter:cutoff,prepaidAieeFallback:{enabled:true,enabledAfter:cutoff}};
 const order={id:'cfixturewebsitepaidorder0001',source:'site',status:'PAID',currency:'RUB',createdAt:new Date(now-40000),totalAmount:'6000',email:'fixture@example.invalid',items:[{quantity:1,product:{slug:'codex-1000'}}],licenseKeys:keys,payments:[{status:'SUCCESS',provider:'pally',currency:'RUB',amount:'6000',processedAt:new Date(now-20000),payload:{commission:'180'}}]};
 const activation={orderId:order.id,status:'issued',attempts:0,clientTokenCiphertext:'fixture-encrypted',clientTokenExpiresAt:new Date(now+3600000).toISOString(),tokenMeta:{fingerprint:'a'.repeat(16)}};
 const db={order:{findUnique:async()=>order},licenseKey:{findUnique:async({where})=>keys.find(k=>k.keyValue===where.keyValue),create:async({data})=>{const k={id:'fixture-reserve-key',...data};keys.push(k);return k}},licenseKeyAuditLog:{findFirst:async({where})=>audits.find(x=>x.keyId===where.keyId&&where.action.in.includes(x.action)),create:async({data})=>audits.push(data)},$transaction:async fn=>fn(db)};
 const mod={exports:{}};
 class Journal{async initialize(){} async run(){} async close(){}}
 const real=require('./aisou-live.cjs');
 const context={module:mod,Date,console,require:id=>{
  if(id==='node:fs')return {mkdirSync(){}};
  if(id==='node:path')return path;
  if(id==='node:net')return {};
  if(id==='./aisou-core.cjs')return {Journal};
  if(id==='./aisou-live.cjs')return real;
  if(id==='./aibuy-contract.cjs')return require(id);
  if(id==='./funds-wait.cjs')return {resolve:async()=>events.push('resolved')};
  throw Error('unexpected dependency');
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'aibuy-live.cjs'),'utf8'),context);
 const result={state:'prepaid_fallback',source:'owner_prepaid_aiee',credits:1000,code:'ISOLATED-AIEE-RESERVE-1000',fallback_id:'a'.repeat(64),amount_minor:27600,usdt_minor:4140,purchased_on:'2026-10-24',activationSiteUrl:'https://aiee.fun',primary_sealed_no_charge:true};
 const settings={policy:{enabled:true,products:['codex-1000'],enabledAfter:cutoff,rubPerCny:13.2,costCheckedAt:new Date(now).toISOString(),costMaxAgeMs:86400000,minimumProfitRub:0,costSource:'fixture-owner'},encryptionKey:Buffer.alloc(32,1)};
 let dispatches=0;
 const args={prisma:db,activationStore:{findByOrderId:()=>activation},orderId:order.id,productKey:'codex-1000',accountPlan:'plus',suppliedPolicy:policy,suppliedSettings:settings,transport:async()=>{dispatches++;return result}};
 return {api:mod.exports,args,order,activation,policy,result,keys,audits,settings,events,dispatches:()=>dispatches};
}

test('prepaid AIEE fallback preserves the existing native route, acquisition cost and restart binding',async()=>{
 const f=prepaidFixture(),first=await f.api.procure(f.args),second=await f.api.procure(f.args);
 assert.equal(first.activationSiteUrl,'https://aiee.fun');assert.equal(second.code,first.code);
 assert.equal(f.dispatches(),1);assert.equal(f.keys.length,1);assert.equal(f.audits.length,1);
 assert.equal(f.audits[0].action,'aiee_prepaid_fallback');
 assert.equal(f.audits[0].meta.amountCny,276);assert.equal(f.audits[0].meta.amountUsdt,41.4);
 assert.equal(f.audits[0].meta.costRub,3643.2);assert.equal(f.audits[0].meta.primarySealedNoCharge,true);
});

for(const [credits,amount] of [[250,7500],[500,14500],[1000,27600]])test(`AI-BUY ${credits} purchase binds one exact native key and restart reuses its acquisition`,async()=>{
 const f=prepaidFixture(),productKey=`codex-${credits}`;
 f.order.items[0].product.slug=productKey;f.settings.policy.products=[productKey];
 Object.assign(f.result,{state:'assigned',credits,code:`ISOLATED-AIBUY-KEY-${credits}`,amount_minor:amount,trade_no:'20000000000000',activationSiteUrl:'https://aichongzhi.fun'});
 f.args.productKey=productKey;
 const first=await f.api.procure(f.args),again=await f.api.procure(f.args);
 assert.equal(first.code,f.result.code);assert.equal(again.code,first.code);assert.equal(first.activationSiteUrl,'https://aichongzhi.fun');
 assert.equal(f.dispatches(),1);assert.equal(f.keys.length,1);assert.equal(f.audits.length,1);
 assert.equal(f.keys[0].productKey,productKey);assert.equal(f.audits[0].action,'aibuy_purchase');assert.equal(f.audits[0].meta.amountCny,amount/100);
});

test('fallback rejects wrong product, unsealed primary, invalid provenance, old payments and stale margin',async()=>{
 const mutations=[
  [f=>f.result.credits=500,/fallback_unverified/],[f=>f.result.primary_sealed_no_charge=false,/fallback_unverified/],
  [f=>f.result.activationSiteUrl='https://aichongzhi.fun',/fallback_unverified/],[f=>f.result.source='unknown',/fallback_unverified/],
  [f=>f.result.amount_minor=27601,/fallback_unverified/],[f=>f.policy.prepaidAieeFallback.enabled=false,/fallback_unverified/],
  [f=>f.policy.prepaidAieeFallback.enabledAfter=new Date(Date.now()-30000).toISOString(),/fallback_old_order/],
  [f=>{f.policy.prepaidAieeFallback.enabledAfter=new Date(Date.now()-10000).toISOString();f.order.createdAt=new Date();},/fallback_old_order/],
  [f=>f.settings.policy.costCheckedAt='2000-01-01',/cost_unconfirmed/],
  [f=>{f.order.totalAmount='100';f.order.payments[0].amount='100';f.order.payments[0].payload.commission='3';},/margin_hold/],
  [f=>{f.activation.cdk='EXISTING-FIXTURE';f.activation.attempts=1;},/prior_fulfillment/],
 ];
 for(const [change,error] of mutations){const f=prepaidFixture();change(f);await assert.rejects(f.api.procure(f.args),error);assert.equal(f.keys.length,0);assert.equal(f.audits.length,0)}
});

test('Claude Pro requires its own new-order cutoff and binds one item-29 acquisition across restart',async()=>{
 const f=prepaidFixture(),product='claude-pro';
 f.order.items[0].product.slug=product;f.args.productKey=product;f.args.accountPlan='';
 assert.equal(f.api.managed(f.policy,f.order),false,'Codex cutoff never silently enables Claude');
 f.policy.productEnabledAfter={[product]:f.policy.enabledAfter};
 Object.assign(f.result,{state:'assigned',product_key:product,credits:0,code:'ISOLATED-CLAUDE-KEY',amount_minor:13400,trade_no:'20000000000029',activationSiteUrl:'https://aichongzhi.fun'});
 const first=await f.api.procure(f.args),again=await f.api.procure(f.args);
 assert.equal(first.code,again.code);assert.equal(f.dispatches(),1);assert.equal(f.keys.length,1);assert.equal(f.keys[0].productKey,product);
 assert.equal(f.audits[0].action,'aibuy_purchase');assert.equal(f.audits[0].meta.amountCny,134);
});

test('Claude Pro cannot buy for old, unpaid, wrong-quantity, started, unprofitable or mismatched replies',async()=>{
 for(const [change,error] of [
  [f=>f.order.createdAt=new Date(0),null],
  [f=>f.order.status='PENDING',/order_ineligible/],
  [f=>f.order.items[0].quantity=2,/order_ineligible/],
  [f=>f.order.payments[0].status='PROCESSING',/payment_unverified/],
  [f=>f.activation.attempts=1,/prior_fulfillment/],
  [f=>f.activation.clientTokenExpiresAt=new Date(0).toISOString(),/session_required/],
  [f=>{f.order.totalAmount='100';f.order.payments[0].amount='100';f.order.payments[0].payload.commission='3'},/margin_hold/],
  [f=>f.result.credits=250,/reply_invalid/],
  [f=>f.result.product_key='codex-250',/reply_invalid/],
  [f=>f.result.amount_minor=13401,/reply_invalid/],
 ]){
  const f=prepaidFixture();f.args.productKey='claude-pro';f.order.items[0].product.slug='claude-pro';f.policy.productEnabledAfter={'claude-pro':f.policy.enabledAfter};
  Object.assign(f.result,{state:'assigned',product_key:'claude-pro',credits:0,code:'ISOLATED-CLAUDE-KEY',amount_minor:13400,trade_no:'20000000000029',activationSiteUrl:'https://aichongzhi.fun'});
  change(f);if(error)await assert.rejects(f.api.procure(f.args),error);else assert.equal(await f.api.procure(f.args),null);
  assert.equal(f.keys.length,0);assert.equal(f.audits.length,0);
 }
});

test('Claude uses its UUID, canonical unused workflow and one durable activation POST',async()=>{
 const input={cdk:'ISOLATED-CLAUDE-KEY',productKey:'claude-pro',userCandidates:['00000000-0000-4000-8000-000000000029']};
 for(const verified of [{ok:true,status:'unused',workflow:'claude_pro'},{ok:true,status:'unused',workflow:'codex_250'},{ok:true,status:'done',workflow:'claude_pro'}]){
  const events=[];
  const run=()=>start({...input,beforeSubmit:()=>events.push('durable')},{fetchImpl:async(url,opts)=>{
   const body=JSON.parse(opts.body);assert.equal(body.product,'claude');
   if(url.endsWith('verifyCdk'))return response(verified);
   events.push('activate');assert.equal(body.token,input.userCandidates[0]);throw Error('isolated timeout');
  }});
  if(verified.status==='unused'&&verified.workflow==='claude_pro')assert.equal((await run()).immediateSuccess,false);else await assert.rejects(run());
  assert.deepEqual(events,verified.status==='unused'&&verified.workflow==='claude_pro'?['durable','activate']:[]);
 }
 await assert.rejects(start({...input,userCandidates:['wrong'],beforeSubmit(){}},{fetchImpl:()=>{throw Error('must not access provider')}}),/contract/);
 for(const workflow of ['codex_250',undefined])await assert.rejects(status(input.cdk,'claude-pro',async()=>response({ok:true,status:'done',final:true,workflow})),/product_mismatch/);
 const final=await status(input.cdk,'claude-pro',async(url,opts)=>{assert.equal(JSON.parse(opts.body).product,'claude');return response({ok:true,status:'done',final:true,workflow:'claude_pro',job_id:'isolated-job'})});
 assert.equal(final.json.recharge_status,'success');
});

test('independent root DB validator derives Claude item contract and rejects missing UUID or non-Claude stock',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
 const f=prepaidFixture(),product='claude-pro',secret='ISOLATED-TEST-SECRET';
 f.order.items[0].product.slug=product;f.policy.productEnabledAfter={[product]:f.policy.enabledAfter};
 const iv=Buffer.alloc(12,1),key=crypto.createHash('sha256').update('gptishka:activation-token:v1:'+secret).digest();
 function session(token){const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);f.activation.clientTokenCiphertext=Buffer.concat([cipher.update(token),cipher.final()]).toString('base64');f.activation.clientTokenIv=iv.toString('base64');f.activation.clientTokenAuthTag=cipher.getAuthTag().toString('base64')}
 const db={order:{findUnique:async()=>f.order},licenseKey:{findFirst:async({where})=>{assert.equal(where.productKey,product);assert.deepEqual(Array.from(where.activationSiteUrl.in),['https://aichongzhi.fun']);return null}}};
 const mod={exports:{}};
 const real=require('./aisou-live.cjs');
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'aibuy-validate.cjs'),'utf8'),{module:mod,Buffer,Date,process,require:id=>{
  if(id==='node:fs')return {readFileSync:()=>JSON.stringify(f.policy),existsSync:()=>false};
  if(id==='node:crypto')return crypto;
  if(id.endsWith('/config/prisma.js'))return {prisma:db};
  if(id.endsWith('/config/env.js'))return {env:{ACTIVATION_TOKEN_ENCRYPTION_KEY:secret}};
  if(id.endsWith('/orders/activation.store.js'))return {activationStore:{findByOrderId:()=>f.activation}};
  if(id==='./aisou-live.cjs')return {...real,loadSettings:()=>f.settings};
  return require(id);
 }});
 session('00000000-0000-4000-8000-000000000029');
 const result=await mod.exports.validate({order_id:f.order.id});assert.equal(result.credits,0);assert.equal(result.amount_minor,13400);
 session('{"account":{"planType":"plus"}}');await assert.rejects(mod.exports.validate({order_id:f.order.id}),/account_ineligible/);
 session('not-an-account-uuid');await assert.rejects(mod.exports.validate({order_id:f.order.id}),/account_ineligible/);
 session('00000000-0000-4000-8000-000000000029');f.policy.productEnabledAfter={};await assert.rejects(mod.exports.validate({order_id:f.order.id}),/product_disabled/);
});
