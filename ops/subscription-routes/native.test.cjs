'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const mod=require('./native-claude.cjs'),{PLANS,data,install}=require('./grok-catalog.cjs');
const now=new Date(),id='fixtureorder000000000001';
function fixture(){
 let a={orderId:id,productKey:'claude-5x-max',externalFulfillmentOwner:mod.OWNER,status:'processing',verificationState:'pending',taskId:'claude-zovo-'+id,attempts:0,clientTokenCiphertext:'encrypted-fixture'},remoteState='absent',submits=0,completes=0,lost=false,events=[];
 const policy={claude:{enabled:true,enabledAfter:new Date(+now-100000).toISOString()}};
 const o={id,source:'site',status:'PAID',currency:'RUB',createdAt:new Date(+now-50000),totalAmount:'12500',email:'fixture@example.invalid',items:[{quantity:1,product:{id:'fixture-product',slug:'claude-5x-max'}}],licenseKeys:[],payments:[{status:'SUCCESS',provider:'pally',currency:'RUB',amount:'12500',processedAt:new Date(+now-10000),payload:{commission:'375'}}]};
 const store={findByOrderId:()=>a,list:()=>[a],upsert:v=>{a=v}};
 const result=()=>({state:remoteState,provider_order_id:remoteState==='absent'?null:'7',provider_status:remoteState==='completed'?'completed':'queued',final_amount_minor:remoteState==='completed'?10000:null,currency:'USD',total_cost_usd_minor:remoteState==='completed'?10600:undefined,return_state:remoteState==='completed'?'confirmed':undefined,returned_usd_minor:400,card_remaining_usd_minor:1});
 const ctx={activationStore:store,prisma:{order:{findUnique:async()=>o}},policy,decrypt:()=>JSON.stringify({sessionKey:'sk-ant-sid02-'+'x'.repeat(50),riskAccepted:true}),lock:async(_,f)=>f(),notify:async text=>events.push(text),complete:async()=>{completes++;a={...a,status:'success',verificationState:'success',clientTokenCiphertext:null}},rpc:async req=>{
   assert.equal(req.product_slug,'claude-5x-max');assert.equal(req.source_id,'gptishka:site:'+id);
   if(req.action==='claude_prepare'){remoteState='prepared';return {ok:true,result:result()}}
   if(req.action==='claude_submit'){submits++;remoteState='processing';if(lost)throw Error('lost reply');return {ok:true,result:result()}}
   return {ok:true,result:result()};
 }};
 return {ctx,o,get a(){return a},get submits(){return submits},get completes(){return completes},events,set remote(v){remoteState=v},set lost(v){lost=v}};
}
test('Claude only accepts trusted new paid exact website orders',()=>{
 const f=fixture();assert.ok(mod.eligible(f.o,f.ctx.policy));
 for(const patch of [{status:'PENDING'},{source:'funpay'},{createdAt:new Date(0)},{currency:'USD'},{items:[{quantity:2,product:{slug:'claude-5x-max'}}]},{orderDetails:{selection:{needsNewAccount:true}}}])assert.equal(mod.eligible({...f.o,...patch},f.ctx.policy),false);
 assert.equal(mod.eligible({...f.o,payments:[{...f.o.payments[0],provider:'stub'}]},f.ctx.policy),false);
});
test('parallel ticks and another status run do not create another Claude payment',async()=>{
 const f=fixture();await Promise.all([mod.tick(f.ctx),mod.tick(f.ctx)]);assert.equal(f.submits,1);
 await mod.tick(f.ctx);assert.equal(f.submits,1);assert.equal(f.completes,0);
 f.remote='completed';await mod.tick(f.ctx);assert.equal(f.submits,1);assert.equal(f.completes,1);assert.equal(f.a.status,'success');assert.equal(f.a.clientTokenCiphertext,null);assert.equal(f.a.lastProviderPayload.claudeZovo.costPending,false);assert.equal(f.events.length,1);
 await mod.tick(f.ctx);assert.equal(f.completes,1);assert.equal(f.events.length,1);
});
test('lost Claude submit reply reconciles the existing provider job instead of resubmitting',async()=>{
 const f=fixture();f.lost=true;await mod.tick(f.ctx);assert.equal(f.submits,1);
 delete require.cache[require.resolve('./native-claude.cjs')];const restarted=require('./native-claude.cjs');
 await restarted.tick(f.ctx);assert.equal(f.submits,1);assert.equal(f.a.status,'processing');
 f.remote='completed';await restarted.tick(f.ctx);assert.equal(f.submits,1);assert.equal(f.completes,1);
});
test('missing fee and another fulfilment block all provider requests',async()=>{
 for(const change of [f=>delete f.o.payments[0].payload.commission,f=>f.o.licenseKeys.push({id:'already-issued'})]){
  const f=fixture();change(f);let calls=0;f.ctx.rpc=async()=>{calls++;throw Error()};await mod.tick(f.ctx);assert.equal(calls,0);assert.equal(f.submits,0);
 }
});

