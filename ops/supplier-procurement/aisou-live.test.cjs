"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {merchant,providerEvidence,finance,assertPaidWebsiteOrder,procureWebsiteKey}=require('./aisou-live.cjs');
const {contract,quoteFromValuation}=require('./aisou-core.cjs');
const now=Date.now(),oid='fixturepaidorder0000000001';
const policy={enabled:true,enabledAfter:new Date(now-100000).toISOString(),products:['codex-250','chatgpt-plus-1','chatgpt-go-1'],rubPerCny:13.2,costCheckedAt:new Date(now).toISOString(),costMaxAgeMs:86400000,minimumProfitRub:0,costSource:'owner-fixture'};
const order=()=>({id:oid,source:'site',status:'PAID',currency:'RUB',createdAt:new Date(now-50000),totalAmount:'3000',email:'fixture@example.invalid',items:[{quantity:1,product:{slug:'codex-250'}}],licenseKeys:[],payments:[{status:'SUCCESS',provider:'pally',currency:'RUB',amount:'3000',processedAt:new Date(now-10000),payload:{commission:'90'}}]});
const activation=()=>({orderId:oid,status:'issued',attempts:0,clientTokenCiphertext:'fixture-encrypted',clientTokenExpiresAt:new Date(now+3600000).toISOString(),tokenMeta:{fingerprint:'a'.repeat(16)}});
function fixture(t,{lost=false,wrong=false}={}){
 const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'aisou-live-'));t.after(()=>fs.rmSync(stateDir,{recursive:true,force:true}));
 const o=order(),a=activation(),audits=[],calls=[];
 const db={order:{findUnique:async()=>o},licenseKey:{findFirst:async args=>o.licenseKeys.find(x=>Object.entries(args.where).every(([k,v])=>x[k]===v)),findUnique:async args=>o.licenseKeys.find(x=>x.keyValue===args.where.keyValue),create:async({data})=>{const row={id:'fixture-key-'+o.licenseKeys.length,...data};o.licenseKeys.push(row);return row}},licenseKeyAuditLog:{create:async({data})=>audits.push(data),findFirst:async({where})=>audits.find(x=>x.keyId===where.keyId&&x.action===where.action)},$transaction:async fn=>fn(db)};
 let trades=0;
 const transport=async(url,body)=>{
  calls.push({url,body});
  if(url.includes('/shared/')){
   const f=new URLSearchParams(body);
   if(url.endsWith('/item'))return {code:200,data:{id:69,code:contract('codex-250','plus').code,config:{category:{'250点数额度':'75'}}}};
   if(url.endsWith('/items'))return {code:200,data:[{id:1,children:[{id:69,code:contract('codex-250','plus').code,api_status:1,status:1,config:{category:{'250点数额度':'75'}}}]}]};
   if(url.endsWith('/valuation'))return {code:200,data:{price:'75',currency_code:'CNY'}};
   if(url.endsWith('/inventory'))return {code:200,data:{count:5,delivery_way:0}};
   if(url.endsWith('/connect'))return {code:200,data:{balance:'1000'}};
   if(url.endsWith('/trade')){trades++;if(lost)throw Error('secret response must never escape');return {code:200,data:{tradeNo:'fixture-'+trades,amount:'75',secret:wrong&&trades===1?'C500-TEST-TEST-TEST':'C250-TEST-TEST-TEST'}}}
   throw Error('unexpected supplier action');
  }
  const p=JSON.parse(body);assert.ok(['query_code','verify_code'].includes(p.action));
  if(p.action==='query_code')return {success:true,status:'active'};
  return {success:true,sid:'fixture-private-sid',plan_type:p.cdk.startsWith('C500')?'codex500':'codex250',require_cookie:0};
 };
 const args={prisma:db,activationStore:{findByOrderId:()=>a},orderId:oid,productKey:'codex-250',accountPlan:'plus',activationSiteUrl:'https://aiee.fun',settings:{policy,credentials:{app_id:'7',app_key:'fixture-secret'},encryptionKey:crypto.randomBytes(32),stateDir},transport};
 return {args,o,a,audits,calls,trades:()=>trades,stateDir};
}
test('paid/new/exact product, session and untouched fulfilment are mandatory',()=>{
 const expected=contract('codex-250','plus');
 for(const mutate of [o=>o.status='PENDING',o=>o.items[0].quantity=2,o=>o.items[0].product.slug='codex-500',o=>o.payments[0].amount='1',o=>o.createdAt=new Date(0),o=>o.payments.push(o.payments[0]),o=>o.payments[0].provider='stub',o=>o.payments[0].provider='test',o=>o.payments[0].provider='',o=>o.paymentMethod='stub']){
  const o=order();mutate(o);assert.throws(()=>assertPaidWebsiteOrder(o,activation(),'codex-250',expected,policy));
 }
 for(const patch of [{cdk:'fixture'},{attempts:1},{taskId:'fixture'},{status:'success'},{clientTokenCiphertext:''}])assert.throws(()=>assertPaidWebsiteOrder(order(),{...activation(),...patch},'codex-250',expected,policy));
});
test('actual commission, margin and cost freshness gate all purchasing',()=>{
 const o=order();assert.equal(finance(o,o.payments[0],{amountMinor:7500},policy).costRub,990);
 assert.throws(()=>finance(o,{payload:{}},{amountMinor:7500},policy),/cost/);
 assert.throws(()=>finance(o,o.payments[0],{amountMinor:7500},{...policy,costCheckedAt:'2000-01-01'}),/cost/);
 assert.throws(()=>finance({...o,totalAmount:500},o.payments[0],{amountMinor:7500},policy),/margin/);
});

