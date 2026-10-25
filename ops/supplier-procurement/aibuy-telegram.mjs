import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const sqlite3=createRequire(import.meta.url)('sqlite3');
const CONFIG='/var/lib/gptishka-runtime/aibuy-topup-ui/config.json';
const STATE='/var/lib/gptishka-runtime/aibuy-topup-ui/state/drafts.sqlite';
const SOCKET='/run/gptishka-aibuy-topup/rpc.sock';
const TTL=30*60*1000;
const money=n=>(n/100).toLocaleString('ru-RU',{maximumFractionDigits:2});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function parseAmount(text){const s=String(text).trim().replace(',','.');if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(s))return null;const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));return n>=1000&&n<=1000000?n:null}
export function invoiceUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='pay.ai-buy.vip'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/pay\/checkout-counter\/[A-Za-z0-9_-]{8,80}$/.test(u.pathname)}catch{return false}}
export function rpc(req){return new Promise((resolve,reject)=>{const s=net.createConnection(SOCKET);let raw='';s.setTimeout(210000,()=>s.destroy(Error('supplier_topup_unconfirmed')));s.on('connect',()=>s.end(JSON.stringify(req)));s.on('data',b=>{raw+=b;if(raw.length>8192)s.destroy(Error())});s.on('end',()=>{try{const r=JSON.parse(raw);if(r.error)throw Error(/^supplier_[a-z_]+$/.test(r.error)?r.error:'supplier_topup_unconfirmed');resolve(r)}catch(e){reject(e)}});s.on('error',()=>reject(Error('supplier_topup_unconfirmed')));})}

export class TopupStore{
 constructor(file=STATE){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.closeSync(fs.openSync(file,'a',0o600));this.db=new sqlite3.Database(file);this.db.configure('busyTimeout',5000);this.ready=this.run(`CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,origin TEXT UNIQUE NOT NULL,owner TEXT NOT NULL,state TEXT NOT NULL,amount INTEGER,network TEXT,url TEXT,created INTEGER NOT NULL,error TEXT)`);}
 run(sql,args=[]){return new Promise((resolve,reject)=>this.db.run(sql,args,function(e){e?reject(e):resolve({changes:this.changes})}))}
 get(sql,args=[]){return new Promise((resolve,reject)=>this.db.get(sql,args,(e,r)=>e?reject(e):resolve(r)))}
 async begin(owner,origin,now){await this.ready;const id=randomBytes(16).toString('hex');await this.run("INSERT OR IGNORE INTO drafts(id,origin,owner,state,created) VALUES(?,?,?,'amount',?)",[id,origin,owner,now]);return this.get('SELECT * FROM drafts WHERE origin=? AND owner=?',[origin,owner])}
 async find(id,owner){await this.ready;return this.get('SELECT * FROM drafts WHERE id=? AND owner=?',[id,owner])}
 async input(owner,now){await this.ready;return this.get("SELECT * FROM drafts WHERE owner=? AND state='amount_input' AND created>? ORDER BY created DESC LIMIT 1",[owner,now-TTL])}
 async amount(id,owner,n){await this.ready;return this.run("UPDATE drafts SET amount=?,state='network' WHERE id=? AND owner=? AND state IN ('amount','amount_input','network')",[n,id,owner])}
 async claim(id,owner,network){await this.ready;return this.run("UPDATE drafts SET network=?,state='creating' WHERE id=? AND owner=? AND state='network'",[network,id,owner])}
 async close(){await this.ready;return new Promise((res,rej)=>this.db.close(e=>e?rej(e):res()))}
}

