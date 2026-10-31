'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {claim}=require('./market-shared-stock.cjs');
function fixture(){
 const rows=[250,500,1000].flatMap(n=>['https://aiee.fun','https://aichongzhi.fun'].map((site,i)=>({id:n+'-'+i,productKey:'codex-'+n,activationSiteUrl:site,status:'available',orderId:null,keyValue:'FIXTURE-'+n+'-'+i})));
 rows.push({id:'held500',productKey:'codex-500',activationSiteUrl:'https://aiee.fun',status:'reserved',orderId:null,keyValue:'FIXTURE-HELD'});
 rows.push(...['https://aiee.fun','https://aichongzhi.fun'].map((site,i)=>({id:'claude-'+i,productKey:'claude-pro',activationSiteUrl:site,status:'available',orderId:null,keyValue:'FIXTURE-CLAUDE-'+i})));
 const audits=[];let tail=Promise.resolve();
 const tx={
  async $queryRaw(strings,...values){const sql=strings.join('?');if(sql.includes('pg_advisory'))return [];
   assert.match(sql,/FOR UPDATE SKIP LOCKED/);assert.match(sql,/reserved_at IS NULL/);
   assert.match(sql,/\(activation_site_url=\? OR activation_site_url=\?\)/);
   assert.match(sql,/ORDER BY CASE WHEN activation_site_url=\? THEN 0 ELSE 1 END, created_at ASC, id ASC/);
   const [pk,siteA,siteB,preferredSite]=values;assert.equal(preferredSite,siteA);
   const row=rows.filter(r=>r.productKey===pk&&r.status==='available'&&!r.orderId&&!r.usedAt&&!r.reservedAt&&[siteA,siteB].includes(r.activationSiteUrl)).sort((a,b)=>Number(b.activationSiteUrl===preferredSite)-Number(a.activationSiteUrl===preferredSite)||(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id))[0];return row?[{id:row.id}]:[];},
  licenseKey:{async findUnique({where}){return rows.find(r=>r.id===where.id)},async updateMany({where,data}){const row=rows.find(r=>r.id===where.id&&r.status===where.status&&!r.orderId&&!r.usedAt&&!r.reservedAt);if(!row)return {count:0};Object.assign(row,data);return {count:1}}},
  licenseKeyAuditLog:{async findMany({where}){return audits.filter(r=>r.meta.scope===where.meta.equals)},async create({data}){audits.push(data)}}
 };
 return {rows,audits,prisma:{$transaction:async fn=>{const prior=tail;let done;tail=new Promise(r=>done=r);await prior;try{return await fn(tx)}finally{done()}}}};
}
const input=(scope,credits=500)=>({scope:'m'+scope.repeat(31),credits,platform:'funpay',action:'claim'});
test('both marketplaces prefer AISOU then use exact AI-BUY reserve for every supported Codex nominal',async()=>{
 for(const platform of ['funpay','playerok'])for(const credits of [250,500,1000]){
  const f=fixture();
  const first=await claim({...input('a',credits),platform},f.prisma);
  assert.equal(first.activationSiteUrl,'https://aiee.fun');assert.equal(first.product_key,'codex-'+credits);
  const request={...input('b',credits),platform};
  const second=await claim(request,f.prisma);
  assert.equal(second.activationSiteUrl,'https://aichongzhi.fun');assert.equal(second.product_key,'codex-'+credits);
  assert.notEqual(first.native_key_id,second.native_key_id);
  assert.equal((await claim(request,f.prisma)).native_key_id,second.native_key_id);
  const proof=await claim({...request,action:'attest',key_id:second.native_key_id},f.prisma);
  assert.equal(proof.code,undefined);assert.equal(proof.fingerprint,second.fingerprint);
  assert.equal(f.audits.length,2);assert.equal(f.audits[1].meta.activationSiteUrl,'https://aichongzhi.fun');
  assert.deepEqual(await claim({...input('c',credits),platform},f.prisma),{state:'empty'});
  assert.equal(f.rows.find(r=>r.id==='held500').status,'reserved');
  assert.ok(f.rows.filter(r=>r.productKey!=='codex-'+credits&&r.id!=='held500').every(r=>r.status==='available'));
 }
});
test('reserve selection excludes held, spent, archived, bound and foreign-provider keys',async()=>{
 const f=fixture();
 for(const row of f.rows.filter(r=>r.productKey==='codex-500'&&r.status==='available'))row.status='used';
 const template=f.rows.find(r=>r.id==='500-1');
 for(const [index,change] of [{status:'reserved'},{status:'revoked'},{orderId:'fixture-other-order'},{usedAt:new Date()},{reservedAt:new Date()},{activationSiteUrl:'https://foreign.example.invalid'}].entries())f.rows.push({...template,status:'available',id:'blocked-'+index,...change});
 assert.deepEqual(await claim(input('d'),f.prisma),{state:'empty'});assert.equal(f.audits.length,0);
});
test('concurrent marketplace orders cannot take the same last AI-BUY reserve',async()=>{
 const f=fixture();f.rows.find(r=>r.id==='500-0').status='used';
 const results=await Promise.all([claim(input('a'),f.prisma),claim({...input('b'),platform:'playerok'},f.prisma)]);
 assert.equal(results.filter(r=>r.state==='shared_stock').length,1);
 assert.equal(results.filter(r=>r.state==='empty').length,1);
 assert.equal(f.audits.length,1);assert.equal(f.audits[0].keyId,'500-1');
});
test('an existing AI-BUY assignment retains its provider during recovery',async()=>{
 const f=fixture(),request=input('9'),row=f.rows.find(r=>r.id==='500-1');row.status='used';
 f.audits.push({keyId:row.id,meta:{scope:request.scope,platform:'funpay',activationSiteUrl:row.activationSiteUrl}});
 const recovered=await claim(request,f.prisma);assert.equal(recovered.native_key_id,row.id);assert.equal(recovered.activationSiteUrl,'https://aichongzhi.fun');
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

test('Claude Pro uses its own prepaid AI-BUY key once, never a Codex or AISOU key',async()=>{
 const f=fixture(),request=input('c',0);
 const [a,b]=await Promise.all([claim(request,f.prisma),claim(request,f.prisma)]);
 assert.equal(a.native_key_id,'claude-1');assert.equal(b.native_key_id,a.native_key_id);
 assert.equal(a.product_key,'claude-pro');assert.equal(a.activationSiteUrl,'https://aichongzhi.fun');
 assert.equal(f.audits.length,1);assert.equal(f.rows.find(r=>r.id==='claude-0').status,'available');
 assert.deepEqual(await claim({...input('b',0),platform:'playerok'},f.prisma),{state:'empty'});
 const proof=await claim({...request,action:'attest',key_id:a.native_key_id},f.prisma);
 assert.equal(proof.code,undefined);assert.equal(proof.fingerprint,a.fingerprint);
 await assert.rejects(()=>claim({...request,credits:250,action:'attest'},f.prisma));
 assert.equal(f.rows.find(r=>r.id==='250-0').status,'available');
});
