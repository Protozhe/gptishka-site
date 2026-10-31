'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),crypto=require('node:crypto');
const m=require('./native-grok.cjs');
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const raw=encode({alg:'HS256',typ:'JWT'})+'.'+encode({session_id:'00000000-0000-4000-8000-000000000001'})+'.fixtureSignature';
const id='fixtureorder0000000000001',date=new Date(Date.now()-1000).toISOString();
function fixture(slug='grok-plus-1',source='telegram'){
 const record={orderId:id,externalFulfillmentOwner:m.OWNER,status:'processing',verificationState:'pending',attempts:0,lastProviderPayload:{}};
 const store=new Map([[id,record]]),calls=[],notices=[];let remote='absent',submits=0,complete=0,lost=false;
 const order={id,source,status:'PAID',currency:'RUB',totalAmount:'1012',createdAt:date,paymentMethod:'pally',email:'fixture@telegram.invalid',items:[{quantity:1,product:{id:'fixture-product',slug}}],licenseKeys:[],payments:[{status:'SUCCESS',currency:'RUB',amount:'1012',provider:'pally',createdAt:date,payload:{commission:'40.48'}}]};
 const ctx={policy:{grok:{enabled:true,enabledAfter:new Date(Date.now()-10000).toISOString()}},prisma:{order:{findUnique:async()=>order}},activationStore:{findByOrderId:k=>store.get(k),upsert:r=>store.set(r.orderId,r),list:()=>[...store.values()]},decrypt:()=>raw,lock:async(k,fn)=>fn(),notify:async text=>notices.push(text),complete:async k=>{complete++;store.set(k,{...store.get(k),status:'success',verificationState:'success'})},rpc:async r=>{
  calls.push(r);
  if(r.action==='grok_status')return {ok:true,result:{state:remote}};
  if(r.action==='grok_prepare'){assert.equal(r.order.order_source,source);assert.equal(r.order.product_slug,slug);assert.equal(r.order.email,m.identity(raw));remote='prepared';return {ok:true,result:{state:remote}}}
  if(r.action==='grok_submit'){submits++;remote='uncertain';if(lost)throw Error('lost reply');remote='processing';return {ok:true,result:{state:remote}}}
  if(r.action==='grok_poll'){remote='completed';return {ok:true,result:{state:'completed',provider_order_id:'77',provider_status:'completed',final_amount_minor:800,currency:'USD',total_cost_usd_minor:815,return_state:'confirmed'}}}
  if(r.action==='grok_receipt')return {ok:true,result:{state:'completed',provider_order_id:'77',total_cost_usd_minor:815,returned_usd_minor:190,card_remaining_usd_minor:10}};
  throw Error('unexpected action');
 }};
 return {ctx,order,store,calls,notices,get submits(){return submits},get complete(){return complete},set lost(v){lost=v}};
}
test('only four monthly Grok products use paid site/Telegram scope',()=>{
 for(const slug of m.SLUGS)for(const source of ['site','telegram']){const f=fixture(slug,source);assert.equal(m.eligible(f.order,f.ctx.policy),true)}
 const f=fixture();for(const patch of [{status:'CREATED'},{source:'funpay'},{currency:'USD'},{items:[{quantity:2,product:{slug:'grok-plus-1'}}]},{items:[{quantity:1,product:{slug:'supergrok'}}]},{paymentMethod:'stub'}])assert.equal(m.eligible({...f.order,...patch},f.ctx.policy),false);
 const old={...f.order,createdAt:'2026-01-01T00:00:00Z'};assert.equal(m.eligible(old,f.ctx.policy),false);
 assert.equal(m.eligible(old,{grok:{...f.ctx.policy.grok,existingOrderIds:[id]}}),true);
});
test('Grok SSO accepts raw and customer-form JSON without retaining other credentials',()=>{
 assert.equal(m.normalize(raw),raw);assert.equal(m.normalize(JSON.stringify({sso:raw})),raw);assert.equal(m.validate(raw),'');
 for(const bad of ['uuid-only','sk-ant-sid02-fixture',JSON.stringify({accessToken:raw}),encode({alg:'RS256'})+'.'+encode({session_id:'00000000-0000-4000-8000-000000000001'})+'.signature',encode({alg:'HS256'})+'.'+encode({session_id:'00000000-0000-4000-8000-000000000001',exp:1})+'.signature'])assert.notEqual(m.validate(bad),'');
 assert.ok(!m.identity(raw).includes(raw));
});
test('each exact monthly product is prepared, dispatched and receipted once',async()=>{
 for(const slug of m.SLUGS){const f=fixture(slug);await m.tick(f.ctx);await m.tick(f.ctx);assert.equal(f.submits,1);assert.equal(f.complete,1);assert.equal(f.store.get(id).attempts,1);assert.equal(m.state(f.store.get(id)).costPending,false);assert.equal(f.notices.length,1)}
});
test('lost submit response reads the existing remote attempt without another submit',async()=>{
 const f=fixture();f.lost=true;await m.tick(f.ctx);assert.equal(f.submits,1);await m.tick(f.ctx);assert.equal(f.submits,1);assert.equal(f.complete,1);assert.equal(f.calls.filter(r=>r.action==='grok_prepare').length,1);
});
test('a provider card decline stops the native order and never dispatches again',async()=>{
 const f=fixture();f.ctx.rpc=async r=>{f.calls.push(r);return {ok:true,result:{state:'terminal_failure',provider_status:'declined',provider_order_id:'77'}}};
 await m.tick(f.ctx);await m.tick(f.ctx);
 const a=f.store.get(id);assert.equal(a.status,'failed');assert.equal(a.verificationState,'failed');assert.equal(m.state(a).reason,'card_declined');assert.equal(m.state(a).providerOrderId,'77');assert.match(a.lastProviderMessage,/Банк отклонил/);assert.equal(f.submits,0);assert.equal(f.complete,0);assert.equal(f.notices.length,1);assert.equal(f.calls.length,1);
});
test('a decline discovered during polling is immediately visible as a failed activation',async()=>{
 const f=fixture(),base=f.ctx.rpc;f.ctx.rpc=async r=>r.action==='grok_poll'?{ok:true,result:{state:'terminal_failure',provider_status:'declined',provider_order_id:'77'}}:base(r);
 await m.tick(f.ctx);await m.tick(f.ctx);assert.equal(f.submits,1);assert.equal(f.store.get(id).status,'failed');assert.equal(f.notices.length,1);
});
test('temporary gateway contention stays quiet, warns once after two minutes and clears on recovery',async()=>{
 const f=fixture(),base=f.ctx.rpc;let now=Date.now(),unavailable=true;f.ctx.now=()=>now;
 f.ctx.rpc=async r=>{if(unavailable)throw Error('busy gateway');return base(r)};
 await m.tick(f.ctx);assert.equal(f.notices.length,0);now+=60000;await m.tick(f.ctx);assert.equal(f.notices.length,0);now+=60000;await m.tick(f.ctx);assert.equal(f.notices.length,1);now+=60000;await m.tick(f.ctx);assert.equal(f.notices.length,1);
 unavailable=false;await m.tick(f.ctx);assert.equal(m.state(f.store.get(id)).reason,null);assert.equal(m.state(f.store.get(id)).transientFailure,null);assert.equal(f.complete,1);assert.equal(f.submits,1);
});
test('wrong currency and missing receipt never confirm successful fulfillment',async()=>{
 for(const patch of [{currency:'PHP'},{provider_status:'running'},{provider_order_id:null}]){const f=fixture();const base=f.ctx.rpc;f.ctx.rpc=async r=>r.action==='grok_poll'?{ok:true,result:{state:'completed',provider_order_id:'77',provider_status:'completed',final_amount_minor:800,currency:'USD',...patch}}:base(r);await m.tick(f.ctx);assert.equal(f.complete,0)}
});
test('assigned CDKs and completed legacy fulfillment cannot start a card payment',async()=>{
 const f=fixture();f.order.licenseKeys=[{id:'fixture-key'}];await m.tick(f.ctx);assert.equal(f.calls.length,0);assert.equal(f.submits,0);
});
test('a failed old order cannot starve later orders in the Grok queue',async()=>{
 const f=fixture();f.store.clear();for(let i=0;i<8;i++){const orderId='fixtureorder'+String(i).padStart(14,'0');f.store.set(orderId,{orderId,externalFulfillmentOwner:m.OWNER,status:'processing',verificationState:'pending',lastProviderPayload:{}})}
 const visited=new Set();f.ctx.prisma.order.findUnique=async({where})=>{visited.add(where.id);throw Error('isolated transient failure')};await m.tick(f.ctx);await m.tick(f.ctx);assert.equal(visited.size,8);assert.equal(f.calls.length,0);
});
test('real native start accepts the Grok customer form, persists once and refuses another account',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const source=fs.readFileSync('apps/admin-backend/src/modules/orders/orders.service.ts','utf8'),ast=ts.createSourceFile('orders.ts',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='startActivationUnsafe');assert.ok(fn);
 const store=new Map([[id,{orderId:id,externalFulfillmentOwner:m.OWNER,status:'issued',attempts:0}]]);let ticks=0;
 class AppError extends Error{constructor(message,status){super(message);this.status=status}}
 const context={exports:{},Buffer,Date,JSON,AppError,GROK_ZOVO_OWNER:m.OWNER,
  ordersService:{getActivation:async()=>({activationFlow:'grok_sso'}),resumeGrokZovoJobs:async()=>{ticks++}},
  assertTokenActivationDeliveryMode:()=>{},isGrokZovoOrder:async()=>true,validateGrokZovoSession:m.validate,normalizeGrokZovoSession:m.normalize,
  activationStore:{findByOrderId:k=>store.get(k),upsert:r=>store.set(r.orderId,r)},
  parseClientTokenInput:x=>x,buildTokenMeta:x=>({fingerprint:crypto.createHash('sha256').update(x).digest('hex')}),buildStoredClientTokenPatch:()=>({clientTokenCiphertext:'fixture-encrypted'}),
  isTokenBoundToAnotherFingerprint:(a,b)=>!!a?.fingerprint&&a.fingerprint!==b.fingerprint,
 };
 vm.runInNewContext(ts.transpileModule(fn.getText(ast)+'\nexports.start=startActivationUnsafe;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const first=await context.exports.start(id,JSON.stringify({sso:raw}),undefined,true);assert.equal(first.reused,false);assert.equal(store.get(id).status,'processing');assert.equal(ticks,1);
 const repeated=await context.exports.start(id,raw,undefined,true);assert.equal(repeated.reused,true);assert.equal(ticks,1);
 const another=encode({alg:'HS256'})+'.'+encode({session_id:'00000000-0000-4000-8000-000000000002'})+'.fixtureSignature';
 await assert.rejects(()=>context.exports.start(id,another,undefined,true),e=>e.status===409);assert.equal(ticks,1);assert.ok(!JSON.stringify([...store.values()]).includes(raw));
 store.set(id,{orderId:id,status:'issued',cdk:'FIXTURE-LEGACY-KEY'});
 await assert.rejects(()=>context.exports.start(id,raw,undefined,true),e=>e.status===409);assert.equal(ticks,1);
});
test('native completion preserves the provider journal and clears the stored session',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),source=fs.readFileSync('apps/admin-backend/src/modules/orders/orders.service.ts','utf8'),ast=ts.createSourceFile('orders.ts',source,ts.ScriptTarget.Latest,true);
 let method;function visit(n){if(ts.isMethodDeclaration(n)&&n.name?.getText(ast)==='resumeGrokZovoJobs')method=n;ts.forEachChild(n,visit)}visit(ast);assert.ok(method);
 const journal={phase:'completed',providerOrderId:'77',costPending:true,notices:{waiting:'sent'}},store=new Map([[id,{orderId:id,externalFulfillmentOwner:m.OWNER,status:'processing',verificationState:'pending',attempts:1,clientTokenCiphertext:'fixture-encrypted',lastProviderPayload:{grokZovo:journal}}]]),audits=[];
 const context={exports:{},Date,prisma:{},GROK_ZOVO_OWNER:m.OWNER,AppError:Error,
  activationStore:{findByOrderId:k=>store.get(k),upsert:r=>store.set(r.orderId,r)},decryptStoredClientToken:()=>{},withActivationOrderLock:()=>{},sendTelegramNotification:()=>{},
  buildStoredClientTokenPatch:()=>({clientTokenCiphertext:null,clientTokenIv:null,clientTokenAuthTag:null,clientTokenStoredAt:null,clientTokenExpiresAt:null}),
  writeAuditLog:async row=>audits.push(row),tickGrokZovo:async ctx=>{await ctx.complete(id);await ctx.complete(id)},
 };
 vm.runInNewContext(ts.transpileModule('async function '+method.getText(ast).replace(/^async\s+/,'')+'\nexports.run=resumeGrokZovoJobs;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 await context.exports.run();assert.equal(store.get(id).status,'success');assert.equal(store.get(id).clientTokenCiphertext,null);assert.deepEqual(store.get(id).lastProviderPayload.grokZovo,journal);assert.equal(audits.length,1);assert.equal(audits[0].action,'activation_grok_zovo_complete');
});
