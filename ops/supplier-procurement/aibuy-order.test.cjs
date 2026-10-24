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
test('native website selects AI-BUY route then a lost provider reply cannot repeat procurement or activate',async()=>{
 let stored={orderId:'cfixturewebsitepaidorder0001',email:'fixture@example.invalid',productKey:'codex-500',status:'issued',verificationState:'unknown',attempts:0,cdk:'',activationSiteUrl:'https://aiee.fun'};
 let buys=0,activates=0,reserves=0;
 const token=JSON.stringify({account:{planType:'plus'},accessToken:'isolated-fixture'});
 const context={Date,Math,path,__dirname:'/isolated/apps/admin-backend/dist/modules/orders',env:{},
  AppError:class extends Error{},MAX_CLIENT_TOKEN_LENGTH:500000,MAX_ACTIVATION_START_ATTEMPTS:3,CHATGPT_PLUS_PRODUCT_KEY:'chatgpt-plus-1',
  canonicalProductKey:x=>x,ordersService:{getActivation:async()=>({productSlug:'codex-500'})},assertTokenActivationDeliveryMode(){},
  ensureActivationRecordForTokenFlow:async()=>stored,parseClientTokenInput:raw=>({raw,extracted:'fixture',json:JSON.parse(raw)}),
  isCodexCreditsProductKey:x=>/^codex-/.test(x||''),validateAieeSessionJson:()=>null,isSupportTokenActivationMode:()=>false,
  isAisouGrokProduct:()=>false,buildStoredClientTokenPatch:()=>({clientTokenCiphertext:'encrypted-fixture'}),
  normalizeActivationRecordForRead:x=>x,buildTokenMeta:()=>({fingerprint:'fixture'}),isTokenBoundToAnotherFingerprint:()=>false,
  getOrderWithFirstItem:async()=>({source:'site'}),resolveExternalCodexOwner:()=>null,readActivationSiteUrlFromOrderDetails:()=>'',resolveChatGptPlanType:()=> 'plus',
  activationStore:{findByOrderId:()=>stored,upsert:r=>{stored=r},reserveCdkRecordForOrder:async()=>{reserves++;return null}},
  assertPaidOrderForAdmin:async()=>({id:stored.orderId,email:stored.email}),
  procureSelectedWebsiteKey:async req=>{buys++;assert.equal(req.productKey,'codex-500');return {keyId:'fixture-key',code:'ISOLATED-KEY-500',activationSiteUrl:'https://aichongzhi.fun'}},
  isIosProviderBase:()=>false,isAieeProviderBase:x=>x==='https://aiee.fun',buildUpstreamUserCandidates:()=>[token],resolveAichongzhiProduct:()=>null,
  require:id=>{assert.ok(id.endsWith('aibuy-activation.cjs'));return {start:input=>adapter.start(input,{fetchImpl:async url=>{
   if(url.endsWith('verifyCdk'))return {ok:true,text:async()=>JSON.stringify({ok:true,workflow:'codex_500',status:'unused'})};
   activates++;assert.equal(stored.status,'processing');assert.equal(stored.attempts,1);throw Error('isolated lost response');
  }})}},
 };
 const api=load(['selectChatGptPlusCandidate','startActivationUnsafe','startOutstockTaskWithRetry'],context);
 const first=await api.startActivationUnsafe(stored.orderId,token,undefined,true);
 assert.equal(stored.activationSiteUrl,'https://aichongzhi.fun');assert.equal(stored.status,'processing');assert.equal(stored.attempts,1);
 const second=await api.startActivationUnsafe(stored.orderId,token,undefined,true);
 assert.equal(second.reused,true);assert.equal(second.taskId,first.taskId);assert.equal(buys,1);assert.equal(activates,1);assert.equal(reserves,1);
});
test('website polling uses the selected provider and confirms only its final success',async()=>{
 let stored={orderId:'cfixturewebsitepaidorder0001',productKey:'codex-500',cdk:'ISOLATED-KEY-500',activationSiteUrl:'https://aichongzhi.fun',taskId:'reconcile-1700000000000-aibuy',status:'processing',verificationState:'pending'};
 const notifications=[];
 const context={Date,Math,path,__dirname:'/isolated/apps/admin-backend/dist/modules/orders',env:{},
  normalizeActivationRecordForRead:x=>x,isAieeProviderBase:()=>false,isIosProviderBase:()=>false,
  activationStore:{findByOrderId:()=>stored,upsert:r=>{stored=r}},buildStoredClientTokenPatch:()=>({clientTokenCiphertext:null}),
  notifyAibuyActivationResult:async(...args)=>notifications.push(args),
  require:()=>({status:async()=>({status:200,json:{success:true,recharge_status:'success',order_id:'fixture-provider-job'}})}),
 };
 const api=load(['fetchChongzhiCodeStatus','isChongzhiCodeUsed','updateActivationFromChongzhiCodePayload'],context);
 const p=await api.fetchChongzhiCodeStatus(stored.cdk,stored.activationSiteUrl);
 api.updateActivationFromChongzhiCodePayload(stored.orderId,p);
 assert.equal(stored.status,'success');assert.equal(stored.verificationState,'success');assert.equal(stored.taskId,'fixture-provider-job');assert.equal(stored.lastProviderPayload.source,'aibuy-codex');
 assert.equal(notifications.length,1);assert.equal(notifications[0][2],true);
 stored={...stored,status:'processing',verificationState:'pending',taskId:'reconcile-'+(Date.now()-6*60000)+'-aibuy'};
 const unused={status:200,json:{success:true,status:'unused',recharge_status:'unused'}};
 api.updateActivationFromChongzhiCodePayload(stored.orderId,unused);assert.equal(stored.status,'processing');assert.equal(notifications.length,1);
 stored={...stored,taskId:'reconcile-'+(Date.now()-16*60000)+'-aibuy'};
 api.updateActivationFromChongzhiCodePayload(stored.orderId,unused);assert.equal(stored.status,'failed');assert.equal(notifications.length,2);assert.equal(notifications[1][2],false);
});
