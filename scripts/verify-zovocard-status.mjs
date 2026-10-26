import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';

const source=ts.createSourceFile('worker.mjs',fs.readFileSync('ops/telegram-monitor-bot/worker.mjs','utf8'),ts.ScriptTarget.Latest,true);
let records=[],sent=[];
const scope=vm.createContext({readActivationRecords:()=>records,writeState:()=>{},
  notifyAdmins:async text=>sent.push(text),activationNotification:async(_,result)=>result});
for(const node of source.statements){
  if(ts.isFunctionDeclaration(node)&&['activationState','requiresActivationKey','hasZovocardStatusNotifier','pollActivationNotifications'].includes(node.name?.text))vm.runInContext(node.getText(source),scope);
}
const base={orderId:'fixture',productKey:'chatgpt-pro-20x-1',externalFulfillmentOwner:'pulse-sitepro20x-v1',status:'success',verificationState:'success'};
for(const result of ['success','failed']){
  records=[{...base,status:result,verificationState:result}];sent=[];
  const state={activationInitialized:true,activationStatuses:{fixture:'processing'},emptyKeyOrders:{}};
  await scope.pollActivationNotifications(state);
  assert.equal(sent.length,0,'Zovo owns the verified result in the same admin bot');
  assert.equal(state.activationStatuses.fixture,result);
}
for(const patch of [{externalFulfillmentOwner:'',activationSiteUrl:'https://aiee.fun'},
  {cdk:'fixture-key'},{attempts:1},{taskId:'native-task'},{productKey:'chatgpt-plus-1'}]){
  records=[{...base,...patch}];sent=[];
  await scope.pollActivationNotifications({activationInitialized:true,activationStatuses:{fixture:'processing'},emptyKeyOrders:{}});
  assert.deepEqual(sent,['success'],'Native and reserve key completions retain their notifier');
}
const test=spawnSync(process.platform==='win32'?'python':'python3',['-B','ops/zovocard-status/test-status.py'],{stdio:'inherit'});
if(test.error)throw test.error;
if(test.status!==0)process.exit(test.status??1);
console.log('Zovo busy states, reserve races, verified milestones, existing deliveries and bot isolation passed.');
