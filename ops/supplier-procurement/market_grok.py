"""Prepaid AISOU Grok marketplace queue. No purchases or payment requests."""
import base64,hashlib,html,json,re,threading,time
from pathlib import Path
from market_aibuy_common import stamp,identity

SITE='https://aiee.fun'
URL=SITE+'/api/auth.php'
ACTIVITY='/opt/pulse-web/data/chat-activity.db'
KEY=Path('/var/lib/docker/volumes/funpay-worker_funpay-data/_data/secret.key')
KINDS=('plus','premium','super','ultra')
WAIT='Данные получены. Подготавливаем активацию.'
UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',re.I)
JWT=re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')
_active=set();_lock=threading.Lock()

def monthly_title(title):
    text=str(title or '').lower()
    periods={int(n)/30 if unit.startswith(('дн','день','day')) else int(n) for n,unit in re.findall(r'(?<!\d)(\d+)\s*(месяц\w*|мес\.?|months?\b|m\b|дн\w*|день|days?\b)',text)}
    return bool(re.search(r'(?:super\s*)?grok\b',text)) and periods=={1} and not re.search(r'annual|year|год',text)

def classify(title):
    text=str(title or '').lower()
    if not monthly_title(text) or re.search(r'(?:готовый|ready|создам|create)\s+(?:\w+\s+){0,3}(?:аккаунт|account)',text):return None
    tiers={ {'lite':'plus','heavy':'ultra'}.get(t,t) for t in re.findall(r'\b(plus|lite|premium|ultra|heavy)\b',text) }
    if not tiers and re.search(r'\bsuper\s*grok\b|\bgrok\s+super\b',text):tiers={'super'}
    return 'grok-'+next(iter(tiers))+'-1' if len(tiers)==1 else None

def pool(product):return 'aisou_grok_'+product.split('-')[1]

def normalize(raw):
    try:
        if isinstance(raw,dict):value=raw
        else:
            raw=str(raw).strip();value=json.loads(raw) if raw.startswith('{') else {'sso':raw}
        if set(value)!={'sso'} or not isinstance(value['sso'],str) or not JWT.fullmatch(value['sso']):raise ValueError()
        token=value['sso'];head,body,_=token.split('.')
        decode=lambda part:json.loads(base64.urlsafe_b64decode(part+'='*(-len(part)%4)))
        header=decode(head);payload=decode(body)
        if header.get('alg')!='HS256' or not UUID.fullmatch(str(payload.get('session_id',''))):raise ValueError()
        if 'exp' in payload and (type(payload['exp']) not in (int,float) or payload['exp']<=time.time()+60):raise ValueError()
        return json.dumps({'sso':token},sort_keys=True,separators=(',',':'))
    except (ValueError,TypeError,KeyError,AttributeError):raise ValueError('supplier_grok_session_required') from None

def provider_product(result):
    types={'grok_lite':('plus',),'grok_plus':('plus','super'),'grok_premium':('premium',),'grok_super':('super',),'grok_ultra':('ultra',),'grok_heavy':('ultra',)}
    allowed=types.get(re.sub(r'_halfprice$','',str(result.get('plan_type') or '')),())
    names={{'lite':'plus','heavy':'ultra'}.get(v,v) for v in re.findall(r'\b(plus|lite|premium|super|ultra|heavy)\b',str(result.get('plan_name','')).lower())}
    if len(names)>1 or names and next(iter(names)) not in allowed:return None
    tier=next(iter(names)) if names else allowed[0] if len(allowed)==1 else None
    period=' '.join(str(result.get(v) or '') for v in ('plan_name','billing_cycle','period'))
    if not tier or result.get('duration_months',1) not in (1,'1') or re.search(r'year|annual|年|12\s*(?:month|месяц)|\b[2-9]\s*months?',period,re.I):return None
    return 'grok-'+tier+'-1'