test('a newly enabled product never acquires purchasing rights for an old order',()=>{
 const expected=contract('codex-250','plus'),p={...policy,productEnabledAfter:{'codex-250':new Date(now-20000).toISOString()}};
 assert.throws(()=>assertPaidWebsiteOrder(order(),activation(),'codex-250',expected,p),/ineligible/);
 const o=order();o.createdAt=new Date(now-15000);assert.ok(assertPaidWebsiteOrder(o,activation(),'codex-250',expected,p));
 assert.throws(()=>assertPaidWebsiteOrder(o,activation(),'codex-250',expected,{...p,productEnabledAfter:{'codex-250':'invalid'}}),/ineligible/);
});
test('exact one-unit valuation avoids heavy item synchronization and the base-variant price bug',()=>{
 const c=contract('codex-500','plus'),cat=[{id:69,code:c.code,status:1,api_status:1,config:'[category]\n250点数额度=75\n500点数额度=145'}];
 assert.equal(quoteFromValuation(c,cat,{delivery_way:0,count:2},{price:'145'}).amountMinor,14500);
 assert.throws(()=>quoteFromValuation(c,cat,{delivery_way:0,count:2},{price:'145',currency_code:'USD'}),/currency/);
 assert.throws(()=>quoteFromValuation(c,[...cat,...cat],{delivery_way:0,count:2},{price:'145'}),/contract/);
 assert.throws(()=>quoteFromValuation(c,[{...cat[0],config:'[category]\n250点数额度=75'}],{delivery_way:0,count:2},{price:'145'}),/variant/);
 const ios=contract('chatgpt-plus-1','plus');assert.equal(quoteFromValuation(ios,[{id:30,code:ios.code,status:1,api_status:1}],{delivery_way:0,count:1,factory_price:'124'},{price:'122'}).amountMinor,12400);
});
test('canonical IOS type and AIEE denomination are required; prefix alone is insufficient',()=>{
 const q={success:true,status:'active'},v={success:true,sid:'private',type:'plus_month'};
 assert.equal(providerEvidence('https://vip.sxzfd.com',q,v).product,'plus_ios');
 assert.equal(providerEvidence('https://vip.sxzfd.com',q,{...v,type:'go_month'}).product,'go_ios');
 assert.equal(providerEvidence('https://vip.sxzfd.com',q,{...v,type:undefined}),null);
 assert.equal(providerEvidence('https://vip.sxzfd.com',{...q,order_id:'old'},v),null);
 assert.equal(providerEvidence('https://aiee.fun',q,{success:true,sid:'private',plan_type:'codex1000',require_cookie:0}).product,'codex-1000');
});

