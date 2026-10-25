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