def eligible(j,policy):
    try:
        cfg=policy['marketplaces'];cutoff=stamp(cfg['enabledAfter'])
        return (policy.get('enabled') is True and cfg.get('enabled') is True and cutoff<=time.time()
            and j['platform'] in ('funpay','playerok') and str(j['account_id']) in cfg['accounts'][j['platform']]
            and j['product_type']=='grok_aisou' and classify(j['title']) and j['key_pool']==pool(classify(j['title']))
            and stamp(j['created_at'])>=cutoff and stamp(j['source_created_at'])>=cutoff
            and j['auto_submit_allowed']==1 and not j['archived_at'])
    except (KeyError,ValueError,TypeError,IndexError):return False

def init(a):
    from market_aibuy import init as notices_init
    notices_init(a)
    with a.connect() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS market_grok_inputs(job_id INTEGER PRIMARY KEY,encrypted_session TEXT NOT NULL,session_hash TEXT NOT NULL,updated_at REAL NOT NULL)''')
        c.execute('''CREATE TABLE IF NOT EXISTS market_grok_attempts(job_id INTEGER PRIMARY KEY,product_key TEXT NOT NULL,state TEXT NOT NULL,
          encrypted_session TEXT,session_hash TEXT NOT NULL,key_id INTEGER UNIQUE,native_key_id TEXT UNIQUE,fingerprint TEXT,sid TEXT,
          provider_order TEXT,dispatched INTEGER NOT NULL DEFAULT 0,next_at REAL NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',created_at REAL NOT NULL,updated_at REAL NOT NULL)''')

def scoped_messages(a,c,j,messages):
    if j['product_type']!='grok_aisou':return messages
    if j['platform']=='funpay':
        paid=lambda m:bool(re.search(r'оплатил\s+заказ',str(m.get('text') or ''),re.I))
        anchor=max([int(j['anchor_message_id'] or 0)]+[a._message_id(m) for m in messages if paid(m) and j['order_id'].lower() in str(m.get('text') or '').lower()])
        if not anchor:return []
        after=[a._message_id(m) for m in messages if paid(m) and a._message_id(m)>anchor and j['order_id'].lower() not in str(m.get('text') or '').lower()]
        end=min(after) if after else float('inf')
        return [m for m in messages if anchor<=a._message_id(m)<end]
    begin=max(j['source_created_at'] or '',j['data_after'] or '')
    next_order=c.execute("SELECT MIN(source_created_at) FROM codex_jobs WHERE account_id=? AND chat_id=? AND id<>? AND source_created_at>?",(j['account_id'],j['chat_id'],j['id'],j['source_created_at'])).fetchone()[0]
    return [m for m in messages if begin<=str(m.get('timestamp_iso') or '') and (not next_order or str(m.get('timestamp_iso') or '')<next_order)]

def capture_messages(a,c,j,messages,anchor):
    if j['product_type']!='grok_aisou':return False
    if c.execute('SELECT 1 FROM market_grok_attempts WHERE job_id=?',(j['id'],)).fetchone():return True
    candidates=[]
    for m in scoped_messages(a,c,j,messages):
        if not isinstance(m,dict) or m.get('is_own'):continue
        if j['platform']=='funpay':
            if not anchor or a._message_id(m)<=anchor:continue
            order=a._message_id(m)
        else:
            order=str(m.get('timestamp_iso') or '')
            if order<max(j['source_created_at'] or '',j['data_after'] or ''):continue
        text=str(m.get('text') or '')
        found=JWT.findall(text)
        if len(found)!=1:continue
        try:raw=normalize(found[0])
        except ValueError:continue
        candidates.append((order,raw))
    if candidates:
        raw=max(candidates,key=lambda item:item[0])[1]
        c.execute('INSERT INTO market_grok_inputs VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET encrypted_session=excluded.encrypted_session,session_hash=excluded.session_hash,updated_at=excluded.updated_at',
          (j['id'],a._fernet().encrypt(raw.encode()).decode(),hashlib.sha256(raw.encode()).hexdigest(),time.time()))
    return bool(c.execute('SELECT 1 FROM market_grok_inputs WHERE job_id=?',(j['id'],)).fetchone())