test('Grok registry layers require a matching plan name for ambiguous Plus/Super types',()=>{
 const q={success:true,status:'active'},v={success:true,sid:'fixture-private',require_cookie:0};
 for(const [type,tier] of [['grok_lite','plus'],['grok_premium','premium'],['grok_plus','super'],['grok_heavy','ultra'],['grok_plus','plus'],['grok_super','super'],['grok_ultra','ultra']]){
  assert.equal(providerEvidence('https://aiee.fun',q,{...v,plan_type:type,plan_name:'Grok '+tier}).product,'grok_'+tier+'_monthly');
  assert.equal(providerEvidence('https://aiee.fun',q,{...v,plan_type:type,duration_months:12}),null);
  assert.equal(providerEvidence('https://aiee.fun',q,{...v,plan_type:type,plan_name:'Annual'}),null);
 }
 assert.equal(providerEvidence('https://aiee.fun',q,{...v,plan_type:'grok_unknown'}),null);
 assert.equal(providerEvidence('https://aiee.fun',q,{...v,plan_type:'grok_plus'}),null);
 assert.equal(providerEvidence('https://aiee.fun',q,{...v,plan_type:'grok_premium',plan_name:'Grok Plus'}),null);
});

test('pending GO, Pro and Grok demands resume only while their native activation remains eligible',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aisou-resume-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const key=crypto.randomBytes(32),{Journal}=require('./aisou-core.cjs'),{pendingNativeOrders}=require('./aisou-live.cjs');
 const j=new Journal(path.join(dir,'journal.sqlite'),key);await j.initialize();await j.run('CREATE TABLE demands(scope TEXT PRIMARY KEY,product TEXT,created_at TEXT)');
 const types=['go_ios','go_free','pro_5x_ios','pro_20x_free','pro_25x_free','grok_plus_monthly','grok_premium_monthly','grok_super_monthly','grok_ultra_monthly','unmapped'];
 const ids=types.map((x,i)=>'fixtureorder'+String(i).padStart(10,'0'));
 for(let i=0;i<types.length;i++)await j.run('INSERT INTO demands VALUES(?,?,?)',['website:'+ids[i],types[i],new Date().toISOString()]);await j.close();
 const all=await pendingNativeOrders(ids,{stateDir:dir,encryptionKey:key});assert.equal(all.length,9);assert.ok(!all.includes(ids[9]));
 assert.deepEqual(await pendingNativeOrders([ids[0]],{stateDir:dir,encryptionKey:key}),[ids[0]]);
});
test('production transport pins merchant destination and signed balance purchase quantity',async()=>{
 const calls=[];const m=merchant({app_id:'7',app_key:'fixture'},async(...a)=>{calls.push(a);return {code:200,data:{}}});
 await assert.rejects(m.buy({num:2,request_no:'gpi-'+'a'.repeat(40)}),/dispatch/);
 await m.buy({num:1,request_no:'gpi-'+'a'.repeat(40),shared_code:'fixture'});
 assert.equal(calls[0][0],'https://aisou.pro/shared/commodity/trade');assert.ok(!calls[0][1].includes('app_key'));
});
test('temporary catalog failures allow one read retry; a failed purchase is never replayed',async()=>{
 let reads=0,trades=0;
 const m=merchant({app_id:'7',app_key:'fixture'},async url=>{
  if(url.endsWith('/trade')){trades++;throw Error('lost reply')}
  reads++;if(reads===1)throw Error('read timeout');return {code:200,data:{balance:'100'}};
 });
 await m.read('connect');assert.equal(reads,2);
 await assert.rejects(m.buy({num:1,request_no:'gpi-'+'a'.repeat(40)}));assert.equal(trades,1);
});
test('verified delivery is assigned to the paid website order; process recovery reuses it',async t=>{
 const f=fixture(t);const r=await procureWebsiteKey(f.args);assert.equal(f.trades(),1);assert.equal(r.code,'C250-TEST-TEST-TEST');
 assert.equal(f.o.licenseKeys[0].orderId,oid);assert.equal(f.o.licenseKeys[0].status,'used');assert.equal(f.audits[0].meta.costRub,990);
 const again=await procureWebsiteKey(f.args);assert.equal(again.keyId,r.keyId);assert.equal(f.trades(),1);
 f.o.status='REFUNDED';await assert.rejects(procureWebsiteKey(f.args),/order_ineligible/);assert.equal(f.trades(),1);
});
test('lost purchase reply cannot buy again after a new invocation',async t=>{
 const f=fixture(t,{lost:true});await assert.rejects(procureWebsiteKey(f.args),/supplier_uncertain/);await assert.rejects(procureWebsiteKey(f.args),/supplier_uncertain/);assert.equal(f.trades(),1);assert.equal(f.o.licenseKeys.length,0);
});
test('insufficient balance creates a resumable demand without a dispatch',async t=>{
 const f=fixture(t),real=f.args.transport;let funded=false,clock=now;const messages=[];
 f.args.now=()=>clock;f.args.notifyFunds=async text=>{messages.push(text);return messages.length};
 f.args.transport=async(url,...rest)=>url.endsWith('/connect')?{code:200,data:{balance:funded?'1000':'0'}}:real(url,...rest);
 await assert.rejects(procureWebsiteKey(f.args),/balance_insufficient/);assert.equal(f.trades(),0);
 assert.equal(messages.length,1);assert.match(messages[0],/15 минут/);assert.match(messages[0],/Не хватает: <b>¥75.00/);
 // A new invocation opens the same durable journal; it cannot restart the clock.
 clock+=14*60000;await assert.rejects(procureWebsiteKey(f.args),/balance_insufficient/);assert.equal(messages.length,1);
 clock+=60000;await assert.rejects(procureWebsiteKey(f.args),/balance_insufficient/);assert.equal(messages.length,2);assert.match(messages[1],/15 минут истекли/);
 clock+=60000;await assert.rejects(procureWebsiteKey(f.args),/balance_insufficient/);assert.equal(messages.length,2);assert.equal(f.trades(),0);
 funded=true;await procureWebsiteKey(f.args);assert.equal(f.trades(),1);assert.equal(messages.length,3);assert.match(messages[2],/Баланс восстановлен/);
 await procureWebsiteKey(f.args);assert.equal(f.trades(),1);assert.equal(messages.length,3);
});

