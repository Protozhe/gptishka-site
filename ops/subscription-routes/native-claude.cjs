'use strict';
const fs=require('node:fs'),net=require('node:net'),crypto=require('node:crypto');
const OWNER='website-claude-zovo-v1',SLUGS=['claude-5x-max','claude-20x-max'];
function config(){
  const f='/var/lib/gptishka-runtime/subscription-routes.json';
  if(!fs.existsSync(f))return {claude:{enabled:false}};
  const st=fs.lstatSync(f);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o027))throw Error('claude_policy_permissions');
  return JSON.parse(fs.readFileSync(f,'utf8'));
}
function eligible(o,p=config()){
  const c=p.claude||{},paid=(o?.payments||[]).filter(x=>x.status==='SUCCESS'),slug=o?.items?.[0]?.product?.slug;
  return c.enabled===true && Number.isFinite(Date.parse(c.enabledAfter)) && o?.source==='site' && o.status==='PAID' && o.currency==='RUB' && SLUGS.includes(slug) && o.items.length===1 && o.items[0].quantity===1 && !o.orderDetails?.selection?.needsNewAccount && +new Date(o.createdAt)>=Date.parse(c.enabledAfter) && paid.length===1 && ['pally','lava','enot','enot.io','gateway'].includes(String(paid[0].provider).toLowerCase()) && o.paymentMethod!=='stub' && paid[0].currency==='RUB' && Number(paid[0].amount)===Number(o.totalAmount) && +new Date(paid[0].processedAt||paid[0].createdAt)>=Date.parse(c.enabledAfter);
}
function validate(raw){
  let s;try{s=JSON.parse(raw)}catch{return 'Вставьте sessionKey аккаунта Claude и подтвердите условия подключения.'}
  if(s?.riskAccepted!==true)return 'Подтвердите условия подключения и готовность аккаунта Claude после KYC.';
  return typeof s.sessionKey==='string' && /^sk-ant-sid[0-9]+-[A-Za-z0-9_-]{30,1500}$/.test(s.sessionKey) ? '' : 'Нужен sessionKey из Cookies на claude.ai, начинающийся с sk-ant-sid. API Key и токен ChatGPT не подходят.';
}
function rpc(payload){
  return new Promise((resolve,reject)=>{
    const s=net.createConnection('/run/gptishka-claude-zovo/rpc.sock');let output='';
    s.setTimeout(185000);s.on('connect',()=>s.end(JSON.stringify(payload)));s.on('timeout',()=>s.destroy(Error('claude_worker_unavailable')));s.on('error',()=>reject(Error('claude_worker_unavailable')));
    s.on('data',d=>{output+=d;if(output.length>65536)s.destroy(Error('claude_reply_invalid'))});s.on('end',()=>{try{resolve(JSON.parse(output))}catch{reject(Error('claude_reply_invalid'))}});
  });
}
function state(a){return a?.lastProviderPayload?.claudeZovo||{}}
function patch(store,id,values,record={}){const a=store.findByOrderId(id);if(!a)return;store.upsert({...a,...record,lastProviderPayload:{...(a.lastProviderPayload||{}),claudeZovo:{...state(a),...values}},updatedAt:new Date().toISOString()})}
async function notice(ctx,id,event,message){
  const a=ctx.activationStore.findByOrderId(id);if(!a||state(a).notices?.[event])return;
  patch(ctx.activationStore,id,{notices:{...(state(a).notices||{}),[event]:'sending'}});
  try{await ctx.notify(`🔔 <b>Claude · ${message.title}</b>\n\n🧾 Заказ: <code>${id}</code>\n\nСтатус: <b>${message.status}</b>\n\n<blockquote>${message.body}</blockquote>`);patch(ctx.activationStore,id,{notices:{...(state(ctx.activationStore.findByOrderId(id)).notices||{}),[event]:'sent'}})}
  catch{patch(ctx.activationStore,id,{notices:{...(state(ctx.activationStore.findByOrderId(id)).notices||{}),[event]:'uncertain'}})}
}
async function fundsWait(ctx,id){
  const a=ctx.activationStore.findByOrderId(id),now=(ctx.now||Date.now)();
  const wait=state(a).fundsWait||{startedAt:now,deadlineAt:now+900000};
  patch(ctx.activationStore,id,{fundsWait:wait});
  const expired=now>=wait.deadlineAt;
  const deadline=new Date(wait.deadlineAt).toLocaleString('ru-RU',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  await notice(ctx,id,expired?'funds:expired':'funds:initial',{title:expired?'Ожидание больше 15 минут':'Нужно пополнить ZovoCard',status:'ожидает средств',body:expired
    ?'15 минут истекли. Пополните баланс ZovoCard. Заказ сохранён; обработчик продолжит после безопасной проверки исходной заявки.'
    :`Недостаточно доступного баланса ZovoCard. На устранение причины: 15 минут, до ${deadline} (Берлин). После пополнения продолжим автоматически. Повторная оплата клиента не требуется.`});
}
async function processOrder(ctx,id){
  const {prisma:db,activationStore:store}=ctx,a=store.findByOrderId(id);if(a?.externalFulfillmentOwner!==OWNER)return;
  const o=await db.order.findUnique({where:{id},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});
  if(!eligible(o,ctx.policy))throw Error('claude_order_ineligible');
  if(a.cdk||o.licenseKeys?.length)throw Error('claude_prior_fulfillment');
  const p=o.payments.find(x=>x.status==='SUCCESS'),fee=p.payload?.commission;
  if(!/^\d+(?:\.\d+)?$/.test(String(fee)))throw Error('claude_commission_unverified');
  const slug=o.items[0].product.slug,source='gptishka:site:'+id;
  const base={product_slug:slug,source_id:source,financial:{payment_verified:true,gross_rub:String(o.totalAmount),payment_commission_rub:String(fee)}};
  const call=async(action,extra={})=>{
    const response=await (ctx.rpc||rpc)({...base,action:'claude_'+action,...extra});
    if(response?.ok!==true)throw Error(/^[a-z_]{1,80}$/.test(response?.reason||'')?'claude_'+response.reason:'claude_worker_unavailable');
    return response.result;
  };
  let result=await call('status');
  if(result?.state==='failed_before_dispatch'&&['wallet_insufficient','wallet_balance_insufficient','insufficient_wallet_balance'].includes(result.reason))await fundsWait(ctx,id);
  const resume=result?.state==='failed_before_dispatch'&&result.can_resume_prepare===true;
  if(resume&&(ctx.now||Date.now)()-Number(state(a).lastPrepareAt||0)<300000)return;
  if(result?.state==='absent'||resume){
    if(!resume&&(a.attempts>0||state(a).providerOrderId))throw Error('claude_dispatch_requires_reconciliation');
    const raw=ctx.decrypt(a),error=validate(raw);if(error)throw Error('claude_session_required');
    const order={platform:'gptishka',account_id:'site',order_id:id,product_slug:slug,product_id:o.items[0].product.id,quantity:1,payment_status:'paid',created_at:new Date(o.createdAt).toISOString(),paid_at:new Date(p.processedAt||p.createdAt).toISOString(),job_id:parseInt(crypto.createHash('sha256').update('claude:'+id).digest('hex').slice(0,11),16),job_status:'ready',email:o.email,buyer_username:'site',has_prior_dispatch:false,has_external_fulfillment:false};
    patch(store,id,{phase:'preparing',lastPrepareAt:(ctx.now||Date.now)()});result=await call('prepare',{order,session:raw});
  }
  if(result?.state==='prepared'){
    if(state(store.findByOrderId(id)).fundsWait)patch(store,id,{fundsWait:null});
    const raw=ctx.decrypt(store.findByOrderId(id));if(validate(raw))throw Error('claude_session_required');
    const order={platform:'gptishka',account_id:'site',order_id:id,product_slug:slug,product_id:o.items[0].product.id,quantity:1,payment_status:'paid',created_at:new Date(o.createdAt).toISOString(),paid_at:new Date(p.processedAt||p.createdAt).toISOString(),job_id:parseInt(crypto.createHash('sha256').update('claude:'+id).digest('hex').slice(0,11),16),job_status:'ready',email:o.email,buyer_username:'site',has_prior_dispatch:false,has_external_fulfillment:false};
    patch(store,id,{phase:'submit_claimed'},{attempts:1});result=await call('submit',{order,session:raw});
  }
  if(!result)throw Error('claude_reply_unconfirmed');
  if(['failed_before_dispatch','terminal_failure','manual_review','funding_uncertain'].includes(result.state)){
    patch(store,id,{phase:result.state,reason:/^[a-z_]{1,80}$/.test(result.reason||'')?result.reason:'provider_review'});
    if(result.state==='failed_before_dispatch'&&['wallet_insufficient','wallet_balance_insufficient','insufficient_wallet_balance'].includes(result.reason))await fundsWait(ctx,id);
    else await notice(ctx,id,'review:'+result.state,{title:'Требуется проверка',status:'оплата остановлена',body:'Поставщик не подтвердил активацию. Исходная заявка сохранена; повторное списание заблокировано. Подробности доступны в админке.'});return;
  }
  result=await call('poll');if(!result)throw Error('claude_reply_unconfirmed');
  patch(store,id,{phase:result.state,providerOrderId:result.provider_order_id||state(store.findByOrderId(id)).providerOrderId||null});
  if(result.state!=='completed')return;
  if(!result.provider_order_id||result.provider_status!=='completed'||!(result.final_amount_minor>0)||result.currency!=='USD')throw Error('claude_completion_unverified');
  if(store.findByOrderId(id).status!=='success')await ctx.complete(id);
  patch(store,id,{phase:'completed',costPending:true,providerOrderId:result.provider_order_id});
  if(result.total_cost_usd_minor>0&&['confirmed','not_required'].includes(result.return_state)){
    const receipt=await call('receipt');
    if(receipt?.provider_order_id!==result.provider_order_id||!(receipt.total_cost_usd_minor>0))throw Error('claude_receipt_unverified');
    patch(store,id,{costPending:false,totalCostUsdMinor:receipt.total_cost_usd_minor,returnedUsdMinor:receipt.returned_usd_minor,cardRemainingUsdMinor:receipt.card_remaining_usd_minor});
    await notice(ctx,id,'completed',{title:'Успешно',status:'подписка активирована',body:`Zovo подтвердил выбранный тариф. Фактический расход: $${(receipt.total_cost_usd_minor/100).toFixed(2)}. Остаток карты проверен: $${(receipt.card_remaining_usd_minor/100).toFixed(2)}. Повторная оплата не запускалась.`});
  }
}
let running=false;
async function tick(ctx){
  if(running)return;running=true;
  try{
    const rows=ctx.activationStore.list().filter(a=>a.externalFulfillmentOwner===OWNER && (a.status==='processing'||a.verificationState==='pending'||state(a).costPending)).slice(0,5);
    for(const r of rows)try{await ctx.lock(r.orderId,()=>processOrder(ctx,r.orderId))}catch(e){
      const code=/^claude_[a-z_]{1,100}$/.test(e?.message||'')?e.message:'claude_worker_unavailable';
      patch(ctx.activationStore,r.orderId,{reason:code});
      if(['claude_wallet_insufficient','claude_wallet_balance_insufficient','claude_insufficient_wallet_balance'].includes(code)) {await fundsWait(ctx,r.orderId);continue;}
      await notice(ctx,r.orderId,code,{title:'Ожидает проверки',status:'заявка сохранена',body:'Автоматическая обработка приостановлена: '+code+'. После восстановления доступности повторно проверим исходную заявку без повторной оплаты.'});
    }
  }finally{running=false}
}
module.exports={OWNER,SLUGS,config,eligible,validate,state,patch,processOrder,tick};
