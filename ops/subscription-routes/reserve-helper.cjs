// Private website-side RPC; peer identity is checked by the Unix socket broker.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),path=require('path');
const root='/var/www/gptishka-new',owner='pulse-subscription-reserve-v1';let rpcRequest;
const {env}=require(root+'/apps/admin-backend/dist/config/env.js'),{PrismaClient}=require(root+'/node_modules/@prisma/client');const db=new PrismaClient();
const {activationStore}=require(root+'/apps/admin-backend/dist/modules/orders/activation.store.js');
const products={chatgpt_plus:['chatgpt-plus-1','pulse-siteplus-v1'],chatgpt_go:['chatgpt-go-1','pulse-sitego-v1'],chatgpt_pro_5x:['chatgpt-pro-5x-1','pulse-sitepro5x-v1'],chatgpt_pro_20x:['chatgpt-pro-20x-1','pulse-sitepro20x-v1'],chatgpt_pro_25x:['chatgpt-pro-25x-1','pulse-sitepro500-v1']};
function pulse(id){
 const p=rpcRequest.context;
 if(!p?.job||p.job.order_id!==id||p.job.platform!=='gptishka'||p.job.account_id!=='site')throw Error('reserve_snapshot_invalid');
 return p;
}
function decrypt(a){
 if(!a?.clientTokenCiphertext||new Date(a.clientTokenExpiresAt)<=new Date())throw Error('reserve_session_required');
 const k=crypto.createHash('sha256').update('gptishka:activation-token:v1:'+String(env.ACTIVATION_TOKEN_ENCRYPTION_KEY||env.JWT_ACCESS_SECRET||'').trim()).digest();
 const d=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(a.clientTokenIv,'base64'));d.setAuthTag(Buffer.from(a.clientTokenAuthTag,'base64'));
 const raw=Buffer.concat([d.update(Buffer.from(a.clientTokenCiphertext,'base64')),d.final()]).toString('utf8'),s=JSON.parse(raw);
 if(!s.sessionToken||!s.account?.id||!s.user?.email)throw Error('reserve_session_required');
 return {raw,email:s.user.email.trim()};
}
async function load(id){return db.order.findUnique({where:{id},include:{payments:true,items:{include:{product:true}},licenseKeys:true}})}
async function lock(id,fn){
 const dir=path.join(process.env.GPTISHKA_RUNTIME_DIR||process.env.RUNTIME_DIR||'/var/lib/gptishka-runtime','order-locks');fs.mkdirSync(dir,{recursive:true});
 const f=path.join(dir,crypto.createHash('sha1').update(id).digest('hex')+'.lock');let fd;
 try{fd=fs.openSync(f,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString(),orderId:id}));return await fn()}
 finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(f)}}
}
function check(o,p){
 const j=p.job,def=products[j?.product_type],cfg=rpcRequest.context.config;
 if(!cfg.enabled||!j||!def||!o||o.source!=='site'||o.status!=='PAID'||o.currency!=='RUB'||o.items.length!==1||o.items[0].quantity!==1||o.items[0].product.slug!==def[0]||o.orderDetails?.selection?.serverDeliveryType!=='activation')throw Error('reserve_order_ineligible');
 const paid=o.payments.filter(x=>x.status==='SUCCESS');
 const cutoff=new Date(cfg.product_enabled_after?.[j.product_type]||cfg.enabled_after);
 if(!Number.isFinite(+cutoff)||paid.length!==1||!['pally','lava','enot','enot.io','gateway'].includes(String(paid[0].provider).toLowerCase())||o.paymentMethod==='stub'||paid[0].currency!=='RUB'||Number(paid[0].amount)!==Number(o.totalAmount)||o.createdAt<cutoff||(paid[0].processedAt||paid[0].createdAt)<cutoff)throw Error('reserve_payment_unverified');
 const a=activationStore.findByOrderId(o.id);if(!a)throw Error('reserve_record_missing');
 if(a.status==='success'||a.verificationState==='success')throw Error('reserve_already_complete');
 const ours=a.externalFulfillmentOwner===owner;
 if(!ours&&(a.cdk||a.taskId||a.attempts>0||o.licenseKeys.length))throw Error('reserve_prior_fulfillment');
 if(!ours&&a.externalFulfillmentOwner!==def[1])throw Error('reserve_owner_mismatch');
 return {a,pay:paid[0],def};
}
(async()=>{
 let input='';for await(const part of process.stdin){input+=part;if(input.length>8192)throw Error('reserve_request_invalid')};const req=JSON.parse(input);rpcRequest=req;
 if(req.action==='watch'){
  const since=new Date(req.since);if(!Number.isFinite(+since))throw Error('reserve_request_invalid');
  const orders=await db.order.findMany({where:{source:'site',createdAt:{gte:since},items:{some:{product:{slug:{in:Object.values(products).map(x=>x[0])}}}}},include:{payments:true,items:{include:{product:true}},licenseKeys:true},orderBy:{createdAt:'asc'},take:100});
  const result=[];for(const o of orders){const pay=o.payments.find(x=>x.status==='SUCCESS'&&(x.processedAt||x.createdAt)>=since);if(!pay)continue;
   const a=activationStore.findByOrderId(o.id),nativeKey=!!a?.cdk&&['https://aiee.fun','https://vip.sxzfd.com'].includes(a?.activationSiteUrl)&&o.licenseKeys.filter(k=>k.status==='used'&&k.keyValue===a.cdk&&k.orderId===o.id&&k.activationSiteUrl===a.activationSiteUrl).length===1;
   let manual=false;if(nativeKey&&a?.status==='success'&&a?.verificationState==='success')manual=(await db.auditLog.count({where:{entityType:'order',entityId:o.id,action:{in:['activation_admin_start','activation_admin_complete','activation_manual_complete']}}}))>0;
   result.push({order_id:o.id,platform:'gptishka',account_id:'site',paid_at:(pay.processedAt||pay.createdAt).toISOString(),slug:o.items[0]?.product?.slug,status:o.status,activation_status:a?.status||null,verification_state:a?.verificationState||null,has_session:!!a?.clientTokenCiphertext,owner:a?.externalFulfillmentOwner||null,task_id:!!a?.taskId,native_key_bound:nativeKey,native_attempts:a?.attempts||0,manual_activation:manual});}
  console.log(JSON.stringify({orders:result}));return;
 }
 if(!/^[a-z0-9]{20,40}$/.test(req.order_id||''))throw Error('reserve_request_invalid');
 const result=await lock(req.order_id,async()=>{
  const o=await load(req.order_id),p=pulse(req.order_id);
  if(req.action==='complete'&&activationStore.findByOrderId(o?.id)?.status==='success')return {completed:true,reused:true};
  const {a,pay,def}=check(o,p),j=p.job,r=p.reserve;
  const s=req.action==='complete'?{raw:'',email:j.email}:decrypt(a);
  let fee=null;if(pay.payload?.commission!=null&&/^\d+(\.\d+)?$/.test(String(pay.payload.commission)))fee=String(pay.payload.commission);
  const evidence={session:s.raw,order:{platform:'gptishka',account_id:'site',order_id:o.id,product_type:j.product_type,product_id:o.items[0].product.id,product_slug:def[0],order_source:'site',quantity:1,package:1,payment_status:'paid',paid_at:(pay.processedAt||pay.createdAt).toISOString(),created_at:o.createdAt.toISOString(),routed_at:j.created_at,job_id:j.id,job_status:'ready',email:s.email,has_prior_dispatch:false,has_external_fulfillment:false},financial:{platform:'gptishka',order_id:o.id,payment_verified:true,gross_rub:String(o.totalAmount),quantity:1,title:j.title,provider:pay.provider,payment_commission_rub:fee,key_pool:'subscription_reserve'}};
  if(req.action==='evidence')return evidence;
  if(req.action==='available'){
   const plan=String(JSON.parse(s.raw).account?.planType||'').trim().toLowerCase(),active=['plus','go','pro','prolight','prolite','promax','pro_5x','pro_20x','pro_50x'];
   if(plan!=='free'&&!active.includes(plan))throw Error('reserve_unknown_plan');
   const pool=(j.product_type==='chatgpt_plus'?'plus':j.product_type==='chatgpt_go'?'go':{'chatgpt_pro_5x':'pro5x','chatgpt_pro_20x':'pro20x','chatgpt_pro_25x':'pro25x'}[j.product_type]||'unsupported')+(plan==='free'?'_free':'_active');
   if(pool!==req.pool)throw Error('reserve_pool_mismatch');
   const site=plan==='free'?'https://aiee.fun':'https://vip.sxzfd.com';
   return {available:!!await db.licenseKey.findFirst({where:{productKey:def[0],activationSiteUrl:site,status:'available'},select:{id:true}})};
  }
  if(!r?.proof||JSON.parse(r.proof).state!=='fallback_sealed'||(req.action!=='complete'&&JSON.parse(r.proof).session_hash!==crypto.createHash('sha256').update(s.raw).digest('hex')))throw Error('reserve_seal_missing');
  const site=r.provider==='vip'?'https://vip.sxzfd.com':r.provider==='aiee'?'https://aiee.fun':null;
  if(!site||!products[j.product_type]||(j.product_type==='chatgpt_pro_25x'&&site==='https://vip.sxzfd.com'))throw Error('reserve_pool_unsupported');
  if(req.action==='reserve'){
   let assigned=o.licenseKeys.filter(k=>k.productKey===def[0]&&k.activationSiteUrl===site&&k.status==='used');
   if(o.licenseKeys.length!==assigned.length||assigned.length>1)throw Error('reserve_assignment_conflict');
   let key=assigned[0]?{keyId:assigned[0].id,code:assigned[0].keyValue}:await activationStore.reserveCdkRecordForOrder({productKey:def[0],activationSiteUrl:site,orderId:o.id,email:o.email});
   if(!key)return {empty:true};
   if(a.cdk&&a.cdk!==key.code)throw Error('reserve_assignment_conflict');
   activationStore.upsert({...a,cdk:key.code,activationSiteUrl:site,externalFulfillmentOwner:owner,keyAllocationState:'selected',keyAllocationSite:site,status:'processing',verificationState:'pending',lastProviderMessage:'Выполняем активацию через резервный канал. Повторная оплата заблокирована.',lastProviderPayload:{...(a.lastProviderPayload||{}),source:owner},updatedAt:new Date().toISOString()});
   return {key_id:key.keyId,key:key.code};
  }
  if(req.action==='complete'){
   const receipt=req.context.receipt;
   const assigned=o.licenseKeys.find(k=>k.id===r.key_id&&k.keyValue===a.cdk&&k.orderId===o.id&&k.activationSiteUrl===site);
   if(!assigned||!r.dispatched||receipt.order_id!==o.id||receipt.key_id!==r.key_id||receipt.provider_status!=='success'||receipt.provider_order_id!==r.provider_order_id||!receipt.provider_order_id)throw Error('reserve_receipt_unverified');
   const {ordersService}=require(root+'/apps/admin-backend/dist/modules/orders/orders.service.js');
   await ordersService.manuallyCompleteActivation(o.id,{note:'Подписка активирована резервным ключом. Успешное выполнение подтверждено поставщиком; заявка Zovo заблокирована от повторной оплаты.'},{userAgent:owner});
   return {completed:true};
  }
  throw Error('reserve_request_invalid');
 });console.log(JSON.stringify(result));
})().catch(e=>{console.log(JSON.stringify({error:/^reserve_[a-z_]+$/.test(e.message)?e.message:'reserve_access_unavailable'}));process.exitCode=1}).finally(()=>db.$disconnect().finally(()=>process.exit(process.exitCode||0)));
