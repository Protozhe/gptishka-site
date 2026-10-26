"""Automatic one-way subscription handoff. New paid orders only; one CDK submit."""
import json,time,hashlib,os,sqlite3,subprocess,fcntl,importlib.util,html
from pathlib import Path
from decimal import Decimal
ROOT=Path('/opt/pulse-web')
PRODUCTS={'chatgpt_plus':'plus','chatgpt_go':'go','chatgpt_pro_5x':'pro_5x','chatgpt_pro_20x':'pro_20x','chatgpt_pro_25x':'pro_50x'}
ACTIVE={'plus','go','pro','prolight','prolite','promax','pro_5x','pro_20x','pro_50x'}
PRIMARY_POOLS={'zovocard_siteplus_direct','zovocard_plus_direct','zovocard_go_direct','zovocard_pro5x_direct','zovocard_pro20x_direct','zovocard_pro500_direct'}

def digest(raw):return hashlib.sha256(raw.encode()).hexdigest()

def select_pool(kind,plan):
    p=str(plan or '').strip().casefold()
    if p!='free' and p not in ACTIVE:raise ValueError('reserve_unknown_plan')
    if kind not in PRODUCTS:raise ValueError('reserve_pool_unsupported')
    if kind=='chatgpt_pro_25x' and p!='free':raise ValueError('reserve_ios_25x_unavailable')
    return {'chatgpt_plus':'plus','chatgpt_go':'go','chatgpt_pro_5x':'pro5x','chatgpt_pro_20x':'pro20x','chatgpt_pro_25x':'pro25x'}[kind]+('_free' if p=='free' else '_active')

def eligible(j,cfg,now):
    from zovocard_pulse_bridge import _time
    return (cfg.get('enabled') is True and j['product_type'] in PRODUCTS and j['platform'] in ('gptishka','funpay','playerok')
        and j['key_pool'] in PRIMARY_POOLS and j['status']=='manual_action' and not j['key_id'] and not j['aiee_order_id']
        and _time(j['source_created_at'] or j['created_at'])>=_time(cfg['enabled_after'])
        and _time(j['created_at'])>=_time(cfg['enabled_after'])
        and _time(j['source_created_at'] or j['created_at'])>=_time(cfg.get('product_enabled_after',{}).get(j['product_type'],cfg['enabled_after'])) and now-_time(j['created_at'])>=cfg['minimum_wait_seconds'])

def current_candidate(a,job_id,cfg):
    from zovocard_job_status import recoverable_wait,review_reason,primary_inflight
    with a.connect() as c:
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(job_id,)).fetchone()
        if not j or not eligible(j,cfg,time.time()):return None
        if recoverable_wait(j,review_reason(c,job_id)) or primary_inflight(c,job_id):return None
        return j