def notice(a,j,event,reason):
    detail={
      'supplier_grok_session_required':'Сессия Grok не прошла проверку. Нужна свежая cookie sso клиента.',
      'supplier_grok_product_mismatch':'CDK не подтверждает нужный тариф и срок. Проверьте ключ в этом заказе.',
      'supplier_grok_key_quarantined':'CDK уже использован или имеет прежнюю заявку. Другой ключ автоматически не берём.',
      'supplier_grok_submit_unconfirmed':'Отправка не подтверждена. Проверьте исходный CDK у поставщика.',
      'supplier_grok_order_mismatch':'Поставщик вернул другую заявку. Проверьте привязку исходного CDK.',
      'supplier_grok_provider_failed':'Поставщик завершил активацию с ошибкой. Нужна проверка исходной заявки.',
    }.get(reason,'Не удалось подтвердить безопасное продолжение. Проверьте исходный заказ и заявку.')
    message=(f"⚠️ <b>Grok · Нужна проверка</b>\n\n{'FunPay' if j['platform']=='funpay' else 'PlayerOK'} · <code>{html.escape(j['order_id'])}</code>\n"
        +detail+'\nИсходные данные сохранены. Повторная отправка заблокирована.\n<code>'+html.escape(reason)+'</code>')
    with a.connect() as c:c.execute("INSERT OR IGNORE INTO market_aibuy_notices VALUES(?,'pending',?,NULL,?)",(str(j['id'])+':grok_'+event,message,time.time()))

def instruction(a,jid,messages):
    with a.connect() as c:
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        if not j or j['product_type']!='grok_aisou' or j['instruction_sent_at'] or not j['auto_submit_allowed'] or (j['platform']=='funpay' and not j['anchor_message_id']):return
        if c.execute("UPDATE codex_jobs SET instruction_sent_at=datetime('now') WHERE id=? AND instruction_sent_at IS NULL",(jid,)).rowcount!=1:return
    text=('Для подключения Grok нужна cookie sso вашего аккаунта.\n\nВойдите на https://grok.com, нажмите F12 → Application → Cookies → https://grok.com. '
        'Скопируйте значение sso и отправьте сюда либо сохраните его в заметке Notebrio и пришлите ссылку.\n\nПароль и данные карты не нужны.')
    try:
        if j['platform']=='playerok':a.playerok_source.send(j['chat_id'],text)
        else:a._worker_post_json('/accounts/'+str(j['account_id'])+'/chats/'+str(j['chat_id'])+'/send',{'text':text},timeout=20)
    except Exception:notice(a,j,'instruction_uncertain','supplier_grok_instruction_uncertain')

