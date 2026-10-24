'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {start,status,isRoute}=require('./aibuy-activation.cjs');
function response(d){return {ok:true,text:async()=>JSON.stringify(d)}}
const unused={ok:true,workflow:'codex_500',status:'unused'};
test('provider requires the exact denomination and a never-used key before dispatch',async()=>{
 let submits=0,claims=0;
 for(const verify of [{...unused,workflow:'codex_250'},{...unused,status:'done'},{...unused,job_id:'old-job'},{...unused,ok:false}]){
  await assert.rejects(start({cdk:'isolated-fixture',productKey:'codex-500',userCandidates:['{"account":{"planType":"plus"}}'],beforeSubmit:()=>claims++},{fetchImpl:async url=>{if(url.includes('activate'))submits++;return response(verify)}}));
 }
 assert.equal(submits,0);assert.equal(claims,0);
});
test('a lost activation response retains the durable claim and never retries activate',async()=>{
 const events=[];
 const result=await start({cdk:'isolated-fixture',productKey:'codex-500',userCandidates:['{"account":{"planType":"plus"}}'],beforeSubmit:()=>events.push('claim')},{now:()=>1700000000000,fetchImpl:async(url,opts)=>{
  const d=JSON.parse(opts.body);assert.equal(d.code,'isolated-fixture');
  if(url.includes('verifyCdk'))return response(unused);
  events.push('activate');assert.equal(d.product,'gpt');throw Error('timeout');
 }});
 assert.deepEqual(events,['claim','activate']);assert.equal(result.ok,true);assert.equal(result.immediateSuccess,false);assert.match(result.taskId,/^reconcile-/);
});
test('success is confirmed by final provider result; pending and unused are never success',async()=>{
 for(const d of [{ok:true,status:'unused'},{ok:true,status:'processing',job_id:'job'},{ok:true,status:'done',final:false}]){
  const r=await status('fixture','codex-500',async()=>response(d));assert.notEqual(r.json.recharge_status,'success');
 }
 const r=await status('fixture','codex-500',async()=>response({ok:true,status:'done',final:true,workflow:'codex_500',job_id:'job'}));assert.equal(r.json.recharge_status,'success');
 await assert.rejects(status('fixture','codex-500',async()=>response({ok:true,status:'done',final:true,workflow:'codex_250'})));
});
test('route is exact HTTPS origin and no other subscription is redirected',()=>{
 assert.equal(isRoute('https://aichongzhi.fun'),true);assert.equal(isRoute('https://aichongzhi.fun.attacker.test'),false);assert.equal(isRoute('http://aichongzhi.fun'),false);
});
test('AI-BUY demand cutoff excludes older paid orders',()=>{
 const {managed}=require('./aibuy-live.cjs');
 const p={enabled:true,enabledAfter:'2026-10-24T20:00:00Z'};
 const order={source:'site',createdAt:'2026-10-24T19:59:59Z',items:[{product:{slug:'codex-1000'}}]};
 assert.equal(managed(p,order),false);order.createdAt='2026-10-24T20:01:00Z';assert.equal(managed(p,order),true);
 order.items[0].product.slug='chatgpt-plus-1';assert.equal(managed(p,order),false);
});
