import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import ts from 'typescript';

// Execute the shipped handlers with isolated stock, encrypted-session storage,
// provider transport and locks. No real key, customer or HTTP request is used.
const file='apps/admin-backend/src/modules/orders/orders.service.ts';
const text=fs.readFileSync(file,'utf8'), ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(ast)]));
const service=ast.statements.filter(ts.isVariableStatement).flatMap(n=>n.declarationList.declarations).find(n=>n.name.getText(ast)==='ordersService');
const method=name=>service.initializer.properties.find(n=>n.name?.getText(ast)===name).getText(ast);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
class AppError extends Error {constructor(message,status){super(message);this.status=status;}}
const require=createRequire(import.meta.url);
const {grokProductFromProvider}=require('../ops/supplier-procurement/aisou-core.cjs');
const jwt=(payload,header={typ:'JWT',alg:'HS256'})=>[header,payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.Zml4dHVyZS1zaWduYXR1cmU';
const sso=jwt({session_id:'00000000-0000-4000-8000-000000000001'});
let record,stock,calls,claims,reservations,mode,plan,selectedSite='https://aiee.fun';
const saved=value=>JSON.parse(JSON.stringify(value));
const context=vm.createContext({
  isGeminiAutomaticProduct: value => /^gemini-pro-(6|12|24)m$/.test(String(value || "")),
  GEMINI_FULFILLMENT_OWNER: "gemini-pro-cdk-v1",

  Buffer,Date,Math,Map,Set,JSON,AppError,Error,crypto,
  DEFAULT_AIEE_URL:'https://aiee.fun',GROK_ZOVO_OWNER:'website-grok-zovo-v1',
  CHATGPT_PLUS_PRODUCT_KEY:'chatgpt-plus-1',
  MAX_CLIENT_TOKEN_LENGTH:50000,MAX_ACTIVATION_START_ATTEMPTS:3,
  ACTIVATION_OUTSTOCK_MAX_RETRIES:3,ACTIVATION_OUTSTOCK_RETRY_DELAY_MS:1,URL,
  buildActivationSiteEndpointUrl:(base,endpoint)=>new URL(endpoint,base+'/').href,
  tryParseUrl:value=>{try{return new URL(value);}catch{return null;}},
  env:{ACTIVATION_PROVIDER:'chongzhi',ACTIVATION_DEVICE_ID:'web'},
  cdkResumeRunning:false, enqueueActivationStockNotification:async()=>{},
  activationStore:{findByOrderId:()=>record,upsert:r=>{record=saved(r);},list:()=>[record],
    async reserveCdkRecordForOrder(input){reservations++;assert.equal(input.productKey,record.productKey);assert.equal(input.activationSiteUrl,record.productKey==='claude-pro'?'https://aichongzhi.fun':'https://aiee.fun');if(/^codex-/.test(record.productKey))assert.equal(JSON.stringify(input.activationSiteUrls),JSON.stringify(['https://aichongzhi.fun','https://aiee.fun']));else assert.equal(input.activationSiteUrls,undefined);if(!stock)return null;stock--;return {code:'fixture-cdk',activationSiteUrl:selectedSite};}},
  prisma:{licenseKey:{async count({where}){assert.equal(where.productKey,record.productKey);assert.equal(where.status,'available');assert.equal(where.orderId,null);assert.equal(where.usedAt,null);assert.equal(where.reservedAt,null);if(/^codex-/.test(record.productKey))assert.equal(JSON.stringify(where.activationSiteUrl.in),JSON.stringify(['https://aichongzhi.fun','https://aiee.fun']));else assert.equal(where.activationSiteUrl,record.activationSiteUrl);return stock;}}},
  ordersService:{async getActivation(){return {activationFlow:record.productKey==='claude-pro'?'support_token':'grok_sso',deliveryMode:record.productKey==='claude-pro'?'support':'activation',productSlug:record.productKey};}},
  withActivationOrderLock:async(_id,job)=>job(),
  assertTokenActivationDeliveryMode(){},isGrokZovoOrder:async()=>false,
  ensureActivationRecordForTokenFlow:async()=>record,normalizeActivationRecordForRead:r=>r,
  isCodexCreditsProductKey:()=>false,isSupportTokenActivationMode:()=>false,isIosProviderBase:()=>false,
  isAieeProviderBase:site=>site==='https://aiee.fun',
  isTokenBoundToAnotherFingerprint:(old,next)=>Boolean(old?.fingerprint&&old.fingerprint!==next.fingerprint),
  buildTokenMeta:t=>({fingerprint:crypto.createHash('sha256').update(t.raw).digest('hex')}),
  buildStoredClientTokenPatch:token=>({clientTokenCiphertext:token||null,clientTokenExpiresAt:token?'2099-01-01T00:00:00Z':null}),
  decryptStoredClientToken:r=>r.clientTokenCiphertext,
  assertPaidOrderForAdmin:async()=>({id:'fixture-order',email:'fixture@example.invalid'}),
  assertPaidOrderAccess:async()=>({id:'fixture-order',email:'fixture@example.invalid'}),
  selectChatGptPlusCandidate:async r=>({record:r,forceOverwrite:false}),
  procureSelectedWebsiteKey(){throw Error('Grok must never buy a key');},
  sleep:async()=>{},verifiedAieeGrokProduct:grokProductFromProvider,
  recoverCompletedChongzhiJsonTask:async()=>null,
  async callChongzhiJsonApi(base,action,data){
    assert.equal(base,'https://aiee.fun');calls.push(action);
    if(action==='query_code')return {status:200,json:{success:true,status:mode==='used'?'used':'available',recharge_status:mode==='used'?'success':'available',order_id:mode==='used'?'previous-order':undefined}};
    if(action==='verify_code')return mode==='missing-api'?{status:404,json:null}:{status:200,json:{success:true,sid:'fixture-sid',plan_type:mode==='wrong'?'grok_premium':`grok_${plan}`,plan_name:`Grok ${plan} ${mode==='annual'?'annual':'1 month'}`,require_cookie:1}};
    if(action==='validate_token'){assert.deepEqual(JSON.parse(data.json_token),{sso});return {status:200,json:{success:mode!=='bad-account'}};}
    if(action==='submit_recharge'){claims++;assert.equal(record.attempts,1,'Claim is durable before POST');assert.equal(record.status,'processing');if(mode==='timeout')throw Error('fixture-timeout');return {status:200,json:{success:true,pending:mode!=='immediate',recharge_status:mode==='immediate'?'success':'pending',order_id:'fixture-provider-order'}};}
    throw Error('Unexpected provider action');
  },
});
for(const name of ['isAisouGrokProduct','normalizeAisouGrokSession','validateGrokSsoSession','isResumableCdkRecord','isQueuedCdkActivation','isChatGptPlusIosKeyWait','queueActivationForCdk','parseClientTokenInput','buildUpstreamUserCandidates','safeStableJsonKey','startChongzhiJsonTask','startChongzhiTaskWithRetry','startActivationUnsafe','isChongzhiCodeUsed','updateActivationFromChongzhiCodePayload','isSupportTokenActivationMode','validateSupportSessionJwtToken'])vm.runInContext(compile(functions.get(name)),context);
context.startOutstockTaskWithRetry=input=>context.startChongzhiJsonTask(input,'https://aiee.fun');
vm.runInContext(compile('this.resume={'+method('resumePendingCdkJobs')+'}'),context);
function reset(tier='plus',available=1){plan=tier;stock=available;calls=[];claims=reservations=0;mode='pending';record={orderId:'fixture-order',email:'fixture@example.invalid',productKey:`grok-${tier}-1`,cdk:'',activationSiteUrl:'https://aiee.fun',status:'issued',verificationState:'unknown',attempts:0,taskId:null,issuedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}

assert.equal(context.normalizeAisouGrokSession(sso),JSON.stringify({sso}));
assert.equal(context.normalizeAisouGrokSession(JSON.stringify({sso})),JSON.stringify({sso}));
for(const bad of ['not-a-token',JSON.stringify({accessToken:sso}),JSON.stringify({sso,extra:'cookie'}),jwt({session_id:'wrong'}),jwt({session_id:'00000000-0000-4000-8000-000000000001',exp:1}),jwt({session_id:'00000000-0000-4000-8000-000000000001'},{alg:'none'})])assert.throws(()=>context.normalizeAisouGrokSession(bad),/cookie sso/);
for(const tier of ['plus','premium','super','ultra']){
  reset(tier);await context.startActivationUnsafe('fixture-order',sso,undefined,true);
  assert.equal(record.status,'processing');assert.equal(record.attempts,1);assert.equal(stock,0);assert.equal(claims,1);
  assert.deepEqual(calls,['query_code','verify_code','validate_token','submit_recharge']);
  assert.equal((await context.startActivationUnsafe('fixture-order',sso,undefined,true)).reused,true);
  assert.equal(claims,1);assert.equal(reservations,1,'Repeated click must keep its original key');
}
for(const tier of ['plus','premium','super','ultra']){
 assert.equal(grokProductFromProvider({plan_type:`grok_${tier}_halfprice`,plan_name:`Grok ${tier} 半价优惠`}),`grok_${tier}_monthly`);
 assert.equal(grokProductFromProvider({plan_type:`grok_${tier}_halfprice`,plan_name:`Grok ${tier} annual`}),null);
}
for(const failure of ['wrong','annual','used','bad-account']){
  reset();mode=failure;await assert.rejects(context.startActivationUnsafe('fixture-order',sso,undefined,true));
  assert.equal(claims,0);assert.equal(record.attempts,0);assert.equal(record.cdk,'fixture-cdk');assert.equal(record.lastProviderPayload.grokCdkHold,true);
  await context.resume.resumePendingCdkJobs();assert.equal(claims,0);assert.equal(reservations,1,'Preflight failure holds this key for review');
}
for(const tier of ['plus','premium','super','ultra']){
reset(tier,0);assert.equal((await context.startActivationUnsafe('fixture-order',sso,undefined,true)).queued,true);
assert.equal(record.keyAllocationState,'exhausted');assert.equal(record.attempts,0);assert.equal(calls.length,0);
await context.resume.resumePendingCdkJobs();assert.equal(calls.length,0);
stock=1;await context.resume.resumePendingCdkJobs();assert.equal(claims,1);assert.equal(record.status,'processing');
await context.resume.resumePendingCdkJobs();assert.equal(claims,1,'Restocked queue submits once');
}
// Native credit orders use the same durable stock wait, but keep their own
// ChatGPT session validation and exact-denomination supplier selection.
const grokTransport=context.startOutstockTaskWithRetry;
context.isCodexCreditsProductKey=key=>/^codex-(250|500|1000)$/.test(key);
context.validateAieeSessionJson=()=>'';
context.getOrderWithFirstItem=async()=>({source:'site',orderDetails:{}});
context.resolveExternalCodexOwner=()=>null;
context.resolveChatGptPlanType=()=> 'plus';
context.readActivationSiteUrlFromOrderDetails=()=>'';
const creditSession=JSON.stringify({accessToken:'fixture-access',account:{planType:'plus'},user:{email:'fixture@example.invalid'}});
for(const product of ['codex-250','codex-500','codex-1000','claude-pro'])for(const site of product==='claude-pro'?['https://aichongzhi.fun']:['https://aiee.fun','https://aichongzhi.fun']){
 reset('plus',0);record.productKey=product;selectedSite=site;
 if(product==='claude-pro')record.activationSiteUrl=site;
 context.procureSelectedWebsiteKey=async()=>null; // Current owner-supplied stock policy; no supplier network.
 context.startOutstockTaskWithRetry=async input=>{assert.equal(input.productKey,product);assert.equal(input.activationSiteUrl,site);input.beforeSubmit();assert.equal(record.attempts,1);claims++;return {ok:true,taskId:'fixture-credit-task',tries:1,immediateSuccess:false};};
 const token=product==='claude-pro'?'00000000-0000-4000-8000-000000000001':creditSession;
 assert.equal((await context.startActivationUnsafe('fixture-order',token,undefined,true)).queued,true);
 assert.equal(claims,0);assert.equal(record.attempts,0);assert.equal(record.clientTokenCiphertext,token);
 await context.resume.resumePendingCdkJobs();assert.equal(claims,0,'Empty exact pool must wait');
 stock=1;await context.resume.resumePendingCdkJobs();assert.equal(claims,1);assert.equal(record.taskId,'fixture-credit-task');assert.equal(record.activationSiteUrl,site);
 await context.resume.resumePendingCdkJobs();assert.equal(claims,1);assert.equal(stock,0);
 assert.equal((await context.startActivationUnsafe('fixture-order',token,undefined,true)).reused,true);assert.equal(claims,1);
}
selectedSite='https://aiee.fun';
context.startOutstockTaskWithRetry=grokTransport;
reset();mode='timeout';await context.startActivationUnsafe('fixture-order',sso,undefined,true);assert.equal(claims,1);assert.equal(record.attempts,1);
record.status='failed';record.verificationState='failed';await assert.rejects(context.startActivationUnsafe('fixture-order',sso,undefined,true),/уже отправлена/);assert.equal(claims,1);
reset();record.externalFulfillmentOwner='website-grok-zovo-v1';await assert.rejects(context.startActivationUnsafe('fixture-order',sso,undefined,true),/исходным каналом/);assert.equal(reservations,0);
reset();mode='immediate';await context.startActivationUnsafe('fixture-order',sso,undefined,true);assert.equal(record.status,'success');assert.equal(record.clientTokenCiphertext,null);
reset();mode='missing-api';const unavailable=await context.startChongzhiTaskWithRetry({cdk:'fixture-cdk',productKey:'grok-plus-1',userCandidates:[JSON.stringify({sso})]},{baseUrl:'https://aiee.fun'});
assert.equal(unavailable.ok,false);assert.equal(unavailable.body,'Grok AISOU API unavailable');assert.equal(claims,0,'An unavailable JSON API must not switch to legacy payment endpoints');

// Reconciliation is query-only and must match the submitted supplier order.
reset();await context.startActivationUnsafe('fixture-order',sso,undefined,true);
const reply=(id,status='success')=>({status:200,json:{success:true,status:'used',recharge_status:status,order_id:id}});
context.updateActivationFromChongzhiCodePayload('fixture-order',reply('another-order'));assert.equal(record.status,'processing');
context.updateActivationFromChongzhiCodePayload('fixture-order',reply(undefined));assert.equal(record.status,'processing');
context.updateActivationFromChongzhiCodePayload('fixture-order',reply('fixture-provider-order','pending'));assert.equal(record.status,'processing');
context.updateActivationFromChongzhiCodePayload('fixture-order',reply('fixture-provider-order'));assert.equal(record.status,'success');assert.equal(record.clientTokenCiphertext,null);
context.updateActivationFromChongzhiCodePayload('fixture-order',reply('fixture-provider-order','failed'));assert.equal(record.status,'success','Late response cannot undo confirmation');assert.equal(claims,1);
reset();record.cdk='fixture-cdk';context.updateActivationFromChongzhiCodePayload('fixture-order',reply('previous-order'));assert.equal(record.status,'issued','A pre-submission poll cannot invent a successful activation');

// Run the real import validator without a DB; the same function guards single
// and batch insertion. Wrong supplier URLs cannot contaminate a Grok pool.
const licenseText=fs.readFileSync('apps/admin-backend/src/services/licenseService.ts','utf8');
const licenseAst=ts.createSourceFile('license.ts',licenseText,ts.ScriptTarget.Latest,true);
const resolver=licenseAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='resolveCdkImportSite');
const imports=vm.createContext({isGeminiAutomaticProduct:value=>/^gemini-pro-(6|12|24)m$/.test(String(value||"")),AppError,normalizeActivationSiteUrl:value=>{try{const u=new URL(value);return u.origin+u.pathname.replace(/\/+$/,'');}catch{return '';}}});
vm.runInContext(compile(resolver.getText(licenseAst)),imports);
for(const tier of ['plus','premium','super','ultra']){
 assert.equal(imports.resolveCdkImportSite(`grok-${tier}-1`,undefined),'https://aiee.fun');
 assert.equal(imports.resolveCdkImportSite(`grok-${tier}-1`,'https://aiee.fun/#/'),'https://aiee.fun');
 assert.throws(()=>imports.resolveCdkImportSite(`grok-${tier}-1`,'https://aichongzhi.fun'),/CDK AISOU/);
}
// Exercise Plus allocation and background resumption with a synthetic session.
const iosSite = 'https://vip.sxzfd.com';
context.CHATGPT_PLUS_IOS_SITE_URL = iosSite;
context.CHATGPT_PLUS_FREE_SITE_URL = 'https://aiee.fun';
context.canonicalProductKey = key => key;
context.ordersService.getActivation = async () => ({
  activationFlow: 'chatgpt_token', deliveryMode: 'activation', productSlug: 'chatgpt-plus-1',
});
for (const name of ['isIosProviderBase', 'resolveChatGptPlanType', 'resolveChatGptPlusPool', 'selectChatGptPlusCandidate']) {
  vm.runInContext(compile(functions.get(name)), context);
}
for (const [planType, site] of [['plus', iosSite], ['free', 'https://aiee.fun']]) {
  reset('plus', 0);
  record.productKey = 'chatgpt-plus-1';
  context.activationStore.reserveCdkRecordForOrder = async request => {
    assert.equal(request.productKey, 'chatgpt-plus-1');
    assert.equal(request.activationSiteUrl, site);
    if (!stock) return null;
    stock--;
    return { keyId: 'fixture-plus-key', code: 'fixture-plus-cdk', activationSiteUrl: site };
  };
  context.prisma.licenseKey.count = async ({ where }) => {
    assert.equal(where.productKey, 'chatgpt-plus-1');
    assert.equal(where.activationSiteUrl, site);
    return stock;
  };
  context.startOutstockTaskWithRetry = async input => {
    assert.equal(input.activationSiteUrl, site);
    assert.equal(input.forceOverwrite, site === iosSite);
    input.beforeSubmit();
    claims++;
    return { ok: true, taskId: 'fixture-plus-task', tries: 1 };
  };
  const session = JSON.stringify({ ...JSON.parse(creditSession), account: { planType } });
  const queued = await context.startActivationUnsafe('fixture-order', session, undefined, true);
  assert.equal(queued.queued, true);
  assert.equal(queued.continuousKeyWait, site === iosSite);
  assert.equal(context.isQueuedCdkActivation(record), true);
  await context.resume.resumePendingCdkJobs();
  assert.equal(claims, 0);
  stock = 1;
  await context.resume.resumePendingCdkJobs();
  await context.resume.resumePendingCdkJobs();
  assert.equal(claims, 1);
  assert.equal(record.taskId, 'fixture-plus-task');
  assert.equal(record.attempts, 1);
}
console.log('CDK activation: Grok, Codex, Claude Pro and ChatGPT Plus queues resume once with the matching supplier stock.');