export function createAibuyTopupUi({send,answer,ownerId,store,request=rpc,now=Date.now}={}){
 if(!ownerId){try{ownerId=JSON.parse(fs.readFileSync(CONFIG,'utf8')).telegramId}catch{ownerId=''}}
 const owner=String(ownerId||'');let db=store;const jobs=new Map();const state=()=>db||(db=new TopupStore());
 const allowed=(chat,from)=>/^[1-9][0-9]*$/.test(owner)&&chat?.type==='private'&&String(chat.id)===owner&&String(from?.id)===owner;
 const card=(text,buttons)=>send(owner,text,{parse_mode:'HTML',reply_markup:{inline_keyboard:buttons},protect_content:false});
 const menuButton=[{text:'← Новое пополнение',callback_data:'aib:open'}];
 async function menu(origin){const d=await state().begin(owner,origin,now());if(d.state==='created')return showInvoice(d);if(d.state==='creating'||d.state==='review')return waiting(d);return card('💰 <b>AI-BUY · Пополнение баланса</b>\n\n<b>Шаг 1 из 2 · Сумма</b>\nВыберите сумму в юанях. Затем выберите сеть USDT.\n\nСсылка откроется без входа в кабинет AI-BUY.',[[200,500,1000].map(n=>({text:`¥${n}`,callback_data:`aib:a:${d.id}:${n*100}`})),[{text:'✏️ Другая сумма',callback_data:`aib:c:${d.id}`}],[{text:'🔄 Проверить баланс',callback_data:'aib:b'}]])}
 async function networks(d){return card(`💰 <b>AI-BUY · Пополнение баланса</b>\n\n<b>Шаг 2 из 2 · Сеть USDT</b>\nСумма: <b>¥${money(d.amount)}</b>\n\nВыберите сеть. Бот сформирует один неоплаченный счёт; перевод выполняете вы.`,[[{text:'USDT · TRC20',callback_data:`aib:n:${d.id}:TRC20`},{text:'USDT · BEP20',callback_data:`aib:n:${d.id}:BEP20`}],menuButton])}
 async function showInvoice(d){if(!invoiceUrl(d.url))throw Error('supplier_topup_unconfirmed');return card(`🔗 <b>AI-BUY · Ссылка на пополнение</b>\n\nСумма: <b>¥${money(d.amount)}</b>\nСеть: <b>USDT · ${d.network}</b>\nСтатус: <b>счёт создан</b>\n\nОткройте ссылку и переведите точную сумму USDT, указанную на платёжной странице. Используйте выбранную сеть.\n\nВход в кабинет поставщика не требуется. После поступления средств ожидающие заказы продолжат обработку.`,[[{text:'💳 Открыть оплату',url:d.url}],[{text:'🔄 Проверить баланс',callback_data:'aib:b'}],menuButton])}
 async function waiting(d){return card('⏳ <b>AI-BUY · Проверяем ссылку</b>\n\nИсходный запрос сохранён. Повторное нажатие проверит тот же счёт, без создания нового.\n\n'+(d.error==='supplier_login_required'?'Нужно восстановить серверную сессию AI-BUY.':'Если поставщик ещё не ответил, повторите проверку позже.'),[[{text:'🔗 Получить исходную ссылку',callback_data:`aib:r:${d.id}`}],menuButton])}
 function background(id,work){if(jobs.has(id))return;jobs.set(id,Promise.resolve().then(work).catch(()=>{}).finally(()=>jobs.delete(id)))}
 async function generate(d){try{const r=await request({action:'create_invoice',telegram_id:owner,reference:'tg-'+d.id,amount_minor:d.amount,network:d.network});if(!invoiceUrl(r.invoice_url)||r.paid!==false||r.amount_minor!==d.amount||r.network!==d.network)throw Error('supplier_topup_unconfirmed');await state().run("UPDATE drafts SET state='created',url=?,error=NULL WHERE id=? AND owner=?",[r.invoice_url,d.id,owner]);await showInvoice({...d,state:'created',url:r.invoice_url})}catch(e){const error=/^supplier_[a-z_]+$/.test(e.message)?e.message:'supplier_topup_unconfirmed';await state().run("UPDATE drafts SET state='review',error=? WHERE id=? AND owner=? AND state<>'created'",[error,d.id,owner]);await waiting({...d,error})}}
 async function balance(){try{const r=await request({action:'balance',telegram_id:owner});if(!Number.isSafeInteger(r.balance_minor)||r.balance_minor<0)throw Error();await card(`💰 <b>AI-BUY · Текущий баланс</b>\n\nДоступно: <b>¥${money(r.balance_minor)}</b>\n\nДанные получены из кабинета поставщика. Если пополнение ещё не отразилось, проверьте позже.`,[menuButton])}catch{await card('⚠️ <b>AI-BUY · Баланс пока не подтверждён</b>\n\nНе удалось прочитать кабинет поставщика. Повторите проверку позже. Закупки и оплаты этой проверкой не запускаются.',[menuButton])}}
 return {
  async handleMessage(m){const text=String(m?.text||'').trim();const command=/^\/aibuy(?:@myadminiibot)?(?:\s|$)/i.test(text)||/^\/start(?:@myadminiibot)?\s+aibuy$/i.test(text);if(!allowed(m?.chat,m?.from))return command;
   if(command){await menu('message:'+owner+':'+String(m.message_id));return true}
   if(text.startsWith('/'))return false;const d=await state().input(owner,now());if(!d)return false;
   const n=parseAmount(text);if(n===null){await card('✏️ <b>AI-BUY · Укажите сумму</b>\n\nВведите сумму от <b>¥10</b> до <b>¥10 000</b>, например <code>200</code>.',[menuButton]);return true}
   await state().amount(d.id,owner,n);await networks({...d,amount:n});return true;
  },
  async handleCallback(q){const data=String(q?.data||'');if(!data.startsWith('aib:'))return false;
   if(!allowed(q?.message?.chat,q?.from)){await answer(q.id,'Доступно только владельцу в личном чате');return true}
   await answer(q.id,'').catch(()=>{});
   if(data==='aib:open'){await menu('callback:'+String(q.id));return true}
   if(data==='aib:b'){background('balance',balance);return true}
   const match=/^aib:([acnr]):([a-f0-9]{32})(?::(\d{4,7}|TRC20|BEP20))?$/.exec(data);
   if(!match)return true;const [,action,id,value]=match;let d=await state().find(id,owner);
   if(!d||now()-d.created>TTL&& !['created','creating','review'].includes(d.state)){await card('⌛ <b>AI-BUY · Меню устарело</b>\n\nОткройте новое пополнение.',[menuButton]);return true}
   if(action==='r'){if(d.state==='created')await showInvoice(d);else if(['creating','review'].includes(d.state))background(id,()=>generate(d));return true}
   if(action==='c'){if(['amount','amount_input','network'].includes(d.state)){await state().run("UPDATE drafts SET state='amount_input' WHERE id=? AND owner=?",[id,owner]);await card('✏️ <b>AI-BUY · Другая сумма</b>\n\nНапишите сумму в юанях от <b>10</b> до <b>10 000</b>, например <code>200</code>.',[menuButton])}return true}
   if(action==='a'){const n=Number(value);if(![20000,50000,100000].includes(n))return true;const changed=await state().amount(id,owner,n);if(changed.changes)await networks({...d,amount:n});return true}
   if(action==='n'&&['TRC20','BEP20'].includes(value)){
    await state().claim(id,owner,value);d=await state().find(id,owner);
    if(d.network!==value){await waiting(d);return true}
    if(d.state==='created'){await showInvoice(d);return true}
    if(d.state==='creating'){await card(`⏳ <b>AI-BUY · Формируем ссылку</b>\n\nСумма: <b>¥${money(d.amount)}</b>\nСеть: <b>USDT · ${esc(d.network)}</b>\n\nПокупки товаров и переводы денег не выполняются.`,[]);background(id,()=>generate(d))}
   }return true;
  },
  async drain(){await Promise.all([...jobs.values()])},
 };
}
