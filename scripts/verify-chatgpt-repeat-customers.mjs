import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import ts from 'typescript';
const file='apps/admin-backend/src/modules/orders/orders.service.ts',text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
const functions=new Map(),methods=new Map();
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(ast));if(ts.isMethodDeclaration(n))methods.set(n.name.getText(ast),n.getText(ast));ts.forEachChild(n,walk);}walk(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
class AppError extends Error {constructor(message,status){super(message);this.status=status;}}
let records=new Map(),key='chatgpt-plus-1',blockLookup=null,blockKey=null,writes=0,providerCalls=0;
const order=id=>({id,status:'PAID',source:'site',email:'fixture@example.invalid',orderDetails:{selection:{}},items:[{product:{slug:key,tags:[]}}]});
const no=()=>false;
const c=vm.createContext({crypto,Buffer,Date,JSON,Map,Math,AppError,clientTokenInputVersion:0,
 OrderStatus:{PAID:'PAID'},MAX_CLIENT_TOKEN_LENGTH:500000,MAX_ACTIVATION_START_ATTEMPTS:3,CHATGPT_PLUS_PRODUCT_KEY:'chatgpt-plus-1',env:{ACTIVATION_PROVIDER:'chongzhi'},
 assertOrderTokenAccess:async id=>order(id),assertPaidOrderForAdmin:async id=>order(id),assertPaidOrderAccess:async id=>order(id),
 getOrderWithFirstItem:async id=>{if(blockLookup){const wait=blockLookup;blockLookup=null;await wait;}return order(id);},
 resolveOrderDeliveryType:()=> 'activation',resolveActivationPoolProductKeyForOrder:()=>key,readActivationSiteUrlFromOrderDetails:()=>'',
 isMidjourneyProductSlug:no,isSunoPaymentLinkOrder:no,isDevinProductSlug:no,isVerificationSupportProduct:no,isPerplexityManualFlow:no,
 isGrokZovoProduct:no,isClaudeZovoProduct:no,isGrokZovoOrder:async()=>false,isClaudeZovoOrder:async()=>false,
 isSupportLikeDeliveryType:no,isSupportActivationFlow:no,resolveTokenActivationFlowForProduct:()=> 'chatgpt_token',canonicalProductKey:x=>x,
 isCodexCreditsProductKey:no,isChatGptGoProductKey:k=>k==='chatgpt-go-1',isSupportTokenActivationMode:no,
 cleanupExpiredStoredClientToken:r=>({changed:false,record:r}),decryptStoredClientToken:r=>r?.clientTokenCiphertext||'',
 buildStoredClientTokenPatch:raw=>({clientTokenCiphertext:raw||null,clientTokenStoredAt:new Date().toISOString(),clientTokenExpiresAt:'2099-01-01T00:00:00Z'}),
 activationStore:{findByOrderId:id=>records.get(id),upsert:r=>{writes++;records.set(r.orderId,structuredClone(r));},reserveCdkRecordForOrder:async()=>{throw Error('No key allocation allowed');}},
 prisma:{licenseKey:{findFirst:async()=>{if(blockKey){const wait=blockKey;blockKey=null;await wait;}return {id:'fixture-issued-key'};}}},
 ensureActivationRecordForTokenFlow:async id=>records.get(id),
 ordersService:{getActivation:async id=>({productSlug:records.get(id)?.productKey||key,product:key,deliveryMode:'activation'})},
 resolveChatGptPlanType:()=> 'free',isIosProviderBase:no,isAieeProviderBase:no,
 selectChatGptPlusCandidate:async r=>({record:r,forceOverwrite:false}),withActivationOrderLock:async(_id,f)=>f(),
 startOutstockTaskWithRetry:async()=>{providerCalls++;throw Error('No live provider in tests');},
});
const external=ts.createSourceFile('external.ts',fs.readFileSync('apps/admin-backend/src/modules/orders/external-codex.ts','utf8'),ts.ScriptTarget.Latest,true);
vm.runInContext(compile(external.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='resolveExternalCodexOwner').getText(external)).replace('export ',''),c);
for(const name of ['nextTokenInputVersion','isAisouGrokProduct','buildTokenMeta','parseClientTokenInput','isTokenBoundToAnotherFingerprint','normalizeActivationRecordForRead','validateAieeSessionJson','base64UrlToBase64','tryDecodeJwtPayloadObject','tryDecodeJwtPayload','assertTokenActivationDeliveryMode','startActivationUnsafe'])vm.runInContext(compile(functions.get(name)),c);
vm.runInContext(compile('this.service={'+['storeActivationClientToken','validateActivationToken'].map(n=>methods.get(n)).join(',')+'}'),c);
c.service.getActivation=c.ordersService.getActivation;
const jwt=(label,expiry=Date.now()/1000+3600)=>[{}, {exp:expiry,sub:label}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.Zml4dHVyZQ';
const session=(label,changes={})=>JSON.stringify({user:{id:'fixture-user',email:'fixture@example.invalid'},account:{id:'fixture-workspace',planType:'free'},accessToken:jwt(label),sessionToken:'fixture-session-'+label,expires:'2099-01-01T00:00:00Z',...changes});
const rawOld=session('old'),rawNew=session('new');
function record(id,patch={}){return {orderId:id,email:'fixture@example.invalid',productKey:key,cdk:'',activationSiteUrl:'https://aiee.fun',status:'issued',verificationState:'unknown',attempts:0,taskId:null,issuedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...patch};}
function reset(product){key=product;records=new Map();providerCalls=writes=0;blockLookup=blockKey=null;}
const owners={'chatgpt-plus-1':'pulse-siteplus-v1','chatgpt-go-1':'pulse-sitego-v1','chatgpt-pro-5x-1':'pulse-sitepro5x-v1','chatgpt-pro-20x-1':'pulse-sitepro20x-v1','chatgpt-pro-25x-1':'pulse-sitepro500-v1'};
for(const product of Object.keys(owners)){
 reset(product);records.set('older-order',record('older-order',{status:'success',verificationState:'success',attempts:1,taskId:'old-confirmed-task',externalFulfillmentOwner:owners[product]}));records.set('new-order',record('new-order'));
 await c.service.storeActivationClientToken('new-order',rawOld);assert.equal((await c.service.validateActivationToken('new-order',rawOld)).ok,true);
 await c.startActivationUnsafe('new-order',rawOld,undefined,true);assert.equal(records.get('new-order').externalFulfillmentOwner,owners[product]);
 // Refresh credentials while native preparation is waiting; keep its owner and claims.
 await c.service.storeActivationClientToken('new-order',rawNew);assert.equal((await c.service.validateActivationToken('new-order',rawNew)).ok,true);
 assert.equal(records.get('new-order').clientTokenCiphertext,rawNew);assert.equal((await c.startActivationUnsafe('new-order',rawNew,undefined,true)).reused,true);
 assert.equal(records.get('older-order').taskId,'old-confirmed-task');assert.equal(records.get('older-order').status,'success');
 const before=structuredClone(records.get('new-order'));
 for(const other of [session('foreign',{account:{id:'other-workspace',planType:'free'}}),session('foreign',{user:{id:'other-user',email:'other@example.invalid'}})])await assert.rejects(c.service.storeActivationClientToken('new-order',other),/bound/);
 assert.deepEqual(records.get('new-order'),before);assert.equal(providerCalls,0);
 assert.doesNotMatch(JSON.stringify(before.tokenMeta),/fixture@example|fixture-session/);
 // Invalid and expired validation must never replace usable saved data.
 assert.equal((await c.service.validateActivationToken('new-order','{bad-json')).ok,false);
 const expired=session('expired',{accessToken:jwt('expired',1)});assert.equal((await c.service.validateActivationToken('new-order',expired)).ok,false);assert.equal(records.get('new-order').clientTokenCiphertext,rawNew);
 await assert.rejects(c.service.storeActivationClientToken('new-order',expired),/истекла/);
 await assert.rejects(c.service.storeActivationClientToken('new-order',session('expired-iso',{expires:'2000-01-01T00:00:00Z'})),/истекла/);
 await assert.rejects(c.service.storeActivationClientToken('new-order',JSON.stringify({user:{id:'fixture-user',email:'fixture@example.invalid'},accessToken:jwt('incomplete')})),/полный JSON/);
 assert.equal(records.get('new-order').clientTokenCiphertext,rawNew);
 // A delayed older request cannot overwrite the newest successfully saved input.
 let release;blockLookup=new Promise(r=>release=r);const slow=c.service.storeActivationClientToken('new-order',rawOld);
 await new Promise(r=>setImmediate(r));await c.service.storeActivationClientToken('new-order',rawNew);release();await slow;
 assert.equal(records.get('new-order').clientTokenCiphertext,rawNew);
 // A completed old order remains completed and does not regain customer secrets.
 await c.service.storeActivationClientToken('older-order',rawNew);assert.equal(records.get('older-order').clientTokenCiphertext,undefined);assert.equal(providerCalls,0);
}
// Legacy pending records acquire stable binding from their existing encrypted data.
reset('chatgpt-plus-1');records.set('legacy',record('legacy',{status:'processing',clientTokenCiphertext:rawOld,tokenMeta:{kind:'json_accessToken',length:rawOld.length,fingerprint:c.buildTokenMeta(c.parseClientTokenInput(rawOld)).fingerprint},externalFulfillmentOwner:'pulse-siteplus-v1'}));
await c.service.storeActivationClientToken('legacy',rawNew);assert.equal(records.get('legacy').clientTokenCiphertext,rawNew);
// Credential refresh never clears a durable in-flight provider task or attempt.
records.set('bound',record('bound',{status:'processing',taskId:'original-task',attempts:1,cdk:'original-key',clientTokenCiphertext:rawOld,tokenMeta:c.buildTokenMeta(c.parseClientTokenInput(rawOld))}));
await c.service.storeActivationClientToken('bound',rawNew);await c.startActivationUnsafe('bound',rawNew,undefined,true);
assert.equal(records.get('bound').taskId,'original-task');assert.equal(records.get('bound').attempts,1);assert.equal(records.get('bound').cdk,'original-key');assert.equal(providerCalls,0);
// A key lookup can yield while another request establishes the recipient.
// The late validator must check the current binding again before persistence.
records.set('race',record('race',{cdk:'fixture-key'}));
let finishKey;blockKey=new Promise(r=>finishKey=r);
const validation=c.service.validateActivationToken('race',session('foreign',{user:{id:'another-user',email:'another@example.invalid'}}));
await new Promise(r=>setImmediate(r));await c.service.storeActivationClientToken('race',rawNew);finishKey();
assert.equal((await validation).ok,false);assert.equal(records.get('race').clientTokenCiphertext,rawNew);assert.equal(providerCalls,0);
console.log('Website ChatGPT repeat buyers: all five plans, same-account refresh, separate orders, latest input and immutable payment claims verified.');