def handle(a,jid):
    with a.connect() as c:
        item=c.execute('SELECT product_type FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        if not item or item['product_type']!='grok_aisou':return False
    init(a)
    with a.connect() as c:
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        r=c.execute('SELECT * FROM market_grok_attempts WHERE job_id=?',(jid,)).fetchone()
        if not j or j['product_type']!='grok_aisou':return False
        if r:drive(a,jid);return True
        cfg=c.execute('SELECT enabled,auto_submit FROM codex_settings WHERE id=1').fetchone()
        if not cfg or not cfg['enabled'] or not cfg['auto_submit']:return True
        from market_aibuy import config
        if not eligible(j,config()) or j['status'] not in ('waiting_data','failed') or j['key_id'] or j['aiee_order_id'] or j['submit_attempts'] or j['last_poll_status']:return True
        saved=c.execute('SELECT * FROM market_grok_inputs WHERE job_id=?',(jid,)).fetchone()
    try:raw=normalize(a._fernet().decrypt(saved['encrypted_session'].encode()).decode() if saved else a._fetch_note(j['note_url']))
    except Exception:
        notice(a,j,'session_required','supplier_grok_session_required');return True
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE');fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        if fresh['status'] not in ('waiting_data','failed') or fresh['key_id'] or fresh['aiee_order_id'] or fresh['note_url']!=j['note_url']:return True
        newest=c.execute('SELECT session_hash FROM market_grok_inputs WHERE job_id=?',(jid,)).fetchone()
        if saved and (not newest or newest['session_hash']!=saved['session_hash']):return True
        if c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',(j['platform'],j['account_id'],j['order_id'])).fetchone():return True
        now=time.time()
        c.execute("INSERT OR IGNORE INTO market_grok_attempts(job_id,product_key,state,encrypted_session,session_hash,created_at,updated_at) VALUES(?,?,'waiting_stock',?,?,?,?)",
          (jid,classify(j['title']),a._fernet().encrypt(raw.encode()).decode(),hashlib.sha256(raw.encode()).hexdigest(),now,now))
        c.execute("UPDATE codex_jobs SET status='waiting_data',error=?,updated_at=datetime('now') WHERE id=?",(WAIT,jid))
    drive(a,jid);return True

def rpc(jid,attest=False):
    from market_aibuy import rpc as call
    return call(jid,'grok_stock_attest' if attest else 'grok_stock')

def update(a,jid,**values):
    assert set(values)<=set('state key_id native_key_id fingerprint sid provider_order dispatched next_at reason encrypted_session'.split())
    values['updated_at']=time.time()
    with a.connect() as c:c.execute('UPDATE market_grok_attempts SET '+','.join(k+'=?' for k in values)+' WHERE job_id=?',(*values.values(),jid))

def review(a,j,reason):
    update(a,j['id'],state='review',reason=reason)
    with a.connect() as c:c.execute("UPDATE codex_jobs SET status='manual_action',error='Grok: исходная заявка требует проверки, повторная отправка заблокирована',updated_at=datetime('now') WHERE id=? AND status NOT IN ('success','paused','cancelled','manual_completed')",(j['id'],))
    notice(a,j,reason,reason)

def result(a,j,r,response,submitted=False):
    if response.get('success') is not True:raise ValueError('supplier_grok_result_unconfirmed')
    order=str(response.get('order_id') or '')
    if not order or r['provider_order'] and order!=r['provider_order']:raise ValueError('supplier_grok_order_mismatch')
    if not r['provider_order']:
        if not submitted:raise ValueError('supplier_grok_submit_unconfirmed')
        update(a,j['id'],provider_order=order)
    if response.get('plan_type') and response.get('plan_name') and provider_product(response)!=r['product_key']:raise ValueError('supplier_grok_product_mismatch')
    state=str(response.get('recharge_status') or '').lower()
    if state in ('success','completed','done'):
        with a.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(j['id'],)).fetchone()
            if fresh['status'] not in ('processing','submitting') or fresh['key_id']!=r['key_id']:return
            c.execute("UPDATE market_grok_attempts SET state='completed',encrypted_session=NULL,reason='',updated_at=? WHERE job_id=?",(time.time(),j['id']))
            c.execute('DELETE FROM market_grok_inputs WHERE job_id=?',(j['id'],))
            c.execute("UPDATE codex_jobs SET status='success',error='',aiee_order_id=?,last_poll_status='success',finished_at=datetime('now'),updated_at=datetime('now') WHERE id=?",(order,j['id']))
            c.execute("UPDATE codex_keys SET status='used',used_at=datetime('now') WHERE id=? AND reserved_job_id=?",(r['key_id'],j['id']))
    elif state in ('failed','error','cancelled','canceled'):review(a,j,'supplier_grok_provider_failed')
    else:
        with a.connect() as c:c.execute("UPDATE codex_jobs SET aiee_order_id=?,status='processing',updated_at=datetime('now') WHERE id=? AND status IN ('processing','submitting')",(order,j['id']))
        update(a,j['id'],next_at=time.time()+30)

