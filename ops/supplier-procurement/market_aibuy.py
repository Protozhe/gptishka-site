"""New paid marketplace empty-pool acquisition and one-shot activation.

Supplier credentials stay in the independent root broker. This adapter retains
encrypted input and once-only claims in the existing marketplace database.
"""
import hashlib,html,json,os,socket,sqlite3,time
from contextlib import contextmanager
from pathlib import Path
from market_aibuy_common import PRICES,UUID,classify,product,workflow,pool,eligible,session,stamp,money

CONFIG=Path('/opt/pulse-web/data/aibuy-market.json')
URL='https://aichongzhi.fun/api/redeem.php?a='

def config():
    try:return json.loads(CONFIG.read_text())
    except (OSError,ValueError):return {'enabled':False}

def source_allowed(platform,created,account=None):
    try:
        p=config();m=p['marketplaces'];return p.get('enabled') is True and m.get('enabled') is True and platform in ('funpay','playerok') and stamp(m['enabledAfter'])<=time.time() and stamp(created)>=stamp(m['enabledAfter']) and (account is None or str(account) in m['accounts'][platform])
    except (KeyError,ValueError,TypeError):return False

def claude_title(title):return ('claude_pro',0,'claude_pro') if classify(title)==0 else None

def init(a):
    with a.connect() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS market_aibuy_attempts(
          job_id INTEGER PRIMARY KEY,contract_code INTEGER NOT NULL,state TEXT NOT NULL,
          encrypted_session TEXT,session_hash TEXT NOT NULL,key_id INTEGER UNIQUE,
          amount_minor INTEGER,cost_rub TEXT,trade_no TEXT UNIQUE,dispatched INTEGER NOT NULL DEFAULT 0,
          provider_task TEXT,next_at REAL NOT NULL DEFAULT 0,funds_at REAL,reason TEXT,
          created_at REAL NOT NULL,updated_at REAL NOT NULL)''')
        c.execute('''CREATE TABLE IF NOT EXISTS market_aibuy_notices(
          event TEXT PRIMARY KEY,state TEXT NOT NULL,message TEXT NOT NULL,message_id TEXT,created_at REAL NOT NULL)''')

def rpc(jid,action='procure'):
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
        s.settimeout(245);s.connect('/run/gptishka-aibuy-market/rpc.sock')
        s.sendall(json.dumps({'action':action,'job_id':jid}).encode());s.shutdown(socket.SHUT_WR);raw=b''
        while True:
            chunk=s.recv(4096)
            if not chunk:break
            raw+=chunk
            if len(raw)>8192:raise ValueError('supplier_reply_invalid')
    r=json.loads(raw)
    if r.get('error'):raise ValueError(r['error'] if __import__('re').fullmatch(r'supplier_[a-z_]{1,70}',r['error']) else 'supplier_requires_review')
    return r

def update(a,jid,**values):
    assert set(values)<=set('state encrypted_session key_id amount_minor cost_rub trade_no dispatched provider_task next_at funds_at reason'.split())
    values['updated_at']=time.time()
    with a.connect() as c:c.execute('UPDATE market_aibuy_attempts SET '+','.join(k+'=?' for k in values)+' WHERE job_id=?',(*values.values(),jid))

def notice(a,job,event,text):
    label='Claude Pro' if job['product_type']=='claude_pro' else 'Codex '+str(job['package'])
    message=f"{text}\n\n🧾 <b>{'FunPay' if job['platform']=='funpay' else 'PlayerOK'}</b> · <code>{html.escape(job['order_id'])}</code>\n🛍 <b>{label}</b>"
    with a.connect() as c:c.execute("INSERT OR IGNORE INTO market_aibuy_notices VALUES(?,'pending',?,NULL,?)",(str(job['id'])+':'+event,message,time.time()))

def send_notices(a):
    from funpay_telegram_fallback import telegram_config,telegram_call,send_message
    with a.connect() as c:rows=c.execute("SELECT * FROM market_aibuy_notices WHERE state='pending' ORDER BY created_at LIMIT 3").fetchall()
    if not rows:return
    target,token=telegram_config()
    if telegram_call(token,'getMe',{}).get('username','').lower()!='funpaypulseaibot':return
    for r in rows:
        with a.connect() as c:
            if c.execute("UPDATE market_aibuy_notices SET state='sending' WHERE event=? AND state='pending'",(r['event'],)).rowcount!=1:continue
        try:
            result=send_message(target,token,r['message']);mid=str((result or {}).get('message_id') or '');state='sent' if mid else 'uncertain'
        except Exception:mid='';state='uncertain'
        with a.connect() as c:c.execute('UPDATE market_aibuy_notices SET state=?,message_id=? WHERE event=?',(state,mid,r['event']))

def instruction(a,jid,messages):
    from codex_automation import utc_now
    with a.connect() as c:
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        if not j or not eligible(j,config()) or j['instruction_sent_at'] or (j['platform']=='funpay' and not j['anchor_message_id']):return
        if c.execute('UPDATE codex_jobs SET instruction_sent_at=? WHERE id=? AND instruction_sent_at IS NULL',(utc_now(),jid)).rowcount!=1:return
    text='Для подключения Claude Pro отправьте ID вашего аккаунта Claude (UUID).\n\nОткройте https://claude.ai/settings/account → настройки аккаунта → скопируйте ID полностью.\n\nНужен только ID аккаунта. Пароль и платёжные данные присылать не нужно.'
    try:
        if j['platform']=='playerok':a.playerok_source.send(j['chat_id'],text)
        else:a._worker_post_json('/accounts/'+str(j['account_id'])+'/chats/'+str(j['chat_id'])+'/send',{'text':text},timeout=20)
    except Exception:
        notice(a,j,'instruction_uncertain','⚠️ <b>Claude Pro · Проверяем доставку инструкции</b>\n\nПовторное сообщение автоматически не отправляется.')

def capture(a,j):
    code=j['package'] if j['product_type']=='codex' else 0
    if code==0:
        value=str(j['email'] or '').strip()
        if not UUID.fullmatch(value) and j['note_url']:
            value=a._grok_user_id(a._fetch_note(j['note_url']))
        raw=session(value,0)
    else:raw=session(json.dumps(a._fetch_note(j['note_url']),ensure_ascii=False),code)
    return code,raw

def handle(a,jid):
    init(a)
    with a.connect() as c:
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        r=c.execute('SELECT * FROM market_aibuy_attempts WHERE job_id=?',(jid,)).fetchone()
        if not j:return False
        if r:return r['state']!='native_stock'
        settings=c.execute('SELECT enabled,auto_submit FROM codex_settings WHERE id=1').fetchone()
        if not settings or not settings['enabled'] or not settings['auto_submit']:return False
        if j['product_type']=='codex' and j['package']==2500 and eligible({**dict(j),'package':1000},config()) and j['status'] in ('waiting_data','failed'):
            if j['key_id'] or j['aiee_order_id'] or c.execute("SELECT 1 FROM codex_keys WHERE pool='codex_2500' AND status='available'").fetchone():return False
            # The authenticated catalog has no 2500 variant. Do not substitute
            # another denomination or turn one order into multiple debits.
            unavailable=dict(j)
        else:unavailable=None
        if unavailable:
            pass
        elif not eligible(j,config()) or j['status'] not in ('waiting_data','failed'):return False
        code=j['package'] if j['product_type']=='codex' else 0
        if not unavailable and classify(j['title'])!=code:
            notice(a,j,'product_ambiguous','⚠️ <b>AI-BUY · Не подтверждён товар</b>\n\nСтатус: <b>нужна проверка тарифа</b>\nВ заказе несколько номиналов или другой продукт. Покупка и активация остановлены.')
            return True
        if j['key_id'] or j['aiee_order_id'] or j['started_at'] or j['last_poll_status']:return False
        if code and c.execute("SELECT 1 FROM codex_keys WHERE pool=? AND status='available'",('codex_'+str(code),)).fetchone():return False
    if unavailable:
        notice(a,j,'sku_unavailable','⚠️ <b>AI-BUY · Номинал недоступен</b>\n\nСтатус: <b>ожидаем ключ Codex 2500</b>\nУ поставщика нет этого номинала. Другой ключ не куплен; списаний нет.')
        return True
    try:code,raw=capture(a,j)
    except Exception:
        # No purchase demand exists until customer input is complete and fresh.
        notice(a,j,'session_required','⚠️ <b>AI-BUY · Нужны данные аккаунта</b>\n\nСтатус: <b>ожидаем корректные данные клиента</b>\nПокупка и списание не выполнялись.')
        return True
    from codex_automation import utc_now
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        if fresh['status'] not in ('waiting_data','failed') or fresh['key_id'] or fresh['aiee_order_id']:return True
        if c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',(j['platform'],j['account_id'],j['order_id'])).fetchone():return True
        now=time.time();cipher=a._fernet().encrypt(raw.encode()).decode();digest=hashlib.sha256(raw.encode()).hexdigest()
        c.execute("INSERT OR IGNORE INTO market_aibuy_attempts(job_id,contract_code,state,encrypted_session,session_hash,created_at,updated_at) VALUES(?,?,'procurement',?,?,?,?)",(jid,code,cipher,digest,now,now))
        c.execute("UPDATE codex_jobs SET key_pool=?,status='waiting_data',error='',started_at=COALESCE(started_at,?),updated_at=? WHERE id=?",(pool(code),utc_now(),utc_now(),jid))
    drive(a,jid);return True

def bind(a,j,r,result):
    code=r['contract_code'];value=result.get('code')
    if (type(result.get('credits')) is not int or result.get('credits')!=code or result.get('product_key')!=product(code) or result.get('activationSiteUrl')!='https://aichongzhi.fun'
        or type(result.get('amount_minor')) is not int or not 0<result['amount_minor']<=PRICES[code] or not isinstance(value,str) or not __import__('re').fullmatch(r'\d{10,32}',str(result.get('trade_no') or '')) or money(result.get('cost_rub'))<=0):raise ValueError('supplier_reply_invalid')
    fingerprint=hashlib.sha256(value.encode()).hexdigest()
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE');fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(j['id'],)).fetchone()
        if fresh['status'] not in ('waiting_data','ready') or fresh['aiee_order_id'] or fresh['key_id'] not in (None,r['key_id']):raise ValueError('supplier_order_changed')
        key=c.execute('SELECT * FROM codex_keys WHERE fingerprint=?',(fingerprint,)).fetchone()
        if key and (key['reserved_job_id']!=j['id'] or key['pool']!=pool(code) or key['status']!='reserved'):raise ValueError('supplier_stock_conflict')
        if not key:
            c.execute("INSERT INTO codex_keys(package,pool,encrypted_key,fingerprint,status,reserved_job_id,added_at) VALUES(?,?,?,?,'reserved',?,datetime('now'))",(code,pool(code),a._fernet().encrypt(value.encode()).decode(),fingerprint,j['id']))
            key_id=c.execute('SELECT last_insert_rowid()').fetchone()[0]
        else:key_id=key['id']
        c.execute("UPDATE market_aibuy_attempts SET state='key_ready',key_id=?,amount_minor=?,cost_rub=?,trade_no=?,next_at=0,reason='',updated_at=? WHERE job_id=? AND dispatched=0",(key_id,result['amount_minor'],str(result['cost_rub']),result['trade_no'],time.time(),j['id']))
        c.execute("UPDATE codex_jobs SET key_id=?,status='ready',error='',updated_at=datetime('now') WHERE id=?",(key_id,j['id']))

def frozen_cost(a,j,r):
    # Actual acquisition is one expense, even when activation later needs review.
    from decimal import Decimal
    con=sqlite3.connect(a.profit_db_path,timeout=15)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE');old=con.execute('SELECT cost_rub FROM order_cost_overrides WHERE account_id=? AND order_id=?',(j['account_id'],j['order_id'])).fetchone()
            if old and abs(Decimal(str(old[0]))-Decimal(r['cost_rub']))>Decimal('.005'):raise ValueError('supplier_cost_binding_invalid')
            if not old:con.execute('INSERT INTO order_cost_overrides(account_id,order_id,cost_rub,updated_at) VALUES(?,?,?,?)',(j['account_id'],j['order_id'],float(r['cost_rub']),str(time.time())))
    finally:con.close()

def poll_result(a,j,r,result):
    code=r['contract_code']
    if result.get('ok') is not True or result.get('workflow')!=workflow(code):raise ValueError('supplier_activation_unconfirmed')
    success=result.get('final') is True and result.get('status')=='done'
    failed=result.get('final') is True and not success
    from codex_automation import utc_now
    if success:
        with a.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute("UPDATE market_aibuy_attempts SET state='completed',encrypted_session=NULL,reason='',updated_at=? WHERE job_id=?",(time.time(),j['id']))
            c.execute("UPDATE codex_jobs SET status='success',error='',finished_at=COALESCE(finished_at,?),last_poll_status='success',updated_at=? WHERE id=? AND key_id=?",(utc_now(),utc_now(),j['id'],r['key_id']))
            c.execute("UPDATE codex_keys SET status='used',used_at=COALESCE(used_at,?) WHERE id=? AND reserved_job_id=?",(utc_now(),r['key_id'],j['id']))
        notice(a,j,'completed','✅ <b>AI-BUY · Активация выполнена</b>\n\nСтатус: <b>подтверждено поставщиком</b>\nОдна закупка и одна отправка. Повторный запуск заблокирован.')
    elif failed:
        update(a,j['id'],state='review',reason='provider_final_failure',next_at=time.time()+86400)
        with a.connect() as c:c.execute("UPDATE codex_jobs SET status='manual_action',error='AI-BUY: поставщик не завершил активацию; повторная отправка заблокирована',updated_at=? WHERE id=? AND status<>'success'",(utc_now(),j['id']))
        notice(a,j,'review','⚠️ <b>AI-BUY · Требуется проверка</b>\n\nПоставщик завершил заявку с ошибкой. Повторная закупка и активация остановлены.')
    else:
        update(a,j['id'],state='processing',next_at=time.time()+30)
        try:overdue=bool(j['aiee_order_id']) and time.time()-stamp(j['updated_at'])>=900
        except (TypeError,ValueError):overdue=False
        if overdue:notice(a,j,'pending_15','⚠️ <b>AI-BUY · Активация задерживается</b>\n\nСтатус: <b>проверяем исходную заявку более 15 минут</b>\nПовторная покупка и отправка заблокированы; продолжаем проверять результат.')

def drive(a,jid):
    import fcntl
    directory=Path(a.db_path).parent/'aibuy-market-locks';directory.mkdir(mode=0o700,exist_ok=True)
    with (directory/(str(jid)+'.lock')).open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return
        with a.connect() as c:
            j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone();r=c.execute('SELECT * FROM market_aibuy_attempts WHERE job_id=?',(jid,)).fetchone()
        if not j or not r or r['state'] in ('completed','native_stock','owner_stopped','review') or r['next_at']>time.time():return
        if j['status'] in ('paused','manual_completed','cancelled','success') or j['archived_at']:
            update(a,jid,state='owner_stopped');return
        try:
            if r['state']=='procurement':
                result=rpc(jid)
                if result.get('state')=='funds_wait':
                    start=r['funds_at'] or time.time();update(a,jid,funds_at=start,next_at=time.time()+30,reason='supplier_balance_insufficient')
                    notice(a,j,'funds_wait','⏳ <b>AI-BUY · Ожидаем пополнение</b>\n\nСтатус: <b>заказ сохранён на 15 минут</b>\nПополните общий баланс AI-BUY. После пополнения продолжим автоматически.')
                    if time.time()-start>=900:notice(a,j,'funds_deadline','🚨 <b>AI-BUY · Баланс не пополнен</b>\n\nПрошло 15 минут. Заказ остаётся в ожидании; списания и повторной оплаты нет.')
                    return
                bind(a,j,r,result)
                with a.connect() as c:r=c.execute('SELECT * FROM market_aibuy_attempts WHERE job_id=?',(jid,)).fetchone()
            if not r['dispatched']:frozen_cost(a,j,r)
            with a.connect() as c:key=c.execute('SELECT * FROM codex_keys WHERE id=?',(r['key_id'],)).fetchone()
            if not key or key['reserved_job_id']!=jid or key['pool']!=pool(r['contract_code']):raise ValueError('supplier_stock_conflict')
            value=a._fernet().decrypt(key['encrypted_key'].encode()).decode();provider='claude' if r['contract_code']==0 else 'gpt'
            if not r['dispatched']:
                rpc(jid,'attest')
                checked=a._post_json(URL+'verifyCdk',{'code':value,'product':provider},timeout=45)
                if checked.get('ok') is not True or checked.get('workflow')!=workflow(r['contract_code']) or checked.get('status')!='unused' or checked.get('job_id') or checked.get('task_id') or checked.get('email'):raise ValueError('supplier_key_quarantined')
                raw=session(a._fernet().decrypt(r['encrypted_session'].encode()).decode(),r['contract_code'])
                from codex_automation import utc_now
                with a.connect() as c:
                    c.execute('BEGIN IMMEDIATE');fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
                    if fresh['status']!='ready' or fresh['key_id']!=r['key_id']:raise ValueError('supplier_order_changed')
                    if c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',(j['platform'],j['account_id'],j['order_id'])).fetchone():raise ValueError('supplier_refund_hold')
                    if c.execute("UPDATE market_aibuy_attempts SET dispatched=1,state='processing',next_at=?,updated_at=? WHERE job_id=? AND dispatched=0",(time.time()+30,time.time(),jid)).rowcount!=1:return
                    c.execute("UPDATE codex_jobs SET status='submitting',aiee_order_id=?,last_poll_status='aibuy_submit_once',updated_at=? WHERE id=?",('aibuy-'+str(jid),utc_now(),jid))
                try:result=a._post_json(URL+'activate',{'code':value,'token':raw,'cookie':'','product':provider},timeout=90)
                except Exception:return  # Durable dispatch remains; the next cycle reads status only.
            else:result=a._post_json(URL+'status',{'code':value,'product':provider},timeout=45)
            poll_result(a,j,r,result)
        except Exception as e:
            reason=str(e);reason=reason if __import__('re').fullmatch(r'supplier_[a-z_]{1,70}',reason) else 'supplier_result_unconfirmed'
            update(a,jid,reason=reason,next_at=time.time()+60)
            notice(a,j,reason,'⚠️ <b>AI-BUY · Проверяем заказ</b>\n\nСтатус: <b>ожидает проверки</b>\nПричина: <code>'+html.escape(reason)+'</code>\nИсходный запрос сохранён, повторное списание заблокировано.')

def tick(a):
    init(a)
    with a.connect() as c:rows=c.execute("SELECT job_id FROM market_aibuy_attempts WHERE state NOT IN ('completed','native_stock','owner_stopped','review') AND next_at<=? ORDER BY updated_at LIMIT 4",(time.time(),)).fetchall()
    import threading
    for r in rows:
        jid=r['job_id']
        with _active_lock:
            if jid in _active or len(_active)>=4:continue
            _active.add(jid)
        def run(job_id=jid):
            try:drive(a,job_id)
            finally:
                with _active_lock:_active.discard(job_id)
        threading.Thread(target=run,daemon=True).start()
    try:send_notices(a)
    except Exception:pass  # A pre-send read failure keeps notices pending; never log a bot URL.

def submit_guard(a,jid):
    init(a)
    with a.connect() as c:r=c.execute('SELECT 1 FROM market_aibuy_attempts WHERE job_id=?',(jid,)).fetchone()
    if not r:return False
    drive(a,jid);return True

import threading
_active=set()
_active_lock=threading.Lock()
