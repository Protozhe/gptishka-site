'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {claim}=require('./market-shared-stock.cjs');
function fixture(){
 const rows=[250,500,1000].flatMap(n=>['https://aiee.fun','https://aichongzhi.fun'].map((site,i)=>({id:n+'-'+i,productKey:'codex-'+n,activationSiteUrl:site,status:'available',orderId:null,keyValue:'FIXTURE-'+n+'-'+i})));
 rows.push({id:'held500',productKey:'codex-500',activationSiteUrl:'https://aiee.fun',status:'reserved',orderId:null,keyValue:'FIXTURE-HELD'});
 const audits=[];let tail=Promise.resolve();
 const tx={
  async $queryRaw(strings,...values){const sql=strings.join('?');if(sql.includes('pg_advisory'))return [];
   assert.match(sql,/FOR UPDATE SKIP LOCKED/);assert.match(sql,/reserved_at IS NULL/);
   const [pk,siteA,siteB]=values;const row=rows.filter(r=>r.productKey===pk&&r.status==='available'&&!r.orderId&&[siteA,siteB].includes(r.activationSiteUrl)).sort((a,b)=>Number(b.activationSiteUrl===siteA)-Number(a.activationSiteUrl===siteA))[0];return row?[{id:row.id}]:[];},
  licenseKey:{async findUnique({where}){return rows.find(r=>r.id===where.id)},async updateMany({where,data}){const row=rows.find(r=>r.id===where.id&&r.status===where.status);if(!row)return {count:0};Object.assign(row,data);return {count:1}}},
  licenseKeyAuditLog:{async findMany({where}){return audits.filter(r=>r.meta.scope===where.meta.equals)},async create({data}){audits.push(data)}}
 };
 return {rows,audits,prisma:{$transaction:async fn=>{const prior=tail;let done;tail=new Promise(r=>done=r);await prior;try{return await fn(tx)}finally{done()}}}};
}
const input=(scope,credits=500)=>({scope:'m'+scope.repeat(31),credits,platform:'funpay',action:'claim'});
test('marketplaces share exact pools, prioritize AI-BUY and keep owner reserves',async()=>{
 const f=fixture();const first=await claim(input('a'),f.prisma);assert.equal(first.activationSiteUrl,'https://aichongzhi.fun');
 const second=await claim({...input('b'),platform:'playerok'},f.prisma);assert.equal(second.activationSiteUrl,'https://aiee.fun');
 assert.deepEqual(await claim(input('c'),f.prisma),{state:'empty'});assert.equal(f.rows.find(r=>r.id==='held500').status,'reserved');
 assert.equal((await claim(input('d',250),f.prisma)).product_key,'codex-250');
});
test('parallel/restarted requests reuse one key and attest binds scope, provider and nominal',async()=>{
 const f=fixture(),request=input('e');const [a,b]=await Promise.all([claim(request,f.prisma),claim(request,f.prisma)]);
 assert.equal(a.native_key_id,b.native_key_id);assert.equal(f.audits.length,1);
 const proof=await claim({...request,action:'attest',key_id:a.native_key_id},f.prisma);assert.equal(proof.code,undefined);assert.equal(proof.fingerprint,a.fingerprint);
 for(const altered of [{credits:1000},{platform:'playerok'},{key_id:'another'}])await assert.rejects(()=>claim({...request,action:'attest',...altered},f.prisma));
});
test('unsupported denominations and foreign sources cannot claim stock',async()=>{
 const f=fixture();for(const change of [{credits:2500},{platform:'site'},{scope:'other'},{action:'purchase'}])await assert.rejects(()=>claim({...input('f'),...change},f.prisma));
 assert.equal(f.audits.length,0);
});