def drive(a,jid):
    import fcntl
    path=Path(getattr(a,'db_path','/opt/pulse-web/data/chat-activity.db')).parent/('grok-stock-'+str(jid)+'.lock')
    with path.open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return
        with a.connect() as c:
            j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone();r=c.execute('SELECT * FROM market_grok_attempts WHERE job_id=?',(jid,)).fetchone()
            cfg=c.execute('SELECT enabled,auto_submit FROM codex_settings WHERE id=1').fetchone()
            if not r or r['state'] in ('completed','review','owner_stopped') or not cfg['enabled'] or not cfg['auto_submit']:return
            from market_aibuy import config
            if not eligible(j,config()) or j['status'] not in ('waiting_data','ready','processing','submitting'):return
            if c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',(j['platform'],j['account_id'],j['order_id'])).fetchone():return
        update(a,jid,next_at=time.time()+30)
        try:
            if not r['key_id']:
                reply=rpc(jid)
                if reply.get('state')=='empty':
                    from market_stock_wait import notice as stock_notice
                    stock_notice(a,j,shared=True);return
                value=reply.get('code');fp=hashlib.sha256(str(value).encode()).hexdigest()
                if reply.get('state')!='shared_stock' or reply.get('product_key')!=r['product_key'] or reply.get('activationSiteUrl')!=SITE or not value or reply.get('fingerprint')!=fp or not reply.get('native_key_id'):raise ValueError('supplier_grok_binding_invalid')
                with a.connect() as c:
                    c.execute('BEGIN IMMEDIATE');fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
                    if fresh['status']!='waiting_data' or fresh['key_id'] or fresh['aiee_order_id']:raise ValueError('supplier_grok_order_changed')
                    if c.execute('SELECT 1 FROM codex_keys WHERE fingerprint=?',(fp,)).fetchone():raise ValueError('supplier_grok_binding_invalid')
                    c.execute("INSERT INTO codex_keys(package,pool,encrypted_key,fingerprint,status,reserved_job_id,added_at) VALUES(0,?,?,?,'reserved',?,datetime('now'))",(pool(r['product_key']),a._fernet().encrypt(value.encode()).decode(),fp,jid))
                    key_id=c.execute('SELECT last_insert_rowid()').fetchone()[0]
                    c.execute("UPDATE market_grok_attempts SET key_id=?,native_key_id=?,fingerprint=?,state='key_ready' WHERE job_id=? AND key_id IS NULL",(key_id,reply['native_key_id'],fp,jid))
                    c.execute("UPDATE codex_jobs SET key_id=?,status='ready',error='' WHERE id=?",(key_id,jid))
                with a.connect() as c:r=c.execute('SELECT * FROM market_grok_attempts WHERE job_id=?',(jid,)).fetchone()
            with a.connect() as c:key=c.execute('SELECT * FROM codex_keys WHERE id=?',(r['key_id'],)).fetchone()
            if not key or key['reserved_job_id']!=jid or key['pool']!=pool(r['product_key']) or key['status']!='reserved':raise ValueError('supplier_grok_binding_invalid')
            value=a._fernet().decrypt(key['encrypted_key'].encode()).decode()
            if not r['dispatched']:
                raw=normalize(a._fernet().decrypt(r['encrypted_session'].encode()).decode())
                query=a._post_json(URL,{'action':'query_code','cdk':value},timeout=45)
                verified=a._post_json(URL,{'action':'verify_code','cdk':value},timeout=45)
                if query.get('success') is not True or query.get('status') not in ('active','available','unused') or query.get('order_id') or query.get('previous_failed') or query.get('recharge_status') not in (None,'','unused','none','available'):raise ValueError('supplier_grok_key_quarantined')
                if verified.get('success') is not True or provider_product(verified)!=r['product_key'] or not verified.get('sid') or verified.get('can_submit') is False:raise ValueError('supplier_grok_product_mismatch')
                sid=str(verified['sid'])
                token=a._post_json(URL,{'action':'validate_token','cdk':value,'sid':sid,'json_token':raw,'chatgpt_cookie':''},timeout=45)
                if token.get('success') is not True:raise ValueError('supplier_grok_session_required')
                rpc(jid,attest=True)
                with a.connect() as c:
                    c.execute('BEGIN IMMEDIATE');fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
                    if fresh['status']!='ready' or fresh['key_id']!=r['key_id'] or not fresh['auto_submit_allowed'] or fresh['archived_at']:return
                    if c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',(j['platform'],j['account_id'],j['order_id'])).fetchone():return
                    if c.execute("UPDATE market_grok_attempts SET dispatched=1,state='processing',sid=?,next_at=? WHERE job_id=? AND dispatched=0",(sid,time.time()+30,jid)).rowcount!=1:return
                    c.execute("UPDATE codex_jobs SET status='processing',submit_attempts=submit_attempts+1,last_poll_status='grok_submit_once',updated_at=datetime('now') WHERE id=?",(jid,))
                try:reply=a._post_json(URL,{'action':'submit_recharge','cdk':value,'sid':sid,'json_token':raw,'chatgpt_cookie':''},timeout=90)
                except Exception:return
                result(a,j,r,reply,submitted=True)
            else:result(a,j,r,a._post_json(URL,{'action':'query_code','cdk':value},timeout=45))
        except Exception as error:
            reason=str(error) if re.fullmatch(r'supplier_[a-z_]{1,70}',str(error)) else 'supplier_grok_result_unconfirmed'
            review(a,j,reason)

