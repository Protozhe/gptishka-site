const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./website-rpc.cjs'),'utf8');
const oid='cmwfixture0000000000000001';
async function run(productType,context={}){
 let purchases=0,settingsReads=0,unlocked=0,reply,exitCode;
 const product='chatgpt-plus-1',keyId='fixture-key';
 const result=new Promise((resolve,reject)=>{
  const prisma={
   licenseKey:{findUnique:async()=>({id:keyId,orderId:oid,status:'used',productKey:product})},
   order:{findUnique:async()=>({source:'site',status:'PAID',items:[{quantity:1,product:{slug:product}}]})},
   licenseKeyAuditLog:{findFirst:async()=>({meta:{orderId:oid,costRub:976.8}})},
   $disconnect:async()=>resolve(),
  };
  const mocks={
   'node:fs':{openSync:()=>9,writeFileSync(){},closeSync(){unlocked++},unlinkSync(){}},
   'node:path':require('node:path'),'node:crypto':require('node:crypto'),
   '/var/www/gptishka-new/apps/admin-backend/dist/config/env.js':{env:{}},
   '/var/www/gptishka-new/apps/admin-backend/dist/config/prisma.js':{prisma},
   '/var/www/gptishka-new/apps/admin-backend/dist/modules/orders/activation.store.js':{activationStore:{findByOrderId:()=>({orderId:oid,productKey:product})}},
   './aisou-live.cjs':{procureWebsiteKey:async()=>{purchases++;throw Error('Unexpected merchant request')},loadSettings(){settingsReads++;throw Error('Unexpected merchant configuration read')}},
   '/var/www/gptishka-new/apps/admin-backend/dist/modules/notifications/notifications.service.js':{sendTelegramNotification(){throw Error('No live notifications')}},
  };
  const input=JSON.stringify({action:'procure',order_id:oid,context:{job:{order_id:oid,platform:'gptishka',account_id:'site',product_type:productType},...context}});
  const process={env:{},stdin:{async *[Symbol.asyncIterator](){yield input}},set exitCode(v){exitCode=v}};
  try{vm.runInNewContext(source,{require(name){if(!(name in mocks))throw Error('Unexpected import: '+name);return mocks[name]},process,Buffer,console:{log(raw){reply=JSON.parse(raw)}}});}catch(e){reject(e)}
 });
 await result;return {reply,purchases,settingsReads,unlocked,exitCode};
}
test('all ChatGPT fallback pools wait for owner stock without purchasing or reading credentials',async()=>{
 for(const kind of ['chatgpt_plus','chatgpt_go','chatgpt_pro_5x','chatgpt_pro_20x','chatgpt_pro_25x']){
  const out=await run(kind);
  assert.deepEqual(out.reply,{enabled:false,ownerStockOnly:true});
  assert.equal(out.purchases,0);assert.equal(out.settingsReads,0);assert.equal(out.unlocked,1);assert.equal(out.exitCode,undefined);
 }
});
test('cost reconciliation for an earlier bound ChatGPT purchase remains available',async()=>{
 const out=await run('chatgpt_plus',{mode:'cost',keyId:'fixture-key'});
 assert.deepEqual(out.reply,{keyId:'fixture-key',costRub:976.8});
 assert.equal(out.purchases,0);assert.equal(out.settingsReads,0);assert.equal(out.unlocked,1);
});