test('invalid balance is not treated as a genuine cash shortage; grace survives a failed notification',async t=>{
 const f=fixture(t),real=f.args.transport;let balance='invalid',clock=now,calls=0;
 f.args.now=()=>clock;f.args.notifyFunds=async()=>{calls++;throw Error('transport unknown')};
 f.args.transport=async(url,...rest)=>url.endsWith('/connect')?{code:200,data:{balance}}:real(url,...rest);
 await assert.rejects(procureWebsiteKey(f.args),/balance_unconfirmed/);assert.equal(calls,0);
 balance='70.01';await assert.rejects(procureWebsiteKey(f.args),e=>e.fundsWait.deadlineAt===now+900000);assert.equal(calls,1);
 clock+=60000;balance='74.99';await assert.rejects(procureWebsiteKey(f.args),e=>e.fundsWait.deadlineAt===now+900000);assert.equal(calls,1);
 clock=now+900000;await assert.rejects(procureWebsiteKey(f.args),/balance_insufficient/);assert.equal(calls,2);assert.equal(f.trades(),0);
});

test('deadline notification works from the durable hold even if supplier reads are down',async t=>{
 const f=fixture(t),{Journal}=require('./aisou-core.cjs'),funds=require('./funds-wait.cjs'),events=[];
 const scope='website:'+oid,key=f.args.settings.encryptionKey;
 let j=new Journal(path.join(f.stateDir,'journal.sqlite'),key);await j.initialize();
 const row=await funds.hold(j,scope,7500,3000,now);await funds.notify(j,row,async t=>{events.push(t);return 1},now);await j.close();
 // Process restart and outage: only the journal and owner notification transport are used.
 j=new Journal(path.join(f.stateDir,'journal.sqlite'),key);await j.initialize();
 await funds.due(j,[],async()=>assert.fail('inactive/refunded order must not notify'),now+900000);
 await funds.due(j,[scope],async t=>{events.push(t);return 2},now+900000);
 await funds.due(j,[scope],async()=>assert.fail('duplicate reminder'),now+990000);await j.close();
 assert.equal(events.length,2);assert.match(events[1],/¥45.00/);assert.equal(f.calls.length,0);
});
test('a lower actual supplier charge releases the correct key and records the discount',async t=>{
 const f=fixture(t),original=f.args.transport;
 f.args.transport=async(url,...rest)=>{const r=await original(url,...rest);if(url.endsWith('/trade'))r.data.amount='74';return r};
 const r=await procureWebsiteKey(f.args);assert.equal(r.costRub,976.8);assert.equal(f.trades(),1);
});
test('confirmed wrong delivery is encrypted and one correction fits the paid order margin',async t=>{
 const f=fixture(t,{wrong:true});await procureWebsiteKey(f.args);assert.equal(f.trades(),2);assert.equal(f.o.licenseKeys[0].keyValue,'C250-TEST-TEST-TEST');assert.equal(f.audits[0].meta.costRub,1980);
 const bytes=fs.readFileSync(path.join(f.stateDir,'journal.sqlite'));assert.ok(!bytes.includes(Buffer.from('C500-TEST-TEST-TEST')));
});
test('old orders, existing stock and an unsealed primary cannot spend',async t=>{
 const f=fixture(t);f.o.createdAt=new Date(0);assert.equal(await procureWebsiteKey(f.args),null);assert.equal(f.calls.length,0);
 f.o.createdAt=new Date(now-50000);f.a.externalFulfillmentOwner='pulse-site250-v1';await assert.rejects(procureWebsiteKey(f.args),/seal/);assert.equal(f.calls.length,0);
 f.a.externalFulfillmentOwner=undefined;f.o.licenseKeys.push({id:'existing',productKey:'codex-250',activationSiteUrl:'https://aiee.fun',status:'available'});
 // Stock can belong to other orders, not be already assigned to this one.
 f.args.prisma.order.findUnique=async()=>({...f.o,licenseKeys:[]});assert.equal((await procureWebsiteKey(f.args)).stockAvailable,true);assert.equal(f.calls.length,0);
});

