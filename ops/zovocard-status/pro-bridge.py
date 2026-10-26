"""Pulse integration for the restricted Frankfurt worker.

Only new paid FunPay orders in the configured lot are routed. First direct
dispatch remains manual; validation never falls back to AIEE after routing.
"""
import json
import sqlite3
import subprocess
import time
from datetime import datetime
from pathlib import Path
from zovocard_pro5x_scope import primary,primary_source,legacy_blocked

CONFIG = Path('/opt/pulse-web/data/zovocard-pro5x.json')
POOL = 'zovocard_pro5x_direct'
_next_note_sync = 0
REASONS = {
    'card_product_not_allowed':'Тип карты не разрешён для GPT; выберите универсальную XL537872.',
    'card_activity_unverified':'Не удалось подтвердить историю или остатки карты; пополнение и оплата не отправлены.',
    'client_payment_requires_review':'Недавний отказ оплаты на аккаунте клиента. Требуется ручная проверка; повторная оплата остановлена.',
    'key_budget_exhausted':'Достигнут согласованный накопительный лимит. Требуется согласовать новый лимит; деньги не списывались.',
    'pool_waiting_for_card':'Ожидает свободную карту: лимит 5 оплат за всё время и 1 оплата в сутки (МСК).',
    'funding_requires_reconciliation':'Пополнение отправлено, результат требует сверки. Повторное пополнение и оплата заблокированы.',
    'funding_over_limit':'Минимум пополнения карты превышает согласованный лимит.',
    'funding_fee_unverified':'Не подтверждено пополнение без дополнительной комиссии.',
    'wallet_insufficient':'Недостаточно доступных средств ZovoCard.',
    'card_needs_manual_funding':'Недостаточно средств на карте. После пополнения нажмите «Повторить».',
    'card_capacity_unavailable':'Карта занята, находится на охлаждении или исчерпала лимит использований.',
    'quote_missing_or_over_limit':'Не удалось подтвердить цену в пределах установленного лимита.',
    'service_fee_limit':'Комиссия поставщика превышает установленный лимит.',
    'account_not_free':'На аккаунте уже есть подписка либо требуется восстановление. Нужна ручная проверка.',
    'activation_done_renewal_unverified':'Pro 5× активирован; отключение автопродления ещё не подтверждено. Активацию не повторять.',
    'worker_connection_uncertain':'Ответ обработчика не подтверждён. Проверьте исходную заявку; активацию не повторять.',
    'dispatch_requires_reconciliation':'Результат отправки не подтверждён. Нужна сверка исходной заявки.',
    'order_id_unknown_manual_reconciliation':'Требуется ручная сверка заявки поставщика. Повторная оплата заблокирована.',
}


def explanation(reason):
    return REASONS.get(reason, 'Требуется проверка заявки ZovoCard; повторная оплата заблокирована.')


def config():
    try:
        return json.loads(CONFIG.read_text())
    except Exception:
        return {'enabled': False,'configuration_unavailable':True}


def _time(value):
    d = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if d.tzinfo is None:
        raise ValueError('Timezone required')
    return d.timestamp()


