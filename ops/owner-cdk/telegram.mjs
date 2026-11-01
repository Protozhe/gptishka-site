import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createRequire} from 'node:module';
import catalog from './catalog.cjs';
const sqlite3=createRequire(import.meta.url)('sqlite3');
const {POOLS,poolBy,poolFor,parseCodes}=catalog;
const ROOT='/var/lib/gptishka-runtime/owner-cdk-ui/state';
const CONFIG='/var/lib/gptishka-runtime/aibuy-topup-ui/config.json';
const SOCKET='/run/gptishka-aibuy-topup/rpc.sock';
const TTL=30*60*1000;
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const html=(title,parts)=>[`<b>${esc(title)}</b>`,...parts.filter(Boolean)].join('\n\n');
const home={text:'📥 Выбрать другой тариф',callback_data:'cdk:open'};
const cancel={text:'Отмена',callback_data:'cdk:cancel'};
const supplier=p=>p.supplier==='aisou'?'AISOU / aiee.fun':'AI-BUY / aichongzhi.fun';
const details=p=>`🛍 <b>${esc(p.title)}</b>\nПоставщик: ${supplier(p)}`;

export function rpc(payload){return new Promise((resolve,reject)=>{
 const socket=net.createConnection(SOCKET);let raw='';socket.setTimeout(60000,()=>socket.destroy());
 socket.on('connect',()=>socket.end(JSON.stringify(payload)));socket.on('data',b=>{raw+=b;if(raw.length>4096)socket.destroy();});
 socket.on('end',()=>{try{const v=JSON.parse(raw);if(v.error)throw Error(/^supplier_[a-z_]+$/.test(v.error)?v.error:'supplier_cdk_import_unconfirmed');resolve(v);}catch{reject(Error('supplier_cdk_import_unconfirmed'));}});
 socket.on('error',()=>reject(Error('supplier_cdk_import_unconfirmed')));socket.on('timeout',()=>reject(Error('supplier_cdk_import_unconfirmed')));
});}

export class CdkStore{
 constructor(directory=ROOT){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.chmodSync(directory,0o700);
  const keyFile=path.join(directory,'key');try{fs.writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  this.key=fs.readFileSync(keyFile);if(this.key.length!==32)throw Error('cdk_state_unavailable');
  const file=path.join(directory,'drafts.sqlite');fs.closeSync(fs.openSync(file,'a',0o600));fs.chmodSync(file,0o600);
  this.db=new sqlite3.Database(file);this.db.configure('busyTimeout',5000);
  this.ready=this.run('CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,origin TEXT UNIQUE NOT NULL,owner TEXT NOT NULL,pool TEXT NOT NULL,state TEXT NOT NULL,cipher TEXT,created INTEGER NOT NULL,result TEXT)');
 }
 run(sql,args=[]){return new Promise((res,rej)=>this.db.run(sql,args,function(e){e?rej(e):res({changes:this.changes});}));}
 get(sql,args=[]){return new Promise((res,rej)=>this.db.get(sql,args,(e,r)=>e?rej(e):res(r)));}
 seal(codes){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);return Buffer.concat([iv,cipher.update(JSON.stringify(codes)),cipher.final(),cipher.getAuthTag()]).toString('base64');}
 codes(row){const b=Buffer.from(row.cipher,'base64'),dec=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));dec.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([dec.update(b.subarray(12,-16)),dec.final()]).toString());}
 async find(id,owner){await this.ready;return this.get('SELECT * FROM drafts WHERE id=? AND owner=?',[id,owner]);}
 async input(owner,now){await this.ready;return this.get("SELECT * FROM drafts WHERE owner=? AND state='input' AND created>? ORDER BY created DESC LIMIT 1",[owner,now-TTL]);}
 async begin(owner,origin,pool,now){
  await this.ready;const prior=await this.get('SELECT * FROM drafts WHERE origin=? AND owner=?',[origin,owner]);if(prior)return prior;
  await this.cancel(owner);const id=randomBytes(16).toString('hex');
  await this.run("INSERT OR IGNORE INTO drafts(id,origin,owner,pool,state,created) VALUES(?,?,?,?,'input',?)",[id,origin,owner,pool,now]);return this.get('SELECT * FROM drafts WHERE origin=? AND owner=?',[origin,owner]);
 }
 async stage(parent,owner,codes,origin,now){
  await this.ready;const prior=await this.get('SELECT * FROM drafts WHERE origin=? AND owner=?',[origin,owner]);if(prior)return prior;
  const changed=await this.run("UPDATE drafts SET state='cancelled',cipher=NULL WHERE id=? AND owner=? AND state='input' AND created>?",[parent.id,owner,now-TTL]);if(!changed.changes)return null;
  const id=randomBytes(16).toString('hex');await this.run("INSERT INTO drafts(id,origin,owner,pool,state,cipher,created) VALUES(?,?,?,?,'confirm',?,?)",[id,origin,owner,parent.pool,this.seal(codes),now]);return this.find(id,owner);
 }
 async cancel(owner){await this.ready;return this.run("UPDATE drafts SET state='cancelled',cipher=NULL WHERE owner=? AND state IN ('input','confirm')",[owner]);}
 async claim(id,owner,now){return this.run("UPDATE drafts SET state='processing' WHERE id=? AND owner=? AND ((state='confirm' AND created>?) OR state='uncertain')",[id,owner,now-TTL]);}
 async close(){await this.ready;await new Promise((res,rej)=>this.db.close(e=>e?rej(e):res()));}
}

