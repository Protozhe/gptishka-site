"""Prepaid website credit reserve. One durable submit; uncertain results only poll."""
import json,time,base64,subprocess,fcntl
from pathlib import Path
from decimal import Decimal

ROOT=Path('/opt/pulse-web');URL='https://aiee.fun/api/auth.php'
BLOCKED={'expected_loss','fee_unknown','finance_data_unverified','fx_stale','full_session_required','gpt_session_expired'}

def eligible(job,cfg,reviews,reason,now):
    from zovocard_pulse_bridge import _time
    return (cfg.get('enabled') is True and job['platform']=='gptishka' and job['account_id']=='site'
        and job['package'] in (250,500,1000) and job['key_pool']==f"zovocard_codex_{job['package']}_direct"
        and job['status']=='manual_action' and not job['key_id'] and not job['aiee_order_id']
        and _time(job['source_created_at'])>=_time(cfg['enabled_after'])
        and now-_time(job['created_at'])>=cfg.get('minimum_wait_seconds',300)
        and reviews>=cfg.get('minimum_primary_reviews',3) and reason not in BLOCKED)

def unused(v):
    return (v.get('success') is True and str(v.get('status') or '').lower() in ('active','available','unused')
        and not v.get('recharge_status') and not v.get('order_id'))

def completed(v,expected):
    oid=str(v.get('order_id') or '')
    return (v.get('success') is True and str(v.get('recharge_status') or '').lower() in ('success','completed')
        and bool(oid) and (not expected or oid==expected) and not v.get('previous_failed'))