def remote(request):
    command = ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
               '-o', 'UserKnownHostsFile=/etc/gptishka-pulse/known_hosts',
               '-o', 'ConnectTimeout=10', '-i', '/etc/gptishka-pulse/zovocard_ed25519',
               'pulse-zovocard@91.108.242.137']
    if __import__('os').geteuid()==0:
        command=['runuser','-u','gptishka-pulse','--']+command
    try:
        result = subprocess.run(command, input=json.dumps(request).encode(),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
        if result.returncode or len(result.stdout) > 65536:
            raise ValueError()
        data = json.loads(result.stdout)
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except Exception:
        return {'ok': False, 'reason': 'worker_connection_uncertain'}


def job_source(job):
    account=str(job['account_id'])
    return (account if job['platform']=='playerok' else job['platform']+':'+account)+':'+job['order_id']

def guard_legacy_submit(automation,job):
    if not job or job['key_pool']==POOL or not legacy_blocked(job,config()):return
    from codex_automation import utc_now
    detail='ZovoCard — основной маршрут Pro 5×. Запуск старого CDK/AIEE заблокирован; требуется проверка задания.'
    with automation.connect() as c:
        changed=c.execute("UPDATE codex_jobs SET status='manual_action',error=?,updated_at=? WHERE id=? AND status IN ('ready','failed','manual_action')",(detail,utc_now(),job['id']))
        if changed.rowcount:automation._log(c,job['id'],'warning','legacy_provider_blocked',detail)
    raise ValueError(detail)

def primary_payment(automation,job,policy):
    if policy.get('enabled') is not True or job['key_id'] or job['aiee_order_id']:return None
    with automation.connect() as c:
        prior=c.execute("SELECT 1 FROM codex_logs WHERE job_id=? AND event IN ('submitted','submit_uncertain','submit_pending_confirmation','zovocard_direct_dispatch') LIMIT 1",(job['id'],)).fetchone()
        external=c.execute('SELECT 1 FROM codex_external_fulfillments WHERE job_id=?',(job['id'],)).fetchone()
    if prior or external:return None
    evidence={'platform':job['platform'],'account_id':str(job['account_id']),'order_id':job['order_id'],
        'job_id':job['id'],'job_status':'waiting_data','product_type':'chatgpt_pro_5x','primary_route':True,
        'payment_status':'paid','has_prior_dispatch':False,'has_external_fulfillment':False,
        'email':job['email'],'buyer_username':job['buyer_username'],'quantity':1,
        'paid_at':job['source_created_at'] or job['created_at']}
    if job['platform']=='funpay':
        from urllib.parse import quote
        data=automation._worker_json('/accounts/'+quote(str(job['account_id']),safe='')+'/orders/?state=paid',timeout=25)
        if not isinstance(data,list):return None
        rows=[r for r in data if isinstance(r,dict) and str(r.get('id') or '')==job['order_id']]
        if len(rows)!=1 or rows[0].get('status')!='paid':return None
        from zovocard_pro5x_scope import matches_title
        if not matches_title(rows[0].get('title')):return None
        evidence['quantity']=rows[0].get('quantity',1)
    elif job['platform']=='playerok':
        con=sqlite3.connect('file:'+automation.profit_db_path+'?mode=ro',uri=True)
        try:r=con.execute("SELECT status,occurred_at,title FROM external_orders WHERE platform='playerok' AND order_id=?",(job['order_id'],)).fetchone()
        finally:con.close()
        from zovocard_pro5x_scope import matches_title
        if not r or r[0]!='paid' or not matches_title(r[2]):return None
        evidence['paid_at']=r[1]
    else:return None
    try:primary_source(evidence,policy,time.time())
    except (ValueError,KeyError,TypeError):return None
    return evidence

def payment(automation,job):
    return primary_payment(automation,job,config()) if primary(job,config()) else None


def _detail(result):
    if result.get('ok') is not True:
        return str(result.get('reason')) if result.get('reason') in (
            'worker_connection_uncertain','disabled','region_unavailable',
            'existing_attempt_inspect_only','order_ineligible','pool_waiting_for_card','history_unverified') else 'worker_refused'
    return str((result.get('result') or {}).get('reason') or '')


def validate(automation, job_id):
    from codex_automation import utc_now
    with automation.connect() as con:
        job = con.execute('SELECT * FROM codex_jobs WHERE id=?', (job_id,)).fetchone()
    if not job or job['status'] not in ('waiting_data','failed'):
        return False
    if legacy_blocked(job,config()) and not primary(job,config()):
        with automation.connect() as c:
            conmsg='ZovoCard: старый заказ требует проверки перед сменой маршрута; CDK заблокирован'
            c.execute("UPDATE codex_jobs SET status='manual_action',error=?,updated_at=? WHERE id=? AND status IN ('waiting_data','failed')",(conmsg,utc_now(),job_id))
        return True
    if job['key_pool']==POOL and str(job['error'] or '').startswith(('ZovoCard: Ожидает свободную карту','ZovoCard: временная ошибка чтения оплаты','ZovoCard: временная ошибка чтения сессии')):
        try:
            if _time(utc_now())-_time(job['updated_at'])<60:
                return True
        except Exception:
            pass
    is_primary=primary(job,config())
    try:evidence = payment(automation, job)
    except Exception:
        if not is_primary:raise
        with automation.connect() as con:
            con.execute("UPDATE codex_jobs SET status='waiting_data',key_pool=?,error='ZovoCard: временная ошибка чтения оплаты',updated_at=? WHERE id=? AND status IN ('waiting_data','failed')",(POOL,utc_now(),job_id))
        return True
    if evidence is None:
        if is_primary:
            with automation.connect() as con:
                con.execute("UPDATE codex_jobs SET status='manual_action',key_pool=?,error='ZovoCard: оплата или маршрут не подтверждены; CDK заблокирован',updated_at=? WHERE id=? AND status IN ('waiting_data','failed')",(POOL,utc_now(),job_id))
            return True
        if job['key_pool'] == POOL:
            raise ValueError('ZovoCard: paid order eligibility requires review')
        return False
    automatic=config().get('auto_dispatch') is True and (not is_primary or bool(job['auto_submit_allowed']))
    with automation.connect() as con:
        claim = con.execute("UPDATE codex_jobs SET status='validating',key_pool=?,auto_submit_allowed=?,error='',updated_at=? WHERE id=? AND status IN ('waiting_data','failed') AND key_id IS NULL",
                            (POOL, int(automatic), utc_now(), job_id))
        if claim.rowcount != 1:
            return True
    try:
        from pulse_finance_guard import check as margin_check
        margin_check(automation,job_id)
        try:session = automation._fetch_note(job['note_url'])
        except Exception:
            if not is_primary:raise
            with automation.connect() as con:
                con.execute("UPDATE codex_jobs SET status='waiting_data',error='ZovoCard: временная ошибка чтения сессии',updated_at=? WHERE id=? AND status='validating'",(utc_now(),job_id))
            return True
        email = str((session.get('user') or {}).get('email') or '').strip()
        if not evidence['email']:
            evidence['email'] = email
        raw = json.dumps(session, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        result = remote({'action':'pro5x_prepare','order':evidence,'session':raw})
        state = (result.get('result') or {}).get('state') if result.get('ok') else None
        status = 'ready' if state == 'prepared' else 'failed' if state == 'failed_before_dispatch' else 'manual_action'
        reason = '' if status == 'ready' else _detail(result)
        if reason=='pool_waiting_for_card':
            status='waiting_data'
        with automation.connect() as con:
            con.execute('UPDATE codex_jobs SET status=?,email=?,plan_type=?,error=?,updated_at=? WHERE id=?',
                        (status, evidence['email'], 'free', 'ZovoCard: '+explanation(reason) if reason else '', utc_now(), job_id))
            automation._log(con, job_id, 'info' if status=='ready' else 'warning',
                            'zovocard_direct_prepared', 'Direct Pro 5x: '+status+' '+reason)
        if status=='ready' and automatic:
            with automation.connect() as con:
                settings=con.execute('SELECT auto_submit FROM codex_settings WHERE id=1').fetchone()
            if settings and settings[0]:
                submit(automation,job_id)
    except Exception:
        with automation.connect() as con:
            con.execute("UPDATE codex_jobs SET status='manual_action',error='ZovoCard: validation requires review',updated_at=? WHERE id=? AND status<>'manual_action'", (utc_now(), job_id))
    return True


def submit(automation, job_id):
    from codex_automation import utc_now
    with automation.connect() as con:
        job = con.execute('SELECT * FROM codex_jobs WHERE id=?', (job_id,)).fetchone()
    if not job or job['key_pool'] != POOL or job['status'] != 'ready':
        raise ValueError('ZovoCard direct job is not ready')
    from pulse_finance_guard import check as margin_check
    margin_check(automation,job_id,required=True)
    is_primary=primary(job,config())
    evidence = payment(automation, job)
    if evidence is None:
        raise ValueError('ZovoCard paid order eligibility requires review')
    if job['platform']=='playerok':
        from playerok_chat import PlayerokHTTP
        with automation.playerok_source.network_slot():deal=PlayerokHTTP().load_deal(job['order_id'])
        if deal.get('status')!='PAID' or deal.get('direction')!='OUT':raise ValueError('Playerok paid order not confirmed')
    else:
        paid_now=automation._worker_json('/accounts/'+str(job['account_id'])+'/orders/?state=paid',timeout=20)
        if not isinstance(paid_now,list) or not any(isinstance(item,dict) and str(item.get('id') or '')==job['order_id'] and item.get('status','paid')=='paid' for item in paid_now):raise ValueError('FunPay paid order not confirmed')
    evidence['job_status']='ready'
    session = automation._fetch_note(job['note_url'])
    raw = json.dumps(session, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    with automation.connect() as con:
        claimed = con.execute("UPDATE codex_jobs SET status='submitting',updated_at=? WHERE id=? AND status='ready'", (utc_now(),job_id))
        if claimed.rowcount != 1:
            raise ValueError('ZovoCard dispatch already claimed')
        automation._log(con,job_id,'info','zovocard_direct_dispatch','Direct Pro 5x dispatch claimed; no automatic repeat')
    result = remote({'action':'pro5x_submit','order':evidence,'session':raw})
    record(automation,job_id,result)
    return {'ok':result.get('ok') is True,'job_id':job_id}


def record(automation, job_id, response, *, pool=POOL):
    from codex_automation import utc_now
    data=response.get('result') if response.get('ok') is True else None
    state=data.get('state') if isinstance(data,dict) else None
    status=('success' if state=='completed' else 'ready' if state=='prepared'
            else 'failed' if state=='failed_before_dispatch'
            else 'processing' if state in ('processing','dispatching') else 'manual_action')
    reason=_detail(response)
    oid=str(data.get('provider_order_id') or '') if isinstance(data,dict) else ''
    if oid and not oid.isdigit():
        oid='';status='manual_action'
    with automation.connect() as con:
        current=con.execute('SELECT status FROM codex_jobs WHERE id=?',(job_id,)).fetchone()
        if current and current[0]=='success':
            return  # A late observation must not rewrite a settled receipt either.
        if response.get('ok') is not True and reason=='pool_waiting_for_card' and current and current[0] in ('ready','submitting','processing','manual_action'):
            return  # Gateway lock contention contains no new provider outcome.
        con.execute('''CREATE TABLE IF NOT EXISTS codex_zovocard_receipts(
            job_id INTEGER PRIMARY KEY,card_id INTEGER,card_last_four TEXT,
            provider_order_id TEXT,funding_minor INTEGER,fee_usd_minor INTEGER,
            final_amount_minor INTEGER,currency TEXT,state TEXT,updated_at TEXT)''')
        if isinstance(data,dict):
            last4=str(data.get('card_last_four') or '')
            if len(last4)!=4 or not last4.isdigit(): last4=''
            con.execute('''INSERT INTO codex_zovocard_receipts VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(job_id) DO UPDATE SET card_id=excluded.card_id,
                card_last_four=excluded.card_last_four,provider_order_id=excluded.provider_order_id,
                funding_minor=excluded.funding_minor,fee_usd_minor=excluded.fee_usd_minor,
                final_amount_minor=excluded.final_amount_minor,currency=excluded.currency,
                state=excluded.state,updated_at=excluded.updated_at''',
                (job_id,data.get('card_id'),last4,oid,data.get('funding_minor'),data.get('fee_usd'),
                 data.get('final_amount_minor'),data.get('currency'),state,utc_now()))
        if oid:
            existing=con.execute('SELECT provider_order_id FROM codex_external_fulfillments WHERE job_id=?',(job_id,)).fetchone()
            if existing and existing[0]!=oid:
                status='manual_action';reason='provider_identity_mismatch'
            else:
                con.execute('''INSERT INTO codex_external_fulfillments
                    (job_id,provider,provider_order_id,pool,card_last_four,status,created_at)
                    VALUES(?,'zovocard_direct',?,?,?,?,?)
                    ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,card_last_four=excluded.card_last_four''',
                    (job_id,oid,pool,last4,state,utc_now()))
        current=con.execute('SELECT status FROM codex_jobs WHERE id=?',(job_id,)).fetchone()
        if current and current[0]=='success':
            return
        con.execute('''UPDATE codex_jobs SET status=?,error=?,updated_at=?,
            finished_at=CASE WHEN ?='success' THEN COALESCE(finished_at,?) ELSE finished_at END
            WHERE id=? AND key_pool=?''',
            (status,'' if status in ('success','processing','ready') else 'ZovoCard: '+explanation(reason or state),utc_now(),status,utc_now(),job_id,pool))


def poll(automation):
    global _next_note_sync
    from codex_automation import utc_now
    with automation.connect() as con:
        jobs=con.execute("""SELECT id,order_id,platform,account_id FROM codex_jobs WHERE key_pool=?
            AND status IN ('processing','manual_action')
            AND EXISTS (SELECT 1 FROM codex_logs l WHERE l.job_id=codex_jobs.id AND l.event='zovocard_direct_dispatch')
            AND (last_poll_at IS NULL OR julianday(last_poll_at)<=julianday('now','-30 seconds'))""",(POOL,)).fetchall()
    for job in jobs:
        with automation.connect() as con:
            claimed=con.execute("""UPDATE codex_jobs SET last_poll_at=? WHERE id=?
                AND (last_poll_at IS NULL OR julianday(last_poll_at)<=julianday('now','-30 seconds'))""",(utc_now(),job['id']))
            if claimed.rowcount!=1:
                continue
        response=remote({'action':'pro5x_poll','source_id':job_source(job)})
        record(automation,job['id'],response)
    if config().get('auto_dispatch') is True:
        with automation.connect() as con:
            waiting=con.execute("""SELECT id FROM codex_jobs WHERE key_pool=?
                AND status='waiting_data' AND (error LIKE 'ZovoCard: Ожидает свободную карту%' OR error LIKE 'ZovoCard: временная ошибка чтения%')
                AND julianday(updated_at)<=julianday('now','-1 minute') ORDER BY id LIMIT 1""",(POOL,)).fetchall()
        for job in waiting:
            validate(automation,job['id'])
    if config().get('enabled') is True and time.monotonic()>=_next_note_sync:
        _next_note_sync=time.monotonic()+60
        remote({'action':'sync_notes'})



def historical_source(platform,account,created):
    from zovocard_pro5x_scope import before_cutoff
    return before_cutoff(platform,account,created,config())