def init(a):
    with a.connect() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS subscription_reserve_attempts(
          job_id INTEGER PRIMARY KEY,order_id TEXT NOT NULL,platform TEXT NOT NULL,pool TEXT NOT NULL,provider TEXT NOT NULL,
          state TEXT NOT NULL,key_id TEXT,encrypted_key TEXT,encrypted_session TEXT NOT NULL,proof TEXT,cost_proof TEXT,
          dispatched INTEGER NOT NULL DEFAULT 0,provider_order_id TEXT,created_at REAL,updated_at REAL,next_at REAL NOT NULL DEFAULT 0,reason TEXT)''')
        c.execute('CREATE UNIQUE INDEX IF NOT EXISTS subscription_reserve_key_once ON subscription_reserve_attempts(key_id) WHERE key_id IS NOT NULL')
        c.execute('''CREATE TABLE IF NOT EXISTS subscription_reserve_notices(
          event_id TEXT PRIMARY KEY,job_id INTEGER NOT NULL,destination TEXT NOT NULL,message TEXT NOT NULL,state TEXT NOT NULL,updated_at REAL)''')
        c.execute('''CREATE TRIGGER IF NOT EXISTS subscription_reserve_no_primary_reentry
          BEFORE UPDATE OF key_pool ON codex_jobs
          WHEN NEW.key_pool LIKE 'zovocard%' AND EXISTS(
            SELECT 1 FROM subscription_reserve_attempts r WHERE r.job_id=NEW.id AND r.proof IS NOT NULL)
          BEGIN SELECT RAISE(IGNORE); END''')

def update(a,jid,**fields):
    assert set(fields)<=set('state key_id encrypted_key encrypted_session proof cost_proof dispatched provider_order_id updated_at next_at reason'.split())
    fields['updated_at']=time.time()
    with a.connect() as c:c.execute('UPDATE subscription_reserve_attempts SET '+','.join(k+'=?' for k in fields)+' WHERE job_id=?',(*fields.values(),jid))

def site(action,oid=None,**extra):
    req={'action':action,**extra}
    if oid:req['order_id']=oid
    import socket
    if action!='watch':
        with sqlite3.connect('file:'+str(ROOT/'data/chat-activity.db')+'?mode=ro',uri=True) as db:
            db.row_factory=sqlite3.Row
            j=db.execute("SELECT * FROM codex_jobs WHERE platform='gptishka' AND account_id='site' AND order_id=?",(oid,)).fetchone()
            r=db.execute('SELECT * FROM subscription_reserve_attempts WHERE job_id=?',(j['id'],)).fetchone() if j else None
        job_fields='order_id platform account_id product_type title email created_at id'.split()
        reserve_fields='proof provider key_id dispatched provider_order_id'.split()
        context={'job':{k:j[k] for k in job_fields} if j else None,'reserve':{k:r[k] for k in reserve_fields} if r else None,
                 'config':json.loads((ROOT/'data/subscription-reserve.json').read_text())}
        if action=='complete':context['receipt']=json.loads((ROOT/'data/subscription-reserve-receipts'/(oid+'.json')).read_text())
        req['context']=context
    payload=json.dumps(req).encode()
    if len(payload)>16384:raise ValueError('reserve_request_invalid')
    try:
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
            sock.settimeout(65);sock.connect('/run/gptishka-reserve-site/rpc.sock');sock.sendall(payload);sock.shutdown(socket.SHUT_WR)
            output=b''
            while True:
                part=sock.recv(65536)
                if not part:break
                output+=part
                if len(output)>6*1024*1024:raise ValueError('reserve_site_unavailable')
        d=json.loads(output)
    except (OSError,ValueError):raise ValueError('reserve_site_unavailable') from None
    if d.get('error'):raise ValueError(d.get('error'))
    return d

def notice(a,j,suffix,text):
    target='myadminiibot' if j['platform']=='gptishka' else 'funpaypulseaibot'
    prefix='GPTishka' if j['platform']=='gptishka' else 'FunPay' if j['platform']=='funpay' else 'Playerok'
    with a.connect() as c:c.execute("INSERT OR IGNORE INTO subscription_reserve_notices VALUES(?,?,?,?, 'pending',?)",(str(j['id'])+':'+suffix,j['id'],target,f'{prefix} · {j["order_id"]}\n'+text,time.time()))

def funds_wait(a,j,cfg,now):
    """Owner grace period only. This never prepares, funds or submits a payment."""
    from zovocard_pulse_bridge import _time
    cutoff=cfg.get('funds_wait_enabled_after')
    if not cutoff or min(_time(j['source_created_at'] or j['created_at']),_time(j['created_at']))<_time(cutoff):return False
    if j['status']!='manual_action' or j['key_id'] or j['aiee_order_id']:return False
    reason=str(j['error'] or '')
    if not any(x in reason for x in ('wallet_insufficient','Недостаточно доступных средств ZovoCard','Недостаточно средств на карте')):return False
    with a.connect() as c:
        c.execute('CREATE TABLE IF NOT EXISTS subscription_funds_wait(job_id INTEGER PRIMARY KEY,started_at REAL NOT NULL,deadline_at REAL NOT NULL)')
        c.execute('INSERT OR IGNORE INTO subscription_funds_wait VALUES(?,?,?)',(j['id'],now,now+900))
        row=c.execute('SELECT deadline_at FROM subscription_funds_wait WHERE job_id=?',(j['id'],)).fetchone()
    waiting=now<row['deadline_at']
    if waiting:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        deadline=datetime.fromtimestamp(row['deadline_at'],ZoneInfo('Europe/Berlin')).strftime('%d.%m, %H:%M')
        text=f'⏳ Ожидает средств ZovoCard\n\nПричина: недостаточно доступного баланса для подготовки оплаты.\n\nНа устранение: 15 минут, до {deadline} (Берлин). После пополнения автоматика повторно проверит исходную заявку.\n\nДо окончания ожидания переход на резерв отложен; повторная оплата клиента не нужна.'
    else:text='⚠️ Ожидание средств ZovoCard: прошло 15 минут\n\nПополните баланс поставщика. Заказ сохранён. Дальнейшая обработка и переход на подходящий резерв разрешены только после штатной проверки отсутствия списания.'
    notice(a,j,'funds:initial' if waiting else 'funds:expired',text)
    return waiting

def reserve_notice_card(text):
    header, _, body = str(text).partition('\n')
    platform, _, order = header.partition(' · ')
    # Stored notice IDs and bodies are unchanged. Only the outgoing view changes.
    status = 'Выполнено' if body.startswith('✅') else 'В обработке' if body.startswith('⏳') else 'Требуется проверка'
    icon = '✅' if body.startswith('✅') else '⏳' if body.startswith('⏳') else '⚠️'
    funds=body.startswith(('⏳ Ожидает средств ZovoCard','⚠️ Ожидание средств ZovoCard'))
    if funds:status='Ожидает средств'
    title='ZovoCard · Ожидает средств' if funds else 'Активация · резервный канал'
    return (icon + ' <b>'+title+'</b>\n\n'
            '🧾 Заказ: <code>' + html.escape(order[:100]) + '</code>\n'
            '📍 Источник: ' + html.escape(platform[:60]) + '\n\n'
            'Статус: <b>' + status + '</b>\n\n'
            '<b>Результат</b>\n<blockquote>' + html.escape(body[:1600]) + '</blockquote>')


def send_notices(a):
    from funpay_telegram_fallback import send_site_admin_notification,telegram_config,telegram_call
    with a.connect() as c:rows=c.execute("SELECT * FROM subscription_reserve_notices WHERE state='pending' LIMIT 5").fetchall()
    for r in rows:
        with a.connect() as c:
            if c.execute("UPDATE subscription_reserve_notices SET state='sending',updated_at=? WHERE event_id=? AND state='pending'",(time.time(),r['event_id'])).rowcount!=1:continue
        try:
            if r['destination']=='myadminiibot':send_site_admin_notification(reserve_notice_card(r['message']))
            else:
                chat,token=telegram_config()
                if str(telegram_call(token,'getMe',{}).get('username','')).casefold()!='funpaypulseaibot':raise ValueError('bot_identity_mismatch')
                telegram_call(token,'sendMessage',{'chat_id':chat,'text':r['message'],'disable_web_page_preview':True})
            state='sent'
        except Exception:state='uncertain'
        with a.connect() as c:c.execute('UPDATE subscription_reserve_notices SET state=?,updated_at=? WHERE event_id=?',(state,time.time(),r['event_id']))

def native_notice_id(order_id):return -int(hashlib.sha256(('native:'+order_id).encode()).hexdigest()[:12],16)

def notify_native_completions(a,cfg):
    # Active Plus may use the already established native IOS route, without a Pulse job.
    # Observe confirmed completions only. This never starts an activation.
    for o in site('watch',since=cfg['enabled_after'])['orders']:
        if (o['activation_status']=='success' and o['verification_state']=='success' and o.get('native_key_bound')
            and o.get('native_attempts',0)>0 and not o.get('manual_activation') and not str(o.get('owner') or '').startswith('pulse-')):
            j={'id':native_notice_id(o['order_id']),'platform':'gptishka','order_id':o['order_id']}
            notice(a,j,'completed','✅ Подписка активирована автоматически штатным ключом для типа аккаунта клиента. Оплату Zovo повторно не запускали.')

def finance_module():
    spec=importlib.util.spec_from_file_location('reserve_finance','/opt/pulse-profit/finance_guard.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def evidence(a,j):
    if j['platform']=='gptishka':return site('evidence',j['order_id'])
    from urllib.parse import quote
    session=a._fetch_note(j['note_url']);raw=json.dumps(session,ensure_ascii=False,separators=(',',':'))
    email=str((session.get('user') or {}).get('email') or '').strip()
    if not email or email.casefold()!=str(j['email']).strip().casefold():raise ValueError('reserve_email_mismatch')
    order={'platform':j['platform'],'account_id':str(j['account_id']),'order_id':j['order_id'],'product_type':j['product_type'],
           'payment_status':'paid','paid_at':j['source_created_at'] or j['created_at'],'created_at':j['source_created_at'] or j['created_at'],
           'job_id':j['id'],'job_status':'ready','quantity':1,'email':email,'primary_route':True,'buyer_username':j['buyer_username'],
           'has_prior_dispatch':False,'has_external_fulfillment':False}
    financial={'platform':j['platform'],'order_id':j['order_id'],'title':j['title'],'quantity':1,'key_pool':'subscription_reserve','payment_verified':False}
    if j['platform']=='funpay':
        orders=a._worker_json('/accounts/'+quote(str(j['account_id']),safe='')+'/orders/?state=paid',timeout=25)
        rows=[x for x in orders if isinstance(x,dict) and str(x.get('id') or '')==j['order_id']] if isinstance(orders,list) else []
        if len(rows)!=1 or rows[0].get('status')!='paid' or rows[0].get('quantity',1)!=1:raise ValueError('reserve_payment_unverified')
        financial.update(finance_module().funpay_paid_financials(a,j))
    else:
        with sqlite3.connect('file:'+a.profit_db_path+'?mode=ro',uri=True) as c:r=c.execute("SELECT gross_revenue_rub,commission_rub,status,occurred_at FROM external_orders WHERE platform='playerok' AND order_id=?",(j['order_id'],)).fetchone()
        if not r or r[2]!='paid':raise ValueError('reserve_payment_unverified')
        financial.update(gross_rub=r[0],marketplace_commission_rub=r[1],payment_verified=True);order['paid_at']=r[3]
    if not financial.get('payment_verified'):raise ValueError('reserve_payment_unverified')
    return {'session':raw,'order':order,'financial':financial}

def assess(financial,proof):
    m=finance_module();v=m.evaluate(financial)
    if v.get('allowed') is not True:raise ValueError('reserve_finance_'+v.get('reason','unverified'))
    policy=m.load_policy();extra=Decimal(0);opening=proof.get('prior_attempt_opening_usd_minor',0)
    if type(opening) is not int or opening<0:raise ValueError('reserve_opening_cost_unknown')
    if opening:
        if policy.get('fx_hold') or not 0<=time.time()-float(policy['fx_checked_at'])<=policy.get('fx_max_age_seconds',86400):raise ValueError('reserve_fx_stale')
        extra=m.rounded(Decimal(opening)/100*Decimal(str(policy['rub_per_usdt']))/Decimal(str(policy.get('usd_per_usdt',1))))
    key_cost=Decimal(str(proof.get('aisou_key_cost_rub',v['cost_bound_rub'])))
    if not key_cost.is_finite() or key_cost<=0:raise ValueError('reserve_acquisition_cost_invalid')
    total=key_cost+extra
    if Decimal(v['profit_bound_rub'])+Decimal(v['cost_bound_rub'])-total<Decimal(str(policy.get('minimum_profit_rub',0))):raise ValueError('reserve_finance_expected_loss')
    return {**v,'prior_opening_cost_rub':str(extra),'total_cost_bound_rub':str(total)}

def encrypted(a,s):return a._fernet().encrypt(s.encode()).decode()
def decrypted(a,s):return a._fernet().decrypt(s.encode()).decode()

def available(a,j,pool):
    if j['platform']=='gptishka':
        # Only inspect stock; allocation remains in the native website admin.
        return bool(site('available',j['order_id'],pool=pool).get('available'))
    with a.connect() as c:return bool(c.execute("SELECT 1 FROM codex_keys WHERE pool=? AND status='available' LIMIT 1",(pool,)).fetchone())

def bind(a,j,r):
    if j['platform']=='gptishka':
        k=site('reserve',j['order_id'])
        if k.get('empty'):return False
        from aisou_stock import subscription_cost
        cost_proof=subscription_cost(j,k['key_id'],json.loads(r['proof']))
        update(a,j['id'],key_id=k['key_id'],encrypted_key=encrypted(a,k['key']),proof=json.dumps(cost_proof),state='validating');return True
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        prior=c.execute('SELECT key_id FROM subscription_reserve_attempts WHERE job_id=?',(j['id'],)).fetchone()
        if prior['key_id']:return True
        k=c.execute("SELECT * FROM codex_keys WHERE pool=? AND status='available' ORDER BY id LIMIT 1",(r['pool'],)).fetchone()
        if not k:return False
        if c.execute("UPDATE codex_keys SET status='reserved',reserved_job_id=? WHERE id=? AND status='available'",(j['id'],k['id'])).rowcount!=1:return False
        c.execute("UPDATE subscription_reserve_attempts SET key_id=?,encrypted_key=?,state='validating' WHERE job_id=?",(str(k['id']),k['encrypted_key'],j['id']))
        c.execute('UPDATE codex_jobs SET key_id=? WHERE id=?',(k['id'],j['id']))
    return True

def verify(v,value,kind,provider):
    if v.get('success') is not True or not v.get('sid') or v.get('can_submit') is False:raise ValueError('reserve_key_rejected')
    expected=PRODUCTS.get(kind)
    names={'plus':'plus','go':'go','pro5x':'pro_5x','pro_5x':'pro_5x','pro20x':'pro_20x','pro_20x':'pro_20x','pro25x':'pro_50x','pro_25x':'pro_50x','pro50x':'pro_50x','pro_50x':'pro_50x'}
    if provider=='aiee':
        actual=names.get(v.get('plan_type'))
        if actual!=expected or int(v.get('require_cookie') or 0)!=0:raise ValueError('reserve_key_type_mismatch')
    else:
        raw=str(v.get('type') or '').removesuffix('_month')
        if names.get(raw)!=expected:raise ValueError('reserve_key_type_unverified')
    return str(v['sid'])

def unused(v):
    return v.get('success') is True and str(v.get('status') or '').lower() in ('active','available','unused') and not v.get('recharge_status') and not v.get('order_id')

def completed(v,expected):
    oid=str(v.get('order_id') or '')
    return v.get('success') is True and str(v.get('recharge_status') or '').lower() in ('success','completed') and bool(oid) and (not expected or oid==expected) and not v.get('previous_failed')

def finish(a,j,r,v):
    from codex_automation import utc_now
    oid=str(v['order_id']);update(a,j['id'],provider_order_id=oid)
    if j['platform']=='gptishka':
        d={'order_id':j['order_id'],'key_id':r['key_id'],'provider_order_id':oid,'provider_status':'success','cost':json.loads(r['cost_proof']),'verified_at':time.time()}
        p=ROOT/'data/subscription-reserve-receipts';p.mkdir(mode=0o700,exist_ok=True);tmp=p/(j['order_id']+'.next');tmp.write_text(json.dumps(d));tmp.chmod(0o600);tmp.replace(p/(j['order_id']+'.json'))
        site('complete',j['order_id'])
    cost=json.loads(r['cost_proof']);account='site' if j['platform']=='gptishka' else str(j['account_id'])
    # Keep the prepaid-key cost plus already incurred opening fees visible in profit.
    with sqlite3.connect('/opt/pulse-profit/data/profit.db',timeout=15) as c:
        c.execute('INSERT INTO order_cost_overrides(account_id,order_id,cost_rub,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,order_id) DO UPDATE SET cost_rub=excluded.cost_rub,updated_at=excluded.updated_at',(account,j['order_id'],float(cost['total_cost_bound_rub']),utc_now()))
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute("UPDATE codex_jobs SET status='success',key_pool=?,aiee_order_id=?,error='',finished_at=coalesce(finished_at,?),updated_at=?,auto_submit_allowed=0,finalization_blocked=?,platform_completed_at=CASE WHEN platform='gptishka' THEN ? ELSE platform_completed_at END WHERE id=? AND status NOT IN ('manual_completed')",(r['pool'],oid,utc_now(),utc_now(),1 if j['platform']=='gptishka' else 0,utc_now(),j['id']))
        if j['platform']!='gptishka':c.execute("UPDATE codex_keys SET status='used',used_at=coalesce(used_at,?) WHERE id=? AND reserved_job_id=?",(utc_now(),int(r['key_id']),j['id']))
        c.execute("UPDATE subscription_reserve_attempts SET state='completed',provider_order_id=?,updated_at=? WHERE job_id=?",(oid,time.time(),j['id']))
        a._log(c,j['id'],'info','subscription_reserve_completed','Provider confirmed success for exclusively bound prepaid key; primary Zovo source remains sealed')
    notice(a,j,'completed','✅ Подписка активирована автоматически через резервный ключ. Повторная оплата Zovo заблокирована.')

def process(a,j,r):
    from zovocard_pulse_bridge import remote,job_source
    from codex_automation import utc_now
    if j['status'] in ('success','manual_completed','paused') and not r['dispatched']:return
    raw=decrypted(a,r['encrypted_session'])
    if r['state']=='attesting':
        fresh=evidence(a,j)
        if fresh['session']!=raw:raise ValueError('reserve_session_changed')
        assess(fresh['financial'],{})
        attested=remote({'action':'subscription_fallback_claim','source_id':job_source(j),'order':fresh['order'],'session':raw})
        proof=attested.get('result') or {}
        if not attested.get('ok') or proof.get('state')!='fallback_sealed' or proof.get('session_hash')!=digest(raw):raise ValueError('reserve_primary_'+str(attested.get('reason') or 'unresolved'))
        cost=assess(fresh['financial'],proof)
        with a.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute("UPDATE subscription_reserve_attempts SET proof=?,cost_proof=?,state='sealed' WHERE job_id=?",(json.dumps(proof),json.dumps(cost),j['id']))
            c.execute("UPDATE codex_jobs SET key_pool=?,status='manual_action',auto_submit_allowed=0,finalization_blocked=1,error='Переход на резервный ключ после проверки отсутствия списания Zovo',updated_at=? WHERE id=? AND status='manual_action'",('subscription_reserve_'+r['pool'],utc_now(),j['id']))
            a._log(c,j['id'],'info','subscription_reserve_sealed','One-way primary seal and zero-charge proof recorded; normal server timer owns fallback, no manual start')
        return
    if r['state']=='sealed':
        if not bind(a,j,r):
            from aisou_stock import subscription
            if subscription(a,j,r):return
            notice(a,j,'empty','⚠️ В резерве нет ключа нужного тарифа и типа аккаунта. Повторная оплата остановлена.');return
        notice(a,j,'started','⏳ Zovo не выполнил оплату. Автоматика использует резервный ключ, выбранный по тарифу и planType.');return
    if json.loads(r['proof']).get('aisou_key_id') and str(json.loads(r['proof'])['aisou_key_id'])!=str(r['key_id']):raise ValueError('reserve_acquisition_key_mismatch')
    value=decrypted(a,r['encrypted_key']);url=a._provider_url(r['provider'])
    if not r['dispatched']:
        fresh=evidence(a,j)
        if fresh['session']!=raw:raise ValueError('reserve_session_changed')
        cost=assess(fresh['financial'],json.loads(r['proof']))
        if select_pool(j['product_type'],json.loads(raw).get('account',{}).get('planType'))!=r['pool']:raise ValueError('reserve_plan_changed')
        q={'action':'query_code','cdk':value}
        if r['provider']=='vip':q.update(polling=1,silent_log=1)
        if not unused(a._post_json(url,q,timeout=30)):raise ValueError('reserve_key_not_unused')
        v=a._post_json(url,{'action':'verify_code','cdk':value},timeout=30);sid=verify(v,value,j['product_type'],r['provider'])
        if r['provider']=='aiee':
            checked=a._post_json(url,{'action':'validate_token','cdk':value,'sid':sid,'json_token':raw,'chatgpt_cookie':''},timeout=60)
            if checked.get('success') is not True:raise ValueError('reserve_session_rejected')
        # Re-check payment and pause state immediately before the single dispatch.
        fresh=evidence(a,j)
        if fresh['session']!=raw:raise ValueError('reserve_session_changed')
        cost=assess(fresh['financial'],json.loads(r['proof']))
        with a.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            current=c.execute('SELECT status,key_pool FROM codex_jobs WHERE id=?',(j['id'],)).fetchone()
            if current['status']!='manual_action' or current['key_pool']!='subscription_reserve_'+r['pool']:return
            if c.execute("UPDATE subscription_reserve_attempts SET dispatched=1,state='uncertain',cost_proof=?,updated_at=? WHERE job_id=? AND dispatched=0",(json.dumps(cost),time.time(),j['id'])).rowcount!=1:return
            a._log(c,j['id'],'info','subscription_reserve_dispatch','Single prepaid-key submission claimed durably before network call; timeout permits polling only')
        payload={'action':'submit_recharge','cdk':value,'sid':sid,'json_token':raw}
        if r['provider']=='vip':payload.update(force_overwrite=True,confirm_overwrite=True)
        else:payload.update(chatgpt_cookie='',customer_notify_email='')
        try:
            result=a._post_json(url,payload,timeout=150 if r['provider']=='vip' else 90)
            update(a,j['id'],provider_order_id=str(result.get('order_id') or ''),state='processing',next_at=time.time()+20)
        except Exception:update(a,j['id'],state='uncertain',reason='reserve_submit_unconfirmed',next_at=time.time()+30)
        return
    # No state after this point may invoke submit_recharge, allocate another key, or Zovo.
    q={'action':'query_code','cdk':value}
    if r['provider']=='vip':q.update(polling=1,silent_log=1)
    v=a._post_json(url,q,timeout=30)
    oid=str(v.get('order_id') or '')
    if oid and r['provider_order_id'] and oid!=r['provider_order_id']:raise ValueError('reserve_order_mismatch')
    if completed(v,r['provider_order_id']):finish(a,j,r,v);return
    if oid and not r['provider_order_id']:update(a,j['id'],provider_order_id=oid)
    if v.get('success') is True and (v.get('previous_failed') or str(v.get('recharge_status') or '').lower()=='failed'):
        update(a,j['id'],state='review',reason='reserve_provider_failed')
        notice(a,j,'failed','⚠️ Резервный канал сообщил об ошибке. Требуется проверка; повторная активация и списание заблокированы.')
    else:update(a,j['id'],next_at=time.time()+30)

def run(dry=False):
    from site_credit250 import automation
    a=automation();a.connection_token=os.environ.get('CONNECTION_TOKEN','')
    cfg=json.loads((ROOT/'data/subscription-reserve.json').read_text())
    if not cfg.get('enabled'):return {'enabled':False}
    init(a)
    with a.connect() as c:jobs=c.execute("SELECT * FROM codex_jobs WHERE status='manual_action' AND product_type LIKE 'chatgpt_%' ORDER BY id DESC LIMIT 100").fetchall()
    jobs=[current for j in jobs if (current:=current_candidate(a,j['id'],cfg)) is not None]
    if dry:return {'eligible':len(jobs),'dry_run':True}
    waiting={j['id'] for j in jobs if funds_wait(a,j,cfg,time.time())}
    jobs=[j for j in jobs if eligible(j,cfg,time.time()) and j['id'] not in waiting]
    for j in jobs[:5]:
        try:
            j=current_candidate(a,j['id'],cfg)
            if j is None:continue
            with a.connect() as c:
                if c.execute('SELECT 1 FROM subscription_reserve_attempts WHERE job_id=?',(j['id'],)).fetchone():continue
                if not c.execute("SELECT 1 FROM codex_logs WHERE job_id=? AND (event LIKE 'zovocard%review' OR event LIKE 'zovocard%failed')",(j['id'],)).fetchone():continue
            fresh=evidence(a,j);raw=fresh['session'];pool=select_pool(j['product_type'],json.loads(raw).get('account',{}).get('planType'))
            from aisou_stock import enabled as supply_enabled
            if not available(a,j,pool) and not supply_enabled(j):notice(a,j,'empty','⚠️ Нет резервного ключа нужного тарифа и типа аккаунта. Другой ключ не подставляли.');continue
            assess(fresh['financial'],{})
            if current_candidate(a,j['id'],cfg) is None:continue
            with a.connect() as c:c.execute("INSERT OR IGNORE INTO subscription_reserve_attempts(job_id,order_id,platform,pool,provider,state,encrypted_session,created_at,updated_at) SELECT ?,?,?,?,?,'attesting',?,?,? WHERE EXISTS(SELECT 1 FROM codex_jobs WHERE id=? AND status='manual_action' AND key_pool=? AND key_id IS NULL AND coalesce(aiee_order_id,'')='')",(j['id'],j['order_id'],j['platform'],pool,('vip' if pool.endswith('_active') else 'aiee'),encrypted(a,raw),time.time(),time.time(),j['id'],j['key_pool']))
        except Exception as e:
            # The primary worker may have advanced while RPC evidence was read.
            if j is None or current_candidate(a,j['id'],cfg) is None:continue
            reason=str(e) if isinstance(e,ValueError) and str(e).startswith(('reserve_','supplier_')) else 'reserve_evidence_unavailable'
            notice(a,j,'blocked:'+reason,'⚠️ Автоматический резерв ожидает проверки: '+reason+'. Повторную оплату не запускали.')
    with a.connect() as c:rows=c.execute("SELECT * FROM subscription_reserve_attempts WHERE state NOT IN ('completed','review') AND next_at<=? ORDER BY job_id LIMIT 5",(time.time(),)).fetchall()
    for r in rows:
        if r['job_id'] in waiting and not r['proof'] and not r['dispatched']:continue
        if r['state']=='attesting' and current_candidate(a,r['job_id'],cfg) is None:continue
        with a.connect() as c:j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(r['job_id'],)).fetchone()
        try:process(a,j,r)
        except Exception as e:
            reason=str(e) if isinstance(e,ValueError) and str(e).startswith(('reserve_','supplier_')) else 'reserve_processing_unavailable'
            update(a,j['id'],next_at=time.time()+60,reason=reason)
            if reason!=r['reason']:
                with a.connect() as c:a._log(c,j['id'],'warning','subscription_reserve_wait',reason)
                if reason!='supplier_balance_insufficient':notice(a,j,'wait:'+reason,'⚠️ Резерв ожидает безопасного подтверждения: '+reason+'. Повторная оплата заблокирована.')
    try:notify_native_completions(a,cfg)
    except Exception:pass  # Website unavailability must not block marketplace notices.
    send_notices(a)
    return {'candidates':len(jobs),'checked':len(rows)}

if __name__=='__main__':
    import sys
    try:
        with open(ROOT/'data/subscription-reserve.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);print(json.dumps(run('--dry-run' in sys.argv)))
    except BlockingIOError:print(json.dumps({'busy':True}))
    except Exception:print(json.dumps({'error':'subscription_reserve_unavailable'}));sys.exit(1)
