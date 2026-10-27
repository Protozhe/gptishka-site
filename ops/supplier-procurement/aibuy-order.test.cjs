'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const adapter=require('./aibuy-activation.cjs');
const source=ts.createSourceFile('orders.ts',fs.readFileSync('apps/admin-backend/src/modules/orders/orders.service.ts','utf8'),ts.ScriptTarget.Latest,true);
function load(names,context){
 const statements=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(source)).join('\n');
 assert.equal(source.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).length,names.length);
 const js=ts.transpileModule(statements+'\nthis.api={'+names.join(',')+'};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,context);return context.api;
}
for(const credits of [250,500,1000,0])test(`native ${credits?'legacy Codex '+credits:'Claude Pro'} retains AI-BUY and a lost reply cannot repeat procurement or activate`,async()=>{
 const productKey=credits?`codex-${credits}`:'claude-pro';
 let stored={orderId:'cfixturewebsitepaidorder0001',email:'fixture@example.invalid',productKey,status:'issued',verificationState:'unknown',attempts:0,cdk:'',activationSiteUrl:credits?'https://aiee.fun':'https://aichongzhi.fun'};
 if(credits)stored.lastProviderPayload={supplierProcurement:{managed:true,provider:'aibuy',phase:'purchasing'}};
 let buys=0,activates=0,reserves=0;
 const token=credits?JSON.stringify({account:{planType:'plus'},accessToken:'isolated-fixture'}):'00000000-0000-4000-8000-000000000029';
 const context={Date,Math,path,__dirname:'/isolated/apps/admin-backend/dist/modules/orders',env:{},
  AppError:class extends Error{},MAX_CLIENT_TOKEN_LENGTH:500000,MAX_ACTIVATION_START_ATTEMPTS:3,CHATGPT_PLUS_PRODUCT_KEY:'chatgpt-plus-1',
  canonicalProductKey:x=>x,ordersService:{getActivation:async()=>({productSlug:productKey})},assertTokenActivationDeliveryMode(){},
  ensureActivationRecordForTokenFlow:async()=>stored,parseClientTokenInput:raw=>({raw,extracted:credits?'fixture':raw,json:credits?JSON.parse(raw):null}),
  isCodexCreditsProductKey:x=>/^codex-/.test(x||''),validateAieeSessionJson:()=>null,isSupportTokenActivationMode:()=>false,
  isAisouGrokProduct:()=>false,buildStoredClientTokenPatch:()=>({clientTokenCiphertext:'encrypted-fixture'}),
  normalizeActivationRecordForRead:x=>x,buildTokenMeta:()=>({fingerprint:'fixture'}),isTokenBoundToAnotherFingerprint:()=>false,
  getOrderWithFirstItem:async()=>({source:'site'}),resolveExternalCodexOwner:()=>null,readActivationSiteUrlFromOrderDetails:()=>'',resolveChatGptPlanType:()=> 'plus',
  activationStore:{findByOrderId:()=>stored,upsert:r=>{stored=r},reserveCdkRecordForOrder:async()=>{reserves++;return null}},
  assertPaidOrderForAdmin:async()=>({id:stored.orderId,email:stored.email}),
  procureSelectedWebsiteKey:async req=>{buys++;assert.equal(req.productKey,productKey);return {keyId:'fixture-key',code:`ISOLATED-KEY-${credits}`,activationSiteUrl:'https://aichongzhi.fun'}},
  isIosProviderBase:()=>false,isAieeProviderBase:x=>x==='https://aiee.fun',buildUpstreamUserCandidates:()=>[token],resolveAichongzhiProduct:x=>x==='claude-pro'?'claude':null,
  require:id=>{assert.ok(id.endsWith('aibuy-activation.cjs'));return {start:input=>adapter.start(input,{fetchImpl:async url=>{
   if(url.endsWith('verifyCdk'))return {ok:true,text:async()=>JSON.stringify({ok:true,workflow:credits?`codex_${credits}`:'claude_pro',status:'unused'})};
   activates++;assert.equal(stored.status,'processing');assert.equal(stored.attempts,1);throw Error('isolated lost response');
  }})}},
 };
 const api=load(['selectChatGptPlusCandidate','startActivationUnsafe','startOutstockTaskWithRetry','startAibuySubscription'],context);
 const first=await api.startActivationUnsafe(stored.orderId,token,undefined,true);
 assert.equal(stored.activationSiteUrl,'https://aichongzhi.fun');assert.equal(stored.status,'processing');assert.equal(stored.attempts,1);
 const second=await api.startActivationUnsafe(stored.orderId,token,undefined,true);
 assert.equal(second.reused,true);assert.equal(second.taskId,first.taskId);assert.equal(buys,1);assert.equal(activates,1);assert.equal(reserves,credits?0:1);
});
for(const productKey of ['codex-500','claude-pro'])test(`website ${productKey} polling uses the selected provider and confirms only its final success`,async()=>{
 let stored={orderId:'cfixturewebsitepaidorder0001',productKey,cdk:'ISOLATED-KEY-500',activationSiteUrl:'https://aichongzhi.fun',taskId:'reconcile-1700000000000-aibuy',status:'processing',verificationState:'pending'};
 const notifications=[];
 const context={Date,Math,path,__dirname:'/isolated/apps/admin-backend/dist/modules/orders',env:{},
  normalizeActivationRecordForRead:x=>x,isAieeProviderBase:()=>false,isIosProviderBase:()=>false,
  activationStore:{findByOrderId:()=>stored,upsert:r=>{stored=r}},buildStoredClientTokenPatch:()=>({clientTokenCiphertext:null}),
  notifyAibuyActivationResult:async(...args)=>notifications.push(args),
  require:()=>({status:async(code,productKey)=>{assert.equal(code,stored.cdk);assert.equal(productKey,stored.productKey);return {status:200,json:{success:true,recharge_status:'success',order_id:'fixture-provider-job'}}}}),
 };
 const api=load(['fetchChongzhiCodeStatus','isChongzhiCodeUsed','updateActivationFromChongzhiCodePayload'],context);
 const p=await api.fetchChongzhiCodeStatus(stored.cdk,stored.activationSiteUrl,stored.productKey);
 api.updateActivationFromChongzhiCodePayload(stored.orderId,p);
 assert.equal(stored.status,'success');assert.equal(stored.verificationState,'success');assert.equal(stored.taskId,'fixture-provider-job');assert.equal(stored.lastProviderPayload.source,productKey==='claude-pro'?'aibuy-claude':'aibuy-codex');
 assert.equal(notifications.length,1);assert.equal(notifications[0][2],true);
 const completed=JSON.stringify(stored);
 for(const recharge_status of ['pending','unused','failed'])api.updateActivationFromChongzhiCodePayload(stored.orderId,{status:200,json:{success:true,recharge_status}});
 assert.equal(JSON.stringify(stored),completed,'Late polling responses cannot undo final success or restore erased credentials');assert.equal(notifications.length,1);
 stored={...stored,status:'processing',verificationState:'pending',taskId:'reconcile-'+(Date.now()-6*60000)+'-aibuy'};
 const unused={status:200,json:{success:true,status:'unused',recharge_status:'unused'}};
 api.updateActivationFromChongzhiCodePayload(stored.orderId,unused);assert.equal(stored.status,'processing');assert.equal(notifications.length,1);
 stored={...stored,taskId:'reconcile-'+(Date.now()-16*60000)+'-aibuy'};
 api.updateActivationFromChongzhiCodePayload(stored.orderId,unused);assert.equal(stored.status,'failed');assert.equal(notifications.length,2);assert.equal(notifications[1][2],false);
});