def init(a):
    import site_aiee_costs
    site_aiee_costs.init(a)
    with a.connect() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS site_aiee_attempts(
            job_id INTEGER PRIMARY KEY,order_id TEXT UNIQUE NOT NULL,package INTEGER NOT NULL,key_id INTEGER UNIQUE NOT NULL,
            state TEXT NOT NULL,encrypted_session TEXT,encrypted_sid TEXT,before_balance TEXT,provider_order_id TEXT,
            dispatched INTEGER NOT NULL DEFAULT 0,next_at REAL NOT NULL DEFAULT 0,created_at REAL,updated_at REAL,reason TEXT)''')
        c.execute('CREATE TABLE IF NOT EXISTS site_aiee_notices(event_id TEXT PRIMARY KEY,message TEXT,state TEXT,updated_at REAL)')
        c.execute('CREATE TABLE IF NOT EXISTS site_aiee_primary_proofs(job_id INTEGER PRIMARY KEY,payload TEXT NOT NULL,verified_at REAL NOT NULL)')

def notice(a,event_id,message):
    with a.connect() as c:
        added=c.execute("INSERT OR IGNORE INTO site_aiee_notices VALUES(?,?,'pending',?)",(event_id,message,time.time()))
        if added.rowcount!=1:return

def send_notices(a):
    from funpay_telegram_fallback import send_site_admin_notification
    with a.connect() as c:rows=c.execute("SELECT * FROM site_aiee_notices WHERE state='pending' LIMIT 3").fetchall()
    for row in rows:
        with a.connect() as c:
            changed=c.execute("UPDATE site_aiee_notices SET state='sending',updated_at=? WHERE event_id=? AND state='pending'",(time.time(),row['event_id']))
            if changed.rowcount!=1:continue
        try:send_site_admin_notification(row['message']);state='sent'
        except Exception:state='uncertain'
        with a.connect() as c:c.execute('UPDATE site_aiee_notices SET state=?,updated_at=? WHERE event_id=?',(state,time.time(),row['event_id']))

def update(a,jid,**fields):
    assert set(fields)<=set('state encrypted_session encrypted_sid before_balance provider_order_id dispatched next_at updated_at reason'.split())
    fields['updated_at']=time.time()
    with a.connect() as c:c.execute('UPDATE site_aiee_attempts SET '+','.join(k+'=?' for k in fields)+' WHERE job_id=?',(*fields.values(),jid))

def view(action,oid):
    r=subprocess.run(['node',str(ROOT/'site_aiee_access.cjs')],input=json.dumps({'action':action,'order_id':oid}),text=True,capture_output=True,timeout=45)
    d=json.loads(r.stdout)
    if r.returncode or d.get('error'):raise ValueError('fallback_site_update_failed')
    return d

def usage(raw):
    from zovocard_pulse_bridge import remote
    r=remote({'action':'credit_usage','session':raw})
    d=r.get('result') or {}
    if not r.get('ok') or d.get('http')!=200:raise ValueError('fallback_usage_unavailable')
    if d.get('plan_type') not in ('plus','pro','prolite','promax','pro_5x','pro_20x','pro_50x'):raise ValueError('fallback_paid_plan_required')
    amount=Decimal(str(d['balance']))
    if not amount.is_finite() or amount<0:raise ValueError('fallback_balance_invalid')
    return amount

def reserve(a,job,module=None):
    if module is not None:
        from aisou_stock import codex
        try:codex(a,job,module)
        except Exception as error:
            if str(error)=='supplier_balance_insufficient':return  # Website owns the timed funds notice.
            reason=str(error) if str(error).startswith('supplier_') and str(error).replace('_','').isalnum() else 'supplier_requires_review'
            notice(a,'supplier:'+str(job['id'])+':'+reason,f"⚠️ Закупка ключа AISOU\n\nЗаказ: {job['order_id']}\nСтатус: требуется проверка\nПричина: {reason}\n\nПовторная покупка при неподтверждённом результате заблокирована.")
            return
    now=time.time();pool=f"aiee_site_reserve_{job['package']}"
    from codex_primary_route import aiee_primary
    pools=(pool,f"codex_{job['package']}") if aiee_primary(job['package']) else (pool,pool)
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if c.execute('SELECT 1 FROM site_aiee_attempts WHERE job_id=?',(job['id'],)).fetchone():return
        key=c.execute("SELECT k.id FROM codex_keys k JOIN site_aiee_key_costs cost ON cost.key_id=k.id AND cost.package=k.package WHERE k.pool IN (?,?) AND k.package=? AND k.status='available' ORDER BY k.id LIMIT 1",(*pools,job['package'])).fetchone()
        if not key:
            if not c.execute("SELECT 1 FROM codex_logs WHERE job_id=? AND event='aiee_reserve_empty'",(job['id'],)).fetchone():a._log(c,job['id'],'warning','aiee_reserve_empty','Matching prepaid reserve pool empty; no new purchase or dispatch')
            c.execute("INSERT OR IGNORE INTO site_aiee_notices VALUES(?,?,'pending',?)",('empty:'+str(job['id']),f"⚠️ GPTishka · Codex {job['package']}\nЗаказ {job['order_id']}: ключей AIEE нужного тарифа нет. Добавьте ключ в админке. Новых покупок и повторной оплаты не запускали.",now))
            return
        changed=c.execute("UPDATE codex_keys SET status='reserved',reserved_job_id=? WHERE id=? AND status='available'",(job['id'],key['id']))
        if changed.rowcount!=1:return
        c.execute('INSERT INTO site_aiee_attempts(job_id,order_id,package,key_id,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',(job['id'],job['order_id'],job['package'],key['id'],'attesting',now,now))

def finalize(a,r,v,raw):
    from site_aiee_costs import frozen,account
    balance=usage(raw)
    if balance<Decimal(r['before_balance'])+r['package']:raise ValueError('fallback_credit_delta_unverified')
    receipt={'order_id':r['order_id'],'job_id':r['job_id'],'package':r['package'],'key_id':r['key_id'],
        'provider':'aiee.fun','provider_order_id':str(v['order_id']),'provider_status':'success',
        'before_balance':r['before_balance'],'after_balance':str(balance),'verified_at':time.time(),'prepaid_key_cost_unknown':False}
    receipt['actual_cost']=frozen(a,r)
    with a.connect() as c:proof=c.execute('SELECT payload FROM site_aiee_primary_proofs WHERE job_id=?',(r['job_id'],)).fetchone()
    if not proof:raise ValueError('fallback_primary_proof_missing')
    receipt['primary_no_payment_proof']=json.loads(proof['payload'])
    p=ROOT/'data/aiee-site-receipts';p.mkdir(mode=0o700,exist_ok=True);tmp=p/(r['order_id']+'.next');tmp.write_text(json.dumps(receipt));tmp.chmod(0o600);tmp.replace(p/(r['order_id']+'.json'))
    account(r['order_id'],receipt['actual_cost'])
    view('complete',r['order_id'])
    from codex_automation import utc_now
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute("UPDATE codex_jobs SET status='success',key_pool=?,error='',finished_at=coalesce(finished_at,?),updated_at=?,platform_completed_at=?,auto_submit_allowed=0,finalization_blocked=1 WHERE id=?",(f"aiee_site_reserve_{r['package']}",utc_now(),utc_now(),utc_now(),r['job_id']))
        c.execute("UPDATE codex_keys SET status='used',used_at=coalesce(used_at,?) WHERE id=? AND reserved_job_id=?",(utc_now(),r['key_id'],r['job_id']))
        c.execute("UPDATE site_aiee_attempts SET state='completed',updated_at=? WHERE job_id=?",(time.time(),r['job_id']))
        a._log(c,r['job_id'],'info','aiee_reserve_completed','AIEE final success and independent OpenAI credit delta confirmed; paid website order completed; no Zovo replay')

def process(module,a,r):
    from zovocard_pulse_bridge import remote
    from site_aiee_costs import assess
    jid=r['job_id'];oid=r['order_id'];package=r['package']
    with a.connect() as c:
        job=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        key=c.execute('SELECT * FROM codex_keys WHERE id=?',(r['key_id'],)).fetchone()
    if job['status'] in ('success','manual_completed') and not r['dispatched']:
        with a.connect() as c:
            c.execute("UPDATE codex_keys SET status='available',reserved_job_id=NULL WHERE id=? AND status='reserved' AND reserved_job_id=?",(r['key_id'],jid))
        update(a,jid,state='cancelled');return
    if job['status'] in ('paused','failed') and not r['dispatched']:return
    if key['reserved_job_id']!=jid or key['pool'] not in (f'aiee_site_reserve_{package}',f'codex_{package}'):raise ValueError('fallback_key_binding_invalid')
    value=a._fernet().decrypt(key['encrypted_key'].encode()).decode()
    if r['state']=='attesting':
        fresh=module.site('evidence',oid);finance=module.finance(fresh)
        assess(a,r,finance,{'prior_attempt_opening_usd_minor':0})
        raw=fresh['session'];s=json.loads(raw)
        if str(s['user']['email']).casefold()!=str(job['email']).casefold():raise ValueError('fallback_email_mismatch')
        baseline=usage(raw)
        if not unused(a._post_json(URL,{'action':'query_code','cdk':value},timeout=25)):raise ValueError('fallback_key_not_unused')
        attested=remote({'action':f'credit{package}_fallback_claim','source_id':'gptishka:site:'+oid,'order':fresh['order']})
        if not attested.get('ok') or (attested.get('result') or {}).get('state')!='fallback_sealed':
            update(a,jid,reason='primary_not_safely_reconciled',next_at=time.time()+60);return
        from codex_automation import utc_now
        with a.connect() as c:
            c.execute('INSERT INTO site_aiee_primary_proofs VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET payload=excluded.payload,verified_at=excluded.verified_at',(jid,json.dumps(attested['result']),time.time()))
            c.execute("UPDATE codex_jobs SET status='manual_action',key_pool=?,auto_submit_allowed=0,finalization_blocked=1,updated_at=? WHERE id=? AND status<>'success'",(f'aiee_site_reserve_{package}',utc_now(),jid))
            a._log(c,jid,'warning','aiee_reserve_claimed','Primary Zovo source durably sealed after zero-payment attestation; prepaid reserve key bound exclusively to order')
        update(a,jid,state='validating',encrypted_session=a._fernet().encrypt(raw.encode()).decode(),before_balance=str(baseline))
        with a.connect() as c:remaining=c.execute("SELECT COUNT(*) FROM codex_keys WHERE pool=? AND status='available'",(f'aiee_site_reserve_{package}',)).fetchone()[0]
        notice(a,'reserve:'+str(jid),f'⚠️ GPTishka · резерв Codex {package}\nЗаказ {oid} передан в резервный канал после сверки ZovoCard. Доступных резервных ключей этого тарифа осталось: {remaining}. Канал пополнения — AIEE; ZovoCard сохранён отдельно.')
        view('progress',oid);return
    raw=a._fernet().decrypt(r['encrypted_session'].encode()).decode()
    if not r['dispatched']:
        fresh=module.site('evidence',oid);finance=module.finance(fresh);assess(a,r,finance)
        old=json.loads(raw);new=json.loads(fresh['session'])
        if new['user']['email'].casefold()!=old['user']['email'].casefold() or new['account']['id']!=old['account']['id']:raise ValueError('fallback_customer_changed')
        raw=fresh['session'];update(a,jid,encrypted_session=a._fernet().encrypt(raw.encode()).decode(),before_balance=str(usage(raw)))
        if not unused(a._post_json(URL,{'action':'query_code','cdk':value},timeout=25)):raise ValueError('fallback_key_not_unused')
        v=a._post_json(URL,{'action':'verify_code','cdk':value},timeout=25)
        if v.get('success') is not True or v.get('plan_type')!=f'codex{package}' or int(v.get('require_cookie') or 0)!=0 or not v.get('sid'):raise ValueError('fallback_package_unverified')
        sid=str(v['sid']);v=a._post_json(URL,{'action':'validate_token','cdk':value,'sid':sid,'json_token':raw,'chatgpt_cookie':''},timeout=60)
        if v.get('success') is not True:raise ValueError('fallback_session_rejected')
        # Refresh only the paid-order evidence; the stored session remains the one validated.
        fresh=module.site('evidence',oid);finance=module.finance(fresh);cost=assess(a,r,finance)
        if fresh['session']!=raw:raise ValueError('fallback_session_changed_revalidate')
        with a.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            changed=c.execute("UPDATE site_aiee_attempts SET state='uncertain',dispatched=1,encrypted_sid=?,updated_at=? WHERE job_id=? AND dispatched=0",(a._fernet().encrypt(sid.encode()).decode(),time.time(),jid))
            if changed.rowcount!=1:return
            c.execute('INSERT INTO site_aiee_cost_proofs VALUES(?,?,?)',(jid,json.dumps(cost),time.time()))
        try:
            result=a._post_json(URL,{'action':'submit_recharge','cdk':value,'sid':sid,'json_token':raw,'chatgpt_cookie':'','customer_notify_email':''},timeout=90)
            update(a,jid,state='processing',provider_order_id=str(result.get('order_id') or ''),next_at=time.time()+20)
        except Exception:update(a,jid,state='uncertain',reason='submit_result_unconfirmed',next_at=time.time()+30)
        return
    v=a._post_json(URL,{'action':'query_code','cdk':value},timeout=30)
    if completed(v,r['provider_order_id']):finalize(a,r,v,raw);return
    returned=str(v.get('order_id') or '')
    if returned and r['provider_order_id'] and returned!=r['provider_order_id']:raise ValueError('fallback_provider_identity_mismatch')
    if returned and not r['provider_order_id']:update(a,jid,provider_order_id=returned)
    if v.get('success') and (str(v.get('recharge_status') or '').lower()=='failed' or v.get('previous_failed')):
        update(a,jid,state='review',reason='provider_failed');view('review',oid)
    else:update(a,jid,next_at=time.time()+30)

def tick(module,a,package):
    cfg=json.loads((ROOT/'data/aiee-site-reserve.json').read_text())
    if not cfg.get('enabled'):return {'enabled':False}
    try:
        lock=open(ROOT/'data/aiee-site-reserve.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:return {'busy':True}
    try:
        init(a)
        with a.connect() as c:jobs=c.execute("SELECT * FROM codex_jobs WHERE platform='gptishka' AND account_id='site' AND package=? AND key_pool=? AND status='manual_action' ORDER BY id LIMIT 10",(package,f'zovocard_codex_{package}_direct')).fetchall()
        for j in jobs:
            with a.connect() as c:
                logs=c.execute('SELECT detail FROM codex_logs WHERE job_id=? AND event=? ORDER BY id DESC',(j['id'],f'zovocard_site{package}_review')).fetchall()
            if eligible(j,cfg,len(logs),logs[0]['detail'] if logs else '',time.time()):reserve(a,j,module)
        with a.connect() as c:attempts=c.execute("SELECT * FROM site_aiee_attempts WHERE package=? AND state NOT IN ('completed','review','cancelled') AND next_at<=? ORDER BY job_id LIMIT 2",(package,time.time())).fetchall()
        for r in attempts:
            try:process(module,a,r)
            except Exception as e:
                # Before dispatch: retry validation only. After dispatch: poll only.
                reason=str(e) if isinstance(e,ValueError) and str(e).startswith('fallback_') else type(e).__name__
                update(a,r['job_id'],next_at=time.time()+60,reason=reason)
                with a.connect() as c:
                    prior=c.execute("SELECT detail FROM codex_logs WHERE job_id=? AND event='aiee_reserve_wait' ORDER BY id DESC LIMIT 1",(r['job_id'],)).fetchone()
                    if not prior or prior['detail']!=reason:a._log(c,r['job_id'],'warning','aiee_reserve_wait',reason)
        send_notices(a)
        return {'checked':len(attempts)}
    finally:lock.close()
