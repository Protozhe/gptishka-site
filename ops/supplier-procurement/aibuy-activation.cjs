'use strict';
const SITE='https://aichongzhi.fun';
const {contract}=require('./aibuy-contract.cjs');
function isRoute(value){try{return new URL(String(value)).origin===SITE}catch{return false}}
async function api(action,payload,fetchImpl=fetch){
 const r=await fetchImpl(SITE+'/api/redeem.php?a='+action,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error('supplier_activation_unconfirmed');
 const raw=await r.text();if(raw.length>262144)throw Error('supplier_activation_unconfirmed');
 return JSON.parse(raw);
}
function normalized(d){
 if(d?.ok!==true)throw Error('supplier_activation_unconfirmed');
 const state=String(d.status||'').toLowerCase();
 const success=d.final===true&&['done','success'].includes(state);
 const failed=d.final===true&&!success;
 return {success,failed,pending:!success&&!failed,taskId:String(d.job_id||d.task_id||''),data:d};
}
async function status(code,productKey,fetchImpl){
 const c=contract(productKey);if(!c)throw Error('supplier_activation_contract');
 const d=await api('status',{code,...(c.provider==='claude'?{product:'claude'}:{})},fetchImpl);
 // Key text is not an oracle; every start independently checks workflow.
 const s=normalized(d);
 if(d.workflow&&d.workflow!==c.workflow)throw Error('supplier_activation_product_mismatch');
 if(c.provider==='claude'&&d.workflow!==c.workflow)throw Error('supplier_activation_product_mismatch');
 const unused=!s.taskId&&d.final!==true&&['unused','available','active','ready'].includes(String(d.status||''));
 return {status:200,raw:'',json:{success:true,status:s.success?'used':s.failed?'failed':unused?'unused':'processing',recharge_status:s.success?'success':s.failed?'failed':unused?'unused':'pending',order_id:s.taskId||null}};
}
async function start(input,{fetchImpl,now=Date.now}={}){
 const c=contract(input.productKey),claude=c?.provider==='claude';
 const token=input.userCandidates.find(x=>typeof x==='string'&&(claude?/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.trim()):x.trim().startsWith('{')))?.trim();
 if(!c||!token||typeof input.beforeSubmit!=='function')throw Error('supplier_activation_contract');
 const checked=await api('verifyCdk',{code:input.cdk,product:c.provider},fetchImpl);
 if(checked.ok!==true||checked.workflow!==c.workflow||!['unused','available','active','ready'].includes(checked.status)||checked.job_id||checked.task_id||checked.email)throw Error('supplier_key_quarantined');
 await input.beforeSubmit();
 const source=claude?'aibuy-claude':'aibuy-codex';
 const task='reconcile-'+now()+'-aibuy';let response;
 try{response=await api('activate',{code:input.cdk,token,cookie:'',product:c.provider},fetchImpl)}catch{
  // A transport timeout never returns to a financial/activation retry loop.
  return {ok:true,taskId:task,status:202,body:'',tries:1,immediateSuccess:false,message:'Заявка отправляется. Проверяем результат автоматически.',providerPayload:{source,submissionDiagnostics:{phase:'submit_recharge',outcome:'uncertain'}}};
 }
 let s;try{if(response.workflow&&response.workflow!==c.workflow)throw Error('mismatch');s=normalized(response)}catch{
  return {ok:true,taskId:task,status:202,body:'',tries:1,immediateSuccess:false,message:'Проверяем результат активации.',providerPayload:{source,needsReview:true,submissionDiagnostics:{phase:'submit_recharge',outcome:'uncertain'}}};
 }
 return {ok:true,taskId:s.taskId||task,status:200,body:'',tries:1,immediateSuccess:s.success,message:s.success?(claude?'Подписка успешно активирована.':'Кредиты успешно зачислены.'):'Выполняем активацию. Пожалуйста, подождите.',providerPayload:{source,needsReview:s.failed,submissionDiagnostics:{phase:'submit_recharge',outcome:s.failed?'failed':'accepted'}}};
}
module.exports={isRoute,api,normalized,status,start};
