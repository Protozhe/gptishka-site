'use strict';
const fs=require('node:fs'),net=require('node:net'),path=require('node:path');
const {Journal}=require('./aisou-core.cjs');
const {loadSettings,assertPaidWebsiteOrder,finance}=require('./aisou-live.cjs');
const funds=require('./funds-wait.cjs');
const {contract,cutoff,settingsForProduct}=require('./aibuy-contract.cjs');
const STATE='/var/lib/gptishka-runtime/aisou-procurement/aibuy';
const POLICY='/var/lib/gptishka-runtime/supplier-secrets/aibuy-policy.json';
function policy(){
 try{const st=fs.lstatSync(POLICY);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o027))throw Error('supplier_settings_permissions');return JSON.parse(fs.readFileSync(POLICY,'utf8'))}
 catch(e){if(e.code==='ENOENT')return null;throw e}
}
function managed(p,o){const product=o?.items?.[0]?.product?.slug,start=Date.parse(cutoff(p,product));return p?.enabled===true&&o?.source==='site'&&!!contract(product)&&Number.isFinite(start)&&start<=Date.now()&&+new Date(o.createdAt)>=start}
function rpc(orderId){return new Promise((resolve,reject)=>{
 const socket=net.createConnection('/run/gptishka-aibuy/rpc.sock');let raw='';
 socket.setTimeout(210000,()=>socket.destroy(Error('supplier_purchase_unconfirmed')));
 socket.on('connect',()=>socket.end(JSON.stringify({action:'procure',order_id:orderId})));
 socket.on('data',b=>{raw+=b;if(raw.length>8192)socket.destroy(Error('supplier_reply_invalid'))});
 socket.on('error',()=>reject(Error('supplier_purchase_unconfirmed')));
 socket.on('end',()=>{try{const r=JSON.parse(raw);if(r.error)reject(Error(/^supplier_[a-z_]+$/.test(r.error)?r.error:'supplier_requires_review'));else resolve(r)}catch{reject(Error('supplier_reply_invalid'))}});
})}
async function journal(settings){fs.mkdirSync(STATE,{recursive:true,mode:0o700});const j=new Journal(path.join(STATE,'journal.sqlite'),settings.encryptionKey);await j.initialize();return j}
async function procure({prisma,activationStore,orderId,productKey,accountPlan,notifyFunds,onProgress=async()=>{},transport=rpc,suppliedPolicy,suppliedSettings}){
 const p=suppliedPolicy||policy(),c=contract(productKey);if(!p?.enabled||!c)return null;
 let order=await prisma.order.findUnique({where:{id:orderId},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});
 if(!managed(p,order))return null;
 const settings=suppliedSettings||loadSettings();if(!settings)throw Error('supplier_disabled');
 const cfg=settingsForProduct(settings,p,productKey);
 const site='https://aichongzhi.fun',expected={product:productKey,site},credits=c.code;
 const eligible=['plus','pro','prolite','prolight','pro5x','pro20x','pro25x','pro50x'];
 if(productKey!=='claude-pro'&&!eligible.includes(String(accountPlan).toLowerCase().replace(/[ _-]/g,'')))throw Error('supplier_account_ineligible');
 let a=activationStore.findByOrderId(orderId);
 const sites=productKey==='claude-pro'?[site]:[site,'https://aiee.fun'];
 const bound=(order.licenseKeys||[]).filter(k=>k.productKey===productKey&&sites.includes(k.activationSiteUrl)&&k.orderId===orderId&&k.status==='used');
 if(bound.length===1&&!a.cdk&&!a.taskId&&!a.attempts){
  assertPaidWebsiteOrder({...order,licenseKeys:[]},a,productKey,expected,cfg);
  const audit=await prisma.licenseKeyAuditLog.findFirst({where:{keyId:bound[0].id,action:{in:['aibuy_purchase','aibuy_stock_import','aiee_prepaid_fallback']}}});
  if(audit?.meta?.orderId===orderId||(audit?.action==='aibuy_stock_import'&&audit?.meta?.productKey===productKey))return {keyId:bound[0].id,code:bound[0].keyValue,activationSiteUrl:bound[0].activationSiteUrl};
 }
 assertPaidWebsiteOrder(order,a,productKey,expected,cfg);
 if(a.externalFulfillmentOwner)throw Error('supplier_prior_fulfillment');
 await onProgress({phase:'checking',product:productKey,provider:'aibuy'});
 const j=await journal(settings),scope='website:'+orderId;
 try{
  await j.run('CREATE TABLE IF NOT EXISTS demands(scope TEXT PRIMARY KEY,product TEXT NOT NULL,created_at TEXT NOT NULL)');
  await j.run('INSERT OR IGNORE INTO demands VALUES(?,?,?)',[scope,productKey,new Date().toISOString()]);
  if(p.paused)throw Error('supplier_owner_topup_pause');
  const result=await transport(orderId);
  if(result.state==='prepaid_fallback'){
   if(p.prepaidAieeFallback?.enabled!==true||productKey!=='codex-1000'||result.source!=='owner_prepaid_aiee'||result.credits!==1000||result.activationSiteUrl!=='https://aiee.fun'||result.primary_sealed_no_charge!==true||! /^[a-f0-9]{64}$/.test(result.fallback_id||'')||!Number.isSafeInteger(result.amount_minor)||result.amount_minor<=0||result.amount_minor>27600||!Number.isSafeInteger(result.usdt_minor)||result.usdt_minor<=0||typeof result.code!=='string')throw Error('supplier_fallback_unverified');
   order=await prisma.order.findUnique({where:{id:orderId},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});a=activationStore.findByOrderId(orderId);
   const payment=assertPaidWebsiteOrder(order,a,productKey,expected,cfg),cost=finance(order,payment,{amountMinor:result.amount_minor},cfg);
   const cutoff=Date.parse(p.prepaidAieeFallback.enabledAfter);
   const created=+new Date(order.createdAt),paid=+new Date(payment.processedAt||payment.createdAt);
   if(!Number.isFinite(cutoff)||cutoff>Date.now()||!Number.isFinite(created)||!Number.isFinite(paid)||created<cutoff||paid<cutoff)throw Error('supplier_fallback_old_order');
   const key=await prisma.$transaction(async tx=>{
    const old=await tx.licenseKey.findUnique({where:{keyValue:result.code}});
    if(old){if(old.orderId!==orderId||old.productKey!==productKey||old.activationSiteUrl!=='https://aiee.fun'||old.status!=='used')throw Error('supplier_stock_conflict');return old}
    const fresh=await tx.order.findUnique({where:{id:orderId},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});
    assertPaidWebsiteOrder(fresh,activationStore.findByOrderId(orderId),productKey,expected,cfg);
    const k=await tx.licenseKey.create({data:{keyValue:result.code,productKey,activationSiteUrl:'https://aiee.fun',status:'used',orderId,email:fresh.email,usedAt:new Date()}});
    await tx.licenseKeyAuditLog.create({data:{keyId:k.id,action:'aiee_prepaid_fallback',meta:{orderId,supplier:'owner_prepaid_aiee',fallbackId:result.fallback_id,amountCny:result.amount_minor/100,amountUsdt:result.usdt_minor/100,purchasedOn:result.purchased_on,costRub:cost.costRub,costSource:cfg.costSource,primarySealedNoCharge:true}}});return k;
   });
   await funds.resolve(j,scope,notifyFunds,Date.now(),'AI-BUY');
   await onProgress({phase:'received',product:productKey,provider:'aiee_prepaid_fallback'});
   return {keyId:key.id,code:result.code,activationSiteUrl:'https://aiee.fun'};
  }
  if(result.state==='stock_available'){
   for(const activationSiteUrl of sites){
    const reserved=await activationStore.reserveCdkRecordForOrder({productKey,activationSiteUrl,orderId,email:order.email});
    if(reserved)return reserved;
   }
   throw Error('supplier_stock_changed');
  }
  if(result.state==='funds_wait'){
   const row=await funds.hold(j,scope,result.required_minor,result.balance_minor);
   await funds.notify(j,row,notifyFunds,Date.now(),'AI-BUY');
   const error=Error('supplier_balance_insufficient');error.fundsWait={startedAt:row.started_at,deadlineAt:row.deadline_at};throw error;
  }
  if(result.credits!==credits||(credits===0&&result.product_key!=='claude-pro')||result.activationSiteUrl!==site||typeof result.code!=='string'||!/^\d{10,32}$/.test(result.trade_no||'')||!Number.isSafeInteger(result.amount_minor)||result.amount_minor<=0||result.amount_minor>c.ceiling)throw Error('supplier_reply_invalid');
  order=await prisma.order.findUnique({where:{id:orderId},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});a=activationStore.findByOrderId(orderId);
  const payment=assertPaidWebsiteOrder(order,a,productKey,expected,cfg),cost=finance(order,payment,{amountMinor:result.amount_minor},cfg);
  const key=await prisma.$transaction(async tx=>{
   const old=await tx.licenseKey.findUnique({where:{keyValue:result.code}});
   if(old){if(old.orderId!==orderId||old.productKey!==productKey||old.activationSiteUrl!==site||old.status!=='used')throw Error('supplier_stock_conflict');return old}
   const fresh=await tx.order.findUnique({where:{id:orderId},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});
   assertPaidWebsiteOrder(fresh,activationStore.findByOrderId(orderId),productKey,expected,cfg);
   const k=await tx.licenseKey.create({data:{keyValue:result.code,productKey,activationSiteUrl:site,status:'used',orderId,email:fresh.email,usedAt:new Date()}});
   await tx.licenseKeyAuditLog.create({data:{keyId:k.id,action:'aibuy_purchase',meta:{orderId,supplier:'aibuy',tradeNo:result.trade_no,amountCny:result.amount_minor/100,costRub:cost.costRub,costSource:cfg.costSource}}});return k;
  });
  await funds.resolve(j,scope,notifyFunds,Date.now(),'AI-BUY');
  await onProgress({phase:'received',product:productKey,provider:'aibuy'});
  return {keyId:key.id,code:result.code,activationSiteUrl:site};
 }finally{await j.close()}
}
async function pending(activeIds){
 const p=policy(),settings=loadSettings();if(!p?.enabled||!settings||!fs.existsSync(path.join(STATE,'journal.sqlite')))return [];
 const j=await journal(settings);try{const rows=await new Promise((res,rej)=>j.db.all('SELECT scope FROM demands ORDER BY rowid',[],(e,r)=>e?rej(e):res(r)));const active=new Set(activeIds);return rows.map(r=>r.scope.slice(8)).filter(id=>active.has(id)).slice(0,20)}finally{await j.close()}
}
async function due(activeIds,send){const settings=loadSettings();if(!settings||!fs.existsSync(path.join(STATE,'journal.sqlite')))return;const j=await journal(settings);try{await funds.due(j,activeIds.map(id=>'website:'+id),send,Date.now(),'AI-BUY')}finally{await j.close()}}
module.exports={policy,managed,procure,pending,due};
