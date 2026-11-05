import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const compile=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const require=createRequire(import.meta.url), module={exports:{}};
vm.runInNewContext(compile(fs.readFileSync('apps/admin-backend/src/modules/notifications/manager-notifications.outbox.ts','utf8')),{module,exports:module.exports,require,process,Date,structuredClone,setTimeout,console});
const {ManagerNotificationsOutbox}=module.exports;
const text=fs.readFileSync('apps/admin-backend/src/modules/notifications/notifications.service.ts','utf8');
const ast=ts.createSourceFile('notifications.ts',text,ts.ScriptTarget.Latest,true);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(ast)]));
const presentation={exports:{}};
vm.runInNewContext(compile(fs.readFileSync('apps/admin-backend/src/modules/notifications/telegram-presentation.ts','utf8')),presentation);
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'activation-stock-fixture-')),file=path.join(folder,'outbox.json');
const id='cmvfixture0000000000000001';
let now=Date.now(), sends=0, order, activation, message, reply, fail=false;
const flush=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,5));};
const context=vm.createContext({
  exports:{},
  activationStockCard:presentation.exports.activationStockCard,
  managerOutbox:new ManagerNotificationsOutbox(file,()=>now),managerRetryRunning:false,
  activationStore:{findByOrderId:()=>activation},prisma:{order:{findUnique:async()=>order}},
  async sendTelegramNotification(text,buttons){if(fail)throw Error('fixture-delivery-failed');sends++;message=text;reply=buttons;return 77;},
  resolveSiteOrigin:()=> 'https://fixture.invalid',console,
  deliverPaidManagerNotification(){throw Error('Stock alert must not send another paid-order notification');},
});
for(const name of ['escapeHtml','enqueueActivationStockNotification','deliverActivationStockNotification','deliverManagerEvent','retryPendingManagerNotifications'])vm.runInContext(compile(functions.get(name)),context);
function reset(){order={id,status:'PAID',paymentMethod:'pally',source:'site',payments:[{status:'SUCCESS',provider:'pally'}],items:[{product:{title:'Grok Premium — 1 месяц'}}]};activation={orderId:id,productKey:'grok-premium-1',activationSiteUrl:'https://aiee.fun',keyAllocationSite:'https://aiee.fun',keyAllocationState:'exhausted',cdk:'',taskId:null,attempts:0,status:'issued',verificationState:'unknown',clientTokenCiphertext:'fixture-private-session',lastProviderPayload:{cdkWaitRequestedAt:new Date(now).toISOString()}};}
try{
 reset();await Promise.all(Array.from({length:6},()=>context.enqueueActivationStockNotification(id)));await flush();
 assert.equal(sends,1,'Repeated clicks and concurrent pollers send one confirmed stock alert');
 assert.match(message,/Grok Premium/);assert.match(message,/grok-premium-1/);assert.match(message,/AISOU/);assert.match(message,/автоматически/);
 assert.doesNotMatch(message,/fixture-private-session|@|customerToken|sessionKey/);
 assert.equal(reply.inline_keyboard[0][0].callback_data,'cdk:o:grok-premium-1:aisou');
 assert.equal(reply.inline_keyboard[1][0].url,'https://fixture.invalid/admin/cdks');
 assert.equal(context.managerOutbox.snapshot()[0].status,'sent');
 context.managerOutbox=new ManagerNotificationsOutbox(file,()=>now);
 await context.enqueueActivationStockNotification(id);await flush();await context.retryPendingManagerNotifications();assert.equal(sends,1,'A restart preserves the already-sent notification');
 const serialized=fs.readFileSync(file,'utf8');assert.doesNotMatch(serialized,/Grok|Premium|aiee|fixture-private-session/,'The outbox stores event IDs and delivery status only');
 // A transport failure remains durable and is retried through the existing manager loop.
 fs.unlinkSync(file);reset();fail=true;await context.enqueueActivationStockNotification(id);await flush();assert.equal(context.managerOutbox.snapshot()[0].status,'pending');
 fail=false;now+=60001;await context.retryPendingManagerNotifications();assert.equal(sends,2);assert.equal(context.managerOutbox.snapshot()[0].status,'sent');
 fs.unlinkSync(file);reset();activation.productKey='codex-500';order.items[0].product.title='Пополнение Codex — 500 кредитов';
 await context.enqueueActivationStockNotification(id);await flush();assert.equal(sends,3);assert.match(message,/codex-500/);assert.match(message,/500 кредитов/);
 for(const months of [6,12,24]){
  fs.unlinkSync(file);reset();
  activation.productKey=`gemini-pro-${months}m`;activation.activationSiteUrl='https://aichongzhi.fun';activation.keyAllocationSite='https://aichongzhi.fun';
  activation.externalFulfillmentOwner='gemini-pro-cdk-v1';activation.status='processing';activation.verificationState='pending';
  activation.lastProviderPayload={source:'gemini-pro-cdk-v1',phase:'awaiting_key'};
  order.items[0].product.title=`Gemini Pro — ${months} месяцев`;
  const before=sends;await Promise.all([context.enqueueActivationStockNotification(id),context.enqueueActivationStockNotification(id)]);await flush();
  assert.equal(sends,before+1);assert.ok(message.includes(`gemini-pro-${months}m`));assert.match(message,/aichongzhi/);
  assert.equal(reply.inline_keyboard.length,1,'Gemini uses the existing admin CDK upload');
  assert.equal(reply.inline_keyboard[0][0].url,'https://fixture.invalid/admin/cdks');
  assert.doesNotMatch(message,/fixture-private-session|sessionKey|password|twofa/);
 }
 for(const invalid of ['completed','refunded','unpaid','stub','external','dispatched','restocked']){
  fs.unlinkSync(file);reset();
  if(invalid==='completed')activation.status='success';
  if(invalid==='refunded')order.status='REFUNDED';
  if(invalid==='unpaid')order.payments=[];
  if(invalid==='stub')order.paymentMethod='stub';
  if(invalid==='external')activation.externalFulfillmentOwner='fixture-owner';
  if(invalid==='dispatched')activation.attempts=1;
  if(invalid==='restocked')activation.cdk='fixture-key';
  const before=sends;await context.enqueueActivationStockNotification(id);await flush();assert.equal(sends,before,`${invalid}: do not send a stale stock alert`);
  assert.equal(context.managerOutbox.snapshot()[0].status,'cancelled');
 }
 console.log('Activation stock wait: one private owner notification per order, durable retry/restart deduplication and no alerts for resolved or untrusted orders.');
}finally{
 const resolved=path.resolve(folder);
 if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('activation-stock-fixture-'))throw Error('Unexpected test cleanup path');
 fs.rmSync(resolved,{recursive:true,force:true});
}