test('explicit human verification is diagnosed, persisted and never retried as a second purchase',async t=>{
 const f=fixture(t),base=f.args.transport,phases=[];let sends=0;
 f.args.onProgress=async x=>phases.push(x.phase);
 f.args.transport=async(url,...rest)=>{
  if(url.endsWith('/trade')){sends++;return {code:400,msg:'captcha_required',data:null};}
  return base(url,...rest);
 };
 await assert.rejects(procureWebsiteKey(f.args),/supplier_human_verification_required/);
 await assert.rejects(procureWebsiteKey(f.args),/supplier_human_verification_required/);
 assert.equal(sends,1);assert.equal(f.o.licenseKeys.length,0);assert.ok(phases.includes('purchasing'));assert.ok(phases.includes('reconcile'));
 const {requiresHumanVerification}=require('./aisou-live.cjs');
 assert.ok(requiresHumanVerification('请完成人机验证'));assert.ok(requiresHumanVerification('验证码错误'));
 assert.equal(requiresHumanVerification('timeout or ordinary validation failure'),false);
});

test('owner stock added after an uncertain purchase resumes without buying another key',async t=>{
 const f=fixture(t,{lost:true});await assert.rejects(procureWebsiteKey(f.args),/supplier_uncertain/);
 f.args.prisma.licenseKey.findFirst=async()=>({id:'owner-prepaid-key'});
 const result=await procureWebsiteKey(f.args);assert.ok(result.stockAvailable);assert.equal(f.trades(),1);
});

test('merchant rejection details remain encrypted and do not grant another financial dispatch',async t=>{
 const f=fixture(t),base=f.args.transport;let sends=0;
 f.args.transport=async(url,...args)=>url.endsWith('/trade')?(sends++,{code:403,msg:'IP not allowed - fixture-private-detail',data:null}):base(url,...args);
 for(let i=0;i<2;i++)await assert.rejects(procureWebsiteKey(f.args),/supplier_api_ip_not_allowed/);
 assert.equal(sends,1);
 const bytes=fs.readFileSync(path.join(f.stateDir,'journal.sqlite'));assert.ok(!bytes.includes(Buffer.from('fixture-private-detail')));
 const {purchaseRejection}=require('./aisou-live.cjs');assert.equal(purchaseRejection('permission denied'),'supplier_api_access_refused');
});