export function createOwnerCdkUi({send,answer,ownerId,botId,store,request=rpc,now=Date.now}={}){
 if(!ownerId){try{ownerId=JSON.parse(fs.readFileSync(CONFIG,'utf8')).telegramId;}catch{ownerId='';}}
 const owner=String(ownerId||''),jobs=new Map();let db=store;
 const state=()=>db??=(new CdkStore());
 const allowed=(chat,user)=>/^[1-9][0-9]{0,19}$/.test(owner)&&chat?.type==='private'&&String(chat.id)===owner&&String(user?.id)===owner;
 const card=(title,parts,rows=[])=>send(owner,html(title,parts),{parse_mode:'HTML',reply_markup:{inline_keyboard:rows}});
 async function menu(group){
  if(!group)return card('📥 Добавление CDK',['Выберите сервис. Ключи попадут в общий резерв сайта, FunPay и PlayerOK.'],[[{text:'Grok',callback_data:'cdk:g:grok'},{text:'Codex',callback_data:'cdk:g:codex'},{text:'Claude Pro',callback_data:'cdk:g:claude'}]]);
  return card('📥 Выберите тариф',['Укажите тариф и поставщика, у которого куплен CDK.'],POOLS.filter(p=>p.group===group).map(p=>[{text:`${p.title} · ${p.supplier==='aisou'?'AISOU':'AI-BUY'}`,callback_data:'cdk:p:'+p.id}]).concat([[home]]));
 }
 async function input(p,origin){const d=await state().begin(owner,origin,p.id,now());if(d.state!=='input')return card('ℹ️ Запрос уже обработан',['Для новой загрузки выберите тариф заново.'],[[home]]);
  return card('📥 Пришлите CDK',[details(p),'Отправьте до 20 ключей, каждый с новой строки. Перед добавлением покажу тариф, поставщика и количество.'],[[cancel]]);
 }
 async function confirm(d){const p=poolBy(d.pool);return card('📥 Подтвердите добавление',[details(p),`Ключей: <b>${state().codes(d).length}</b>\nПосле добавления ожидающие заказы продолжатся автоматически.`],[[{text:'✅ Добавить ключи',callback_data:'cdk:c:'+d.id}],[cancel]]);}
 async function receipt(d){const r=JSON.parse(d.result),p=poolBy(d.pool);return card(r.conflicts?'⚠️ Ключи добавлены частично':'✅ Ключи обработаны',[details(p),`Добавлено: <b>${r.inserted}</b>\nУже добавлялись: <b>${Math.max(0,r.skipped-r.conflicts)}</b>`+(r.conflicts?`\nДругой тариф или поставщик: <b>${r.conflicts}</b>. Проверьте эти ключи в SDK/CDK.`:''),r.inserted?'Ожидающие заказы продолжатся автоматически.':'Новых ключей не поступило; дубликаты пропущены.'],[[home]]);}
 async function process(d){
  try{
   const codes=state().codes(d),result=await request({action:'cdk_import',telegram_id:owner,reference:'tgcdk-'+d.id,pool:d.pool,codes});
   const p=poolBy(d.pool);if(result.pool!==p.id||result.productKey!==p.productKey||result.activationSiteUrl!==p.site||result.received!==codes.length||['inserted','skipped','conflicts'].some(k=>!Number.isSafeInteger(result[k])||result[k]<0))throw Error();
   await state().run("UPDATE drafts SET state='done',result=?,cipher=NULL WHERE id=? AND owner=?",[JSON.stringify(result),d.id,owner]);await receipt({...d,result:JSON.stringify(result)});
  }catch{
   await state().run("UPDATE drafts SET state='uncertain' WHERE id=? AND owner=? AND state<>'done'",[d.id,owner]);
   await card('⚠️ Добавление требует проверки',[details(poolBy(d.pool)),'Результат пока не подтверждён. Проверьте этот же запрос: повтор не создаст дубликаты ключей.',`🔧 <b>Для проверки</b>\n<code>owner_cdk_import | ref=tgcdk-${d.id} | pool=${d.pool}</code>`],[[{text:'🔎 Проверить добавление',callback_data:'cdk:c:'+d.id}],[home]]);
  }
 }
 function background(d){if(jobs.has(d.id))return;jobs.set(d.id,process(d).catch(()=>{}).finally(()=>jobs.delete(d.id)));}
 return {
  async handleMessage(m){
   const text=String(m?.text||'').trim(),command=/^\/cdk(?:@myadminiibot)?(?:\s|$)/i.test(text),start=/^\/start(?:@myadminiibot)?\s+cdk_([a-z0-9-]+)_(aisou|aibuy)$/i.exec(text);
   if(!allowed(m?.chat,m?.from))return Boolean(command||start);
   if(command){await state().cancel(owner);const p=poolBy(text.split(/\s+/)[1]);if(p)await input(p,'msg:'+m.message_id);else await menu();return true;}
   if(start){const p=poolFor(start[1],start[2]);if(p)await input(p,'msg:'+m.message_id);else await menu();return true;}
   if(/^\/cancel(?:@myadminiibot)?$/i.test(text)){const active=await state().get("SELECT 1 FROM drafts WHERE owner=? AND state IN ('input','confirm')",[owner]);if(!active)return false;await state().cancel(owner);await card('ℹ️ Добавление отменено',['Вы можете выбрать другой тариф.'],[[home]]);return true;}
   if(text.startsWith('/')){await state().cancel(owner);return false;}
   let d=await state().input(owner,now());
   const reply=m.reply_to_message;
   if(!d&&botId&&String(reply?.from?.id)===String(botId)&&!reply.forward_origin){
    const body=String(reply.text||''),pk=/(?:Пул:\s*|pool=)([a-z0-9-]+)/i.exec(body)?.[1],site=/aichongzhi\.fun/.test(body)&&!/aiee\.fun/.test(body)?'aibuy':'aisou';
    const p=poolFor(pk,site);if(p&&/cdk_stock_wait|marketplace_stock_wait/.test(body))d=await state().begin(owner,'reply:'+m.message_id,p.id,now());
   }
   if(!d)return false;
   let codes;try{codes=parseCodes(text);}catch{await card('📥 Не удалось разобрать ключи',[details(poolBy(d.pool)),'Пришлите только CDK: до 20 штук, каждый с новой строки.'],[[cancel]]);return true;}
   const staged=await state().stage(d,owner,codes,'keys:'+m.message_id,now());if(staged)await confirm(staged);return true;
  },
  async handleCallback(q){
   const data=String(q?.data||'');if(!data.startsWith('cdk:'))return false;
   if(!allowed(q?.message?.chat,q?.from)){await answer(q.id,'Доступно только владельцу в личном чате');return true;}
   await answer(q.id,'').catch(()=>{});
   if(data==='cdk:cancel'){await state().cancel(owner);await card('ℹ️ Добавление отменено',[],[[home]]);return true;}
   if(data==='cdk:open'){await state().cancel(owner);await menu();return true;}
   let match=/^cdk:g:(grok|codex|claude)$/.exec(data);if(match){await menu(match[1]);return true;}
   match=/^cdk:o:([a-z0-9-]+):(aisou|aibuy)$/.exec(data);let p=match?poolFor(match[1],match[2]):poolBy(/^cdk:p:([a-z0-9]+)$/.exec(data)?.[1]);
   if(p){await input(p,'cb:'+q.id);return true;}
   match=/^cdk:c:([a-f0-9]{32})$/.exec(data);if(!match)return true;
   let d=await state().find(match[1],owner);if(!d)return true;
   if(d.state==='done'){await receipt(d);return true;}
   if(d.state==='processing'){background(d);return true;}
   const changed=await state().claim(d.id,owner,now());if(!changed.changes){await card('⌛ Подтверждение устарело',['Выберите тариф и пришлите ключи заново.'],[[home]]);return true;}
   d=await state().find(d.id,owner);background(d);return true;
  },
  async drain(){await Promise.all([...jobs.values()]);},
 };
}