test('only authoritative unfunded preparation may resume, with a five minute backoff',async()=>{
 const f=fixture(),base=f.ctx.rpc;let reads=0,prepares=0;
 f.ctx.rpc=async r=>{
   if(r.action==='claude_status'&&reads++===0)return {ok:true,result:{state:'failed_before_dispatch',can_resume_prepare:true}};
   if(r.action==='claude_prepare')prepares++;
   return base(r);
 };
 await mod.tick(f.ctx);assert.equal(prepares,1);assert.equal(f.submits,1);
 f.ctx.rpc=async()=>({ok:true,result:{state:'failed_before_dispatch',can_resume_prepare:true}});
 await mod.tick(f.ctx);assert.equal(prepares,1);assert.equal(f.submits,1);
 for(const state of ['terminal_failure','funding_uncertain','manual_review']){
   f.ctx.rpc=async r=>{assert.equal(r.action,'claude_status');return {ok:true,result:{state,can_resume_prepare:false}}};
   await mod.tick(f.ctx);assert.equal(f.submits,1);
 }
});
test('Grok uses four independent exact monthly products and approved prices',()=>{
 assert.deepEqual(PLANS.map(x=>x.price),[1012,4587,15313,30635]);
 for(const p of PLANS){const d=data(p);assert.equal(d.currency,'RUB');assert.equal(d.activationVariants.withoutLogin.activationSiteUrl,'https://aiee.fun');assert.equal(d.activationVariants.withLogin.enabled,false);assert.ok(d.tags.includes('month:1'));}
});
test('Grok install is additive, idempotent and preserves every old placement and service card',async()=>{
 const old={id:'old',slug:'supergrok-3',price:'2990'},cards=[{serviceKey:'grok',priceText:'2990 ₽',sortOrder:7}],page={id:'page',slug:'supergrok',serviceKey:'grok',isActive:true,placements:[{id:'old-placement',productId:'old',sortOrder:35}]},rows=[old],visual=[];
 const db={servicePage:{findUnique:async()=>structuredClone(page)},productShowcaseServiceCard:{findMany:async()=>structuredClone(cards)},product:{findMany:async()=>rows.filter(p=>p.slug.startsWith('grok-')),upsert:async({where,create})=>{let p=rows.find(r=>r.slug===where.slug);if(!p){p={id:'key-'+rows.length,...create};rows.push(p)}return p}},productVisualConfig:{upsert:async({where,create})=>{if(!visual.some(x=>x.productId===where.productId))visual.push(create)}},servicePageProductPlacement:{upsert:async({where,create})=>{if(!page.placements.some(x=>x.productId===where.servicePageId_productId.productId))page.placements.push(create)}},$transaction:async fn=>fn(db)};
 const baseline=JSON.stringify({old,cards,placement:page.placements[0]});let backups=0;
 assert.equal((await install(db)).newSlugs.length,4);assert.equal(rows.length,1);
 await install(db,{apply:true,backup:async()=>backups++});await install(db,{apply:true,backup:async()=>backups++});
 assert.equal(rows.length,5);assert.equal(page.placements.length,5);assert.equal(visual.length,4);assert.equal(backups,2);assert.equal(JSON.stringify({old,cards,placement:page.placements[0]}),baseline);
});
