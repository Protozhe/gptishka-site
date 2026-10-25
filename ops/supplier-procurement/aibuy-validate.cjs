'use strict';
// Root broker invokes this as the website user. Input is an order ID, never a
// caller-supplied paid flag, denomination, session, price or spending budget.
const fs=require('node:fs'),crypto=require('node:crypto');
const root='/var/www/gptishka-new';
const {prisma}=require(root+'/apps/admin-backend/dist/config/prisma.js');
const {env}=require(root+'/apps/admin-backend/dist/config/env.js');
const {activationStore}=require(root+'/apps/admin-backend/dist/modules/orders/activation.store.js');
const {loadSettings,assertPaidWebsiteOrder,finance}=require('./aisou-live.cjs');
const {Journal}=require('./aisou-core.cjs');
async function validate(req) {
 if(!/^[a-z0-9]{20,40}$/.test(req.order_id||''))throw Error('supplier_request_invalid');
 const policy=JSON.parse(fs.readFileSync('/var/lib/gptishka-runtime/supplier-secrets/aibuy-policy.json'));
 if(policy.enabled!==true)throw Error('supplier_disabled');
 if(policy.paused===true)throw Error('supplier_owner_topup_pause');
 const settings=loadSettings();if(!settings)throw Error('supplier_disabled');
 const order=await prisma.order.findUnique({where:{id:req.order_id},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});
 const a=activationStore.findByOrderId(req.order_id),product=order?.items?.[0]?.product?.slug;
 if(!/^codex-(250|500|1000)$/.test(product||''))throw Error('supplier_product_disabled');
 const credits=Number(product.slice(6)),ceilings={250:7500,500:14500,1000:27600};
 const expected={product,site:'https://aichongzhi.fun'};
 const paid=assertPaidWebsiteOrder(order,a,product,expected,{...settings.policy,enabledAfter:policy.enabledAfter,productEnabledAfter:{}});
 if(a.externalFulfillmentOwner)throw Error('supplier_prior_fulfillment');
 const key=crypto.createHash('sha256').update('gptishka:activation-token:v1:'+String(env.ACTIVATION_TOKEN_ENCRYPTION_KEY||env.JWT_ACCESS_SECRET||'').trim()).digest();
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(a.clientTokenIv,'base64'));decipher.setAuthTag(Buffer.from(a.clientTokenAuthTag,'base64'));
 const session=JSON.parse(Buffer.concat([decipher.update(Buffer.from(a.clientTokenCiphertext,'base64')),decipher.final()]).toString());
 const plan=String(session.account?.planType||'').toLowerCase().replace(/[ _-]/g,'');
 if(!['plus','pro','prolite','prolight','pro5x','pro20x','pro25x','pro50x'].includes(plan))throw Error('supplier_account_ineligible');
 // An earlier AISOU request must never silently acquire a second purchase.
 const file='/var/lib/gptishka-runtime/aisou-procurement/journal.sqlite';
 if(fs.existsSync(file)){
  const j=new Journal(file,settings.encryptionKey);try{
   const prior=await j.get('SELECT state FROM purchases WHERE scope IN (?,?)',['website:'+order.id+':primary','website:'+order.id+':correction-1']);
   if(prior)throw Error('supplier_prior_purchase_review');
  }finally{await j.close()}
 }
 const amount=req.amount_minor===undefined?ceilings[credits]:req.amount_minor;
 if(!Number.isSafeInteger(amount)||amount<=0||amount>ceilings[credits])throw Error('supplier_price_hold');
 const cost=finance(order,paid,{amountMinor:amount},settings.policy);
 const stock=await prisma.licenseKey.findFirst({where:{productKey:product,status:'available',activationSiteUrl:{in:['https://aiee.fun','https://aichongzhi.fun']}},select:{id:true}});
 return {order_id:order.id,credits,amount_minor:amount,cost_rub:cost.costRub,rate:cost.rateRubPerCny,budget_minor:cost.totalBudgetMinor,stock_available:!!stock,created_at:order.createdAt,payment_at:paid.processedAt||paid.createdAt};
}
if(require.main===module)(async()=>{let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>2048)throw Error('supplier_request_invalid')}console.log(JSON.stringify(await validate(JSON.parse(raw))))})().catch(e=>{console.log(JSON.stringify({error:/^supplier_[a-z_]+$/.test(e.message)?e.message:'supplier_order_unconfirmed'}));process.exitCode=1}).finally(()=>prisma.$disconnect());
module.exports={validate};