for(const productKey of ['codex-1000','claude-pro'])test(`uncertain ${productKey} review remains query-only eligible until a late provider confirmation`,()=>{
 const scheduler=ts.createSourceFile('scheduler.ts',fs.readFileSync('apps/admin-backend/src/modules/orders/activation-status.scheduler.ts','utf8'),ts.ScriptTarget.Latest,true);
 const fn=scheduler.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='processingRecords');assert.ok(fn);
 const now=Date.now(),base={orderId:'fixture',productKey,activationSiteUrl:'https://aichongzhi.fun',cdk:'ISOLATED-KEY',taskId:'reconcile-1700000000000-aibuy',status:'failed',verificationState:'failed',attempts:1,issuedAt:new Date(now-20*60000).toISOString(),updatedAt:new Date(now).toISOString(),lastProviderPayload:{recharge_status:'unused',submissionDiagnostics:{phase:'submit_recharge',outcome:'uncertain'}}};
 let rows=[base];const context={Date,MAX_RECORD_AGE_MS:7*86400000,MAX_RECORDS_PER_CYCLE:24,activationStore:{list:()=>rows}};
 vm.runInNewContext(ts.transpileModule(fn.getText(scheduler)+';this.run=processingRecords',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.equal(context.run().length,1);
 for(const patch of [{status:'success',verificationState:'success'},{attempts:0},{activationSiteUrl:'https://other.example.invalid'},{issuedAt:new Date(now-8*86400000).toISOString()},{lastProviderPayload:{recharge_status:'failed',submissionDiagnostics:{phase:'submit_recharge',outcome:'failed'}}}]){rows=[{...base,...patch}];assert.equal(context.run().length,0)}
});
