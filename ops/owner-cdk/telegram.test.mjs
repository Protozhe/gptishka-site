import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CdkStore,createOwnerCdkUi} from './telegram.mjs';
import catalog from './catalog.cjs';
import importer from './import.cjs';
const msg=(text,id=1)=>({text,message_id:id,chat:{id:123,type:'private'},from:{id:123}});
const cb=(data,id='fixture')=>({id,data,from:{id:123},message:{chat:{id:123,type:'private'}}});
const keys='TEST-AAAA-BBBB-CCCC\nTEST-DDDD-EEEE-FFFF';
async function fixture(t,request){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-cdk-')),store=new CdkStore(dir),cards=[],answers=[];
 const options={ownerId:'123',botId:'900',store,send:async(...x)=>cards.push(x),answer:async(...x)=>answers.push(x),request,now:()=>1000000};const ui=createOwnerCdkUi(options);
 t.after(async()=>{await ui.drain();await store.close();const r=path.resolve(dir);assert.equal(path.dirname(r),path.resolve(os.tmpdir()));assert.ok(path.basename(r).startsWith('owner-cdk-'));fs.rmSync(r,{recursive:true,force:true});});return {ui,store,cards,answers,options,dir};}
const buttons=f=>f.cards.at(-1)[2].reply_markup.inline_keyboard.flat();
const success=q=>{const p=catalog.poolBy(q.pool);return {pool:p.id,productKey:p.productKey,activationSiteUrl:p.site,received:q.codes.length,inserted:q.codes.length,skipped:0,conflicts:0};};
async function prepare(f){await f.ui.handleMessage(msg('/cdk gp'));await f.ui.handleMessage(msg(keys,2));return buttons(f)[0].callback_data;}

