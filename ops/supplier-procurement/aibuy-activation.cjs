'use strict';
const SITE='https://aichongzhi.fun';
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
 const credits=Number(String(productKey||'').match(/^codex-(250|500|1000)$/)?.[1]||0);
 const d=await api('status',{code},fetchImpl);
 // Key text is not an oracle; every start independently checks workflow.
 const s=normalized(d);
 if(d.workflow&&credits&&d.workflow!=='codex_'+credits)throw Error('supplier_activation_product_mismatch');
 return {status:200,raw:'',json:{success:true,status:s.success?'used':s.failed?'failed':'processing',recharge_status:s.success?'success':s.failed?'failed':'pending',order_id:s.taskId||null}};
}
async function start(input,{fetchImpl,now=Date.now}={}){
 const credits=Number(String(input.productKey||'').match(/^codex-(250|500|1000)$/)?.[1]||0);
 const token=input.userCandidates.find(x=>typeof x==='string'&&x.trim().startsWith('{'));
 if(!credits||!token||typeof input.beforeSubmit!=='function')throw Error('supplier_activation_contract');
 const checked=await api('verifyCdk',{code:input.cdk,product:'gpt'},fetchImpl);
 if(checked.ok!==true||checked.workflow!=='codex_'+credits||!['unused','available','active','ready'].includes(checked.status)||checked.job_id||checked.task_id||checked.email)throw Error('supplier_key_quarantined');
 input.beforeSubmit();
 const task='reconcile-'+now()+'-aibuy';let response;
 try{response=await api('activate',{code:input.cdk,token,cookie:'',product:'gpt'},fetchImpl)}catch{
  // A transport timeout never returns to a financial/activation retry loop.
  return {ok:true,taskId:task,status:202,body:'',tries:1,immediateSuccess:false,message:'Пополнение отправляется. Проверяем результат автоматически.',providerPayload:{source:'aibuy-codex',submissionDiagnostics:{phase:'submit_recharge',outcome:'uncertain'}}};
 }
 let s;try{s=normalized(response)}catch{
  return {ok:true,taskId:task,status:202,body:'',tries:1,immediateSuccess:false,message:'Проверяем результат пополнения.',providerPayload:{source:'aibuy-codex',submissionDiagnostics:{phase:'submit_recharge',outcome:'uncertain'}}};
 }
 return {ok:true,taskId:s.taskId||task,status:200,body:'',tries:1,immediateSuccess:s.success,message:s.success?'Кредиты успешно зачислены.':'Пополняем кредиты. Пожалуйста, подождите.',providerPayload:{source:'aibuy-codex',submissionDiagnostics:{phase:'submit_recharge',outcome:s.failed?'failed':'accepted'}}};
}
module.exports={isRoute,api,normalized,status,start};
