"use strict";
// Invoked only by the peer-UID authenticated local broker. No HTTP endpoint.
const root="/var/www/gptishka-new",fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {env}=require(root+'/apps/admin-backend/dist/config/env.js');
const {prisma}=require(root+'/apps/admin-backend/dist/config/prisma.js');
const {activationStore}=require(root+'/apps/admin-backend/dist/modules/orders/activation.store.js');
const {procureWebsiteKey,loadSettings}=require('./aisou-live.cjs');
const {sendTelegramNotification}=require(root+'/apps/admin-backend/dist/modules/notifications/notifications.service.js');
function decrypt(a){
 const key=crypto.createHash('sha256').update('gptishka:activation-token:v1:'+String(env.ACTIVATION_TOKEN_ENCRYPTION_KEY||env.JWT_ACCESS_SECRET||'').trim()).digest();
 const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(a.clientTokenIv,'base64'));d.setAuthTag(Buffer.from(a.clientTokenAuthTag,'base64'));
 return Buffer.concat([d.update(Buffer.from(a.clientTokenCiphertext,'base64')),d.final()]).toString('utf8');
}
(async()=>{
 let raw='';for await(const part of process.stdin){raw+=part;if(raw.length>16384)throw Error('supplier_request_invalid')}
 const req=JSON.parse(raw),oid=req.order_id,j=req.context?.job,r=req.context?.reserve;
 if(req.action!=='procure'||!/^[a-z0-9]{20,40}$/.test(oid||'')||j?.order_id!==oid||j?.platform!=='gptishka'||j?.account_id!=='site')throw Error('supplier_request_invalid');
 const dir=path.join(process.env.GPTISHKA_RUNTIME_DIR||process.env.RUNTIME_DIR||'/var/lib/gptishka-runtime','order-locks');
 const f=path.join(dir,crypto.createHash('sha1').update(oid).digest('hex')+'.lock');let fd;
 try{
  fd=fs.openSync(f,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString(),orderId:oid}));
  const a=activationStore.findByOrderId(oid);if(!a)throw Error('supplier_session_required');
  if(req.context.mode==='cost'){
   const keyId=req.context.keyId;
   if(typeof keyId!=='string'||keyId.length>80)throw Error('supplier_request_invalid');
   const key=await prisma.licenseKey.findUnique({where:{id:keyId}});
   const order=await prisma.order.findUnique({where:{id:oid},include:{items:{include:{product:true}}}});
   if(!key||key.orderId!==oid||key.status!=='used'||order?.source!=='site'||order.status!=='PAID'||order.items.length!==1||order.items[0].quantity!==1||order.items[0].product.slug!==key.productKey)throw Error('supplier_cost_binding_invalid');
   const audit=await prisma.licenseKeyAuditLog.findFirst({where:{keyId,action:'aisou_purchase'},orderBy:{id:'desc'}});
   console.log(JSON.stringify(audit?.meta?.orderId===oid?{keyId,costRub:audit.meta.costRub}:{keyId,costRub:null}));return;
  }
  const sessionRaw=decrypt(a),s=JSON.parse(sessionRaw),plan=String(s.account?.planType||'').trim().toLowerCase();
  const proof=JSON.parse(r?.proof||'null');
  if(proof?.state!=='fallback_sealed'||proof.source_id!=='gptishka:site:'+oid||!Number.isSafeInteger(proof.prior_attempt_opening_usd_minor)||proof.prior_attempt_opening_usd_minor<0)throw Error('supplier_primary_seal_required');
  const settings=loadSettings();if(!settings){console.log(JSON.stringify({enabled:false}));return}
  const openingBound=Number(settings.policy.openingUsdRubUpperBound);
  if(!(openingBound>0))throw Error('supplier_cost_unconfirmed');
  let product,site,canonical,destination='native';
  if(j.product_type==='codex'&&[250,500,1000].includes(j.package)){
   product='codex-'+j.package;site='https://aiee.fun';canonical=product;destination='pulse-site-codex';
   if(proof.plan!=='credit'+j.package)throw Error('supplier_primary_seal_required');
  }else if(['chatgpt_plus','chatgpt_go','chatgpt_pro_5x','chatgpt_pro_20x','chatgpt_pro_25x'].includes(j.product_type)){
   if(proof.session_hash!==crypto.createHash('sha256').update(sessionRaw).digest('hex'))throw Error('supplier_session_changed');
   product={chatgpt_plus:'chatgpt-plus-1',chatgpt_go:'chatgpt-go-1',chatgpt_pro_5x:'chatgpt-pro-5x-1',chatgpt_pro_20x:'chatgpt-pro-20x-1',chatgpt_pro_25x:'chatgpt-pro-25x-1'}[j.product_type];site=plan==='free'?'https://aiee.fun':'https://vip.sxzfd.com';canonical=require('./aisou-core.cjs').contract(product,plan).product;
  }else throw Error('supplier_product_disabled');
  let result;
  try {result=await procureWebsiteKey({prisma,activationStore,orderId:oid,productKey:product,accountPlan:plan,activationSiteUrl:site,destination,settings,notifyFunds:sendTelegramNotification,reserveProof:{state:'fallback_sealed',orderId:oid,product:canonical,site,sessionFingerprint:a.tokenMeta?.fingerprint,priorOpeningRub:Math.ceil(proof.prior_attempt_opening_usd_minor*openingBound)/100}});}
  catch(e){
   if(e.message==='supplier_balance_insufficient'&&e.fundsWait){
    const current=activationStore.findByOrderId(oid);
    activationStore.upsert({...current,lastProviderPayload:{...(current.lastProviderPayload||{}),fundsWait:e.fundsWait},updatedAt:new Date().toISOString()});
   }
   throw e;
  }
  if(!result){console.log(JSON.stringify({enabled:false}));return}
  if(destination==='native'&&result.code){
   activationStore.upsert({...a,cdk:result.code,activationSiteUrl:site,externalFulfillmentOwner:'pulse-subscription-reserve-v1',status:'processing',verificationState:'pending',keyAllocationState:'selected',keyAllocationSite:site,lastProviderMessage:'Выполняем активацию подходящим резервным ключом.',lastProviderPayload:{...(a.lastProviderPayload||{}),source:'pulse-subscription-reserve-v1'},updatedAt:new Date().toISOString()});
  }
  console.log(JSON.stringify(destination==='native'?{stockAvailable:true,keyId:result.keyId,costRub:result.costRub}:result));
 }finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(f)}}
})().catch(e=>{console.log(JSON.stringify({error:/^supplier_[a-z_]+$/.test(e.message)?e.message:'supplier_requires_review'}));process.exitCode=1}).finally(()=>prisma.$disconnect());