def tick(a):
    init(a)
    with a.connect() as c:rows=c.execute("SELECT job_id FROM market_grok_attempts WHERE state NOT IN ('completed','review','owner_stopped') AND next_at<=? ORDER BY next_at,job_id LIMIT 4",(time.time(),)).fetchall()
    for row in rows:
        jid=row['job_id']
        with _lock:
            if jid in _active or len(_active)>=4:continue
            _active.add(jid)
        def run(job_id=jid):
            try:drive(a,job_id)
            finally:
                with _lock:_active.discard(job_id)
        threading.Thread(target=run,daemon=True).start()

def root_stock(req,policy,db,payment_reader,web_stock):
    """Independent paid-source/identity/refund/binding validation, prepaid only."""
    from cryptography.fernet import Fernet
    attest=req['action']=='grok_stock_attest';jid=req['job_id']
    with db(ACTIVITY) as c:
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone();r=c.execute('SELECT * FROM market_grok_attempts WHERE job_id=?',(jid,)).fetchone()
        cfg=c.execute('SELECT enabled,auto_submit FROM codex_settings WHERE id=1').fetchone()
        if not j or not r or not cfg['enabled'] or not cfg['auto_submit'] or not eligible(j,policy):raise ValueError('supplier_grok_order_ineligible')
        if r['product_key']!=classify(j['title']) or r['dispatched'] or j['submit_attempts'] or j['aiee_order_id'] or j['status'] not in ('waiting_data','ready') or bool(j['key_id'])!=attest:raise ValueError('supplier_prior_fulfillment')
        if c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',(j['platform'],j['account_id'],j['order_id'])).fetchone():raise ValueError('supplier_refund_hold')
        for table in ('codex_external_fulfillments','market_aibuy_attempts','subscription_reserve_attempts','site_aiee_attempts'):
            if c.execute('SELECT 1 FROM '+table+' WHERE job_id=?',(jid,)).fetchone():raise ValueError('supplier_prior_fulfillment')
        if c.execute("SELECT 1 FROM codex_logs WHERE job_id=? AND (event IN ('submitted','submit_uncertain','submit_pending_confirmation','manual_completed','ready') OR event LIKE 'zovocard%dispatch%')",(jid,)).fetchone():raise ValueError('supplier_prior_fulfillment')
        if attest:
            key=c.execute('SELECT * FROM codex_keys WHERE id=?',(j['key_id'],)).fetchone()
            if not key or key['id']!=r['key_id'] or key['status']!='reserved' or key['reserved_job_id']!=jid or key['fingerprint']!=r['fingerprint'] or key['pool']!=pool(r['product_key']):raise ValueError('supplier_grok_binding_invalid')
        raw=normalize(Fernet(KEY.read_bytes().strip()).decrypt(r['encrypted_session'].encode()).decode())
        if hashlib.sha256(raw.encode()).hexdigest()!=r['session_hash']:raise ValueError('supplier_grok_binding_invalid')
        payment_reader({**dict(j),'contract_code':r['product_key']},policy,classifier=classify)
        payload={'action':'attest' if attest else 'claim','scope':identity(j),'product_key':r['product_key'],'platform':j['platform']}
        if attest:payload['key_id']=r['native_key_id']
        reply=web_stock(payload)
        if attest and (reply.get('native_key_id')!=r['native_key_id'] or reply.get('fingerprint')!=r['fingerprint'] or reply.get('activationSiteUrl')!=SITE):raise ValueError('supplier_grok_binding_invalid')
        return reply