test('private owner gate rejects other admins, customers, groups and forwarded callbacks',async t=>{
 let calls=0;const f=await fixture(t,async()=>calls++);
 await f.ui.handleMessage({...msg('/cdk'),from:{id:456}});await f.ui.handleMessage({...msg('/cdk'),chat:{id:-1,type:'group'}});
 await f.ui.handleCallback({...cb('cdk:p:gp'),from:{id:456}});await f.ui.handleCallback({...cb('cdk:p:gp'),message:{chat:{id:-1,type:'group'}}});
 assert.equal(calls,0);assert.equal(f.cards.length,0);assert.equal(f.answers.length,2);
});
test('keys require exact pool confirmation, are encrypted and one import survives concurrent clicks',async t=>{
 const requests=[];const f=await fixture(t,async q=>{requests.push(q);return success(q);});const data=await prepare(f);
 assert.equal(requests.length,0);assert.match(f.cards.at(-1)[1],/Premium/);assert.match(f.cards.at(-1)[1],/AISOU/);
 const row=await f.store.get("SELECT * FROM drafts WHERE state='confirm'");assert.ok(row.cipher);assert.ok(!row.cipher.includes('TEST-AAAA'));
 assert.doesNotMatch(f.cards.map(c=>c[1]).join(''),/TEST-AAAA/);
 await Promise.all([f.ui.handleCallback(cb(data,'a')),f.ui.handleCallback(cb(data,'b'))]);await f.ui.drain();assert.equal(requests.length,1);assert.equal(requests[0].pool,'gp');
 const done=await f.store.find(row.id,'123');assert.equal(done.state,'done');assert.equal(done.cipher,null);
 await f.ui.handleCallback(cb(data,'again'));assert.equal(requests.length,1);
});
test('restart reuses original import reference after an uncertain response',async t=>{
 const requests=[];let fail=true;const f=await fixture(t,async q=>{requests.push(q);if(fail)throw Error('fixture transport');return success(q);});const data=await prepare(f);
 await f.ui.handleCallback(cb(data));await f.ui.drain();assert.equal(requests.length,1);fail=false;
 const restarted=createOwnerCdkUi(f.options);await restarted.handleCallback(cb(data,'retry'));await restarted.drain();
 assert.equal(requests.length,2);assert.equal(requests[0].reference,requests[1].reference);assert.deepEqual(requests[0].codes,requests[1].codes);
});
test('reply to this bot stock notice selects the exact pool, foreign/forwarded messages cannot',async t=>{
 const f=await fixture(t,async()=>assert.fail('no import before confirmation'));
 const notice={from:{id:900},text:'Пул: grok-premium-1\nПоставщик: AISOU / aiee.fun\nДиагностика: cdk_stock_wait'};
 assert.equal(await f.ui.handleMessage({...msg(keys,4),reply_to_message:{...notice,from:{id:901}}}),false);
 assert.equal(await f.ui.handleMessage({...msg(keys,5),reply_to_message:{...notice,forward_origin:{type:'user'}}}),false);
 assert.equal(await f.ui.handleMessage({...msg(keys,6),reply_to_message:notice}),true);assert.match(f.cards.at(-1)[1],/Premium/);
});
test('deep links select the correct supplier and expired/cancelled drafts cannot import',async t=>{
 let calls=0;const f=await fixture(t,async q=>{calls++;return success(q);});
 await f.ui.handleMessage(msg('/start cdk_codex-500_aibuy'));assert.match(f.cards.at(-1)[1],/AI-BUY/);await f.ui.handleMessage(msg(keys,2));const confirm=buttons(f)[0].callback_data;
 await f.ui.handleMessage(msg('/cancel',3));await f.ui.handleCallback(cb(confirm));await f.ui.drain();assert.equal(calls,0);
 const data=await prepare(f);await f.store.run('UPDATE drafts SET created=0');const ui=createOwnerCdkUi({...f.options,now:()=>TTL+1000000});await ui.handleCallback(cb(data));await ui.drain();assert.equal(calls,0);
});
const TTL=30*60*1000;
test('catalog separates every monthly tier/supplier and rejects sessions, links and oversized batches',()=>{
 assert.equal(new Set(catalog.POOLS.map(p=>p.id)).size,catalog.POOLS.length);
 for(const value of ['https://aiee.fun','eyJabc.def.ghi','secret token',Array(21).fill('TEST-AAAA-BBBB-CCCC').join('\n')])assert.throws(()=>catalog.parseCodes(value));
 assert.deepEqual(catalog.parseCodes('TEST-AAAA-BBBB-CCCC\nTEST-AAAA-BBBB-CCCC'),['TEST-AAAA-BBBB-CCCC']);
});
test('actual import boundary rechecks OWNER, uses license service safeguards and persists a count-only receipt',async()=>{
 const rows=[],audits=[];let owner=true,calls=0;
 const prisma={user:{findUnique:async()=>({isActive:owner,role:{code:owner?'OWNER':'MANAGER'}})},licenseKeyAuditLog:{findFirst:async()=>audits[0],create:async({data})=>{audits.push(data);}}};
 const licenseService={importKeys:async(product,codes,actor,options)=>{calls++;assert.equal(product,'grok-premium-1');assert.equal(options.activationSiteUrl,'https://aiee.fun');rows.push(...codes);return {inserted:codes.length,skipped:0,conflicts:0};}};
 const input={reference:'tgcdk-'+'a'.repeat(32),pool:'gp',codes:['TEST-AAAA-BBBB-CCCC'],userId:'owner-fixture'};
 owner=false;await assert.rejects(()=>importer.importOwnerKeys(input,{prisma,licenseService}));owner=true;
 const a=await importer.importOwnerKeys(input,{prisma,licenseService});const b=await importer.importOwnerKeys(input,{prisma,licenseService});assert.equal(a.inserted,1);assert.equal(b.reused,true);assert.equal(calls,1);
 assert.doesNotMatch(JSON.stringify(audits),/TEST-AAAA/);await assert.rejects(()=>importer.importOwnerKeys({...input,codes:['TEST-DDDD-EEEE-FFFF']},{prisma,licenseService}));
});
