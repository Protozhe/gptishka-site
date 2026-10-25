"""Peer-UID marketplace broker, shared AI-BUY account lock and purchase ledger.

Accepts only a local job ID. Independently reads paid orders, fresh finances,
encrypted customer input and prior fulfillment. Never activates or messages.
"""
import importlib.util,json,os,pathlib,re,socket,sqlite3,struct,subprocess,sys,time
from urllib.parse import quote as escape
from urllib.request import Request,urlopen
from cryptography.fernet import Fernet
from contextlib import contextmanager
from market_aibuy_common import PRICES,classify,identity,eligible,stamp,session,quote

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('aibuy_root',HERE/'aibuy-broker.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
SOCKET='/run/gptishka-aibuy-market/rpc.sock'
ACTIVITY='/opt/pulse-web/data/chat-activity.db'
WORKER='/var/lib/docker/volumes/funpay-worker_funpay-data/_data/funpay_manager.db'
PROFIT='/opt/pulse-profit/data/profit.db'
KEY='/var/lib/docker/volumes/funpay-worker_funpay-data/_data/secret.key'
FEE_POLICY=pathlib.Path('/opt/pulse-profit/data/finance-policy.json')
GUARD='/opt/pulse-profit/finance_guard.py'

@contextmanager
def db(path):
    c=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True,timeout=15);c.row_factory=sqlite3.Row
    try:yield c
    finally:c.close()

def paid(job,policy,*,worker_read=None,player_read=None):
    start=stamp(policy['marketplaces']['enabledAfter'])
    if job['platform']=='funpay':
        with db(WORKER) as c:
            account=c.execute('SELECT status,currency FROM account WHERE id=?',(job['account_id'],)).fetchone()
            cached=c.execute('SELECT * FROM broker_order_cache WHERE account_id=? AND order_id=?',(job['account_id'],job['order_id'])).fetchone()
            delivered=c.execute('SELECT 1 FROM auto_delivery_reservation WHERE order_id=?',(job['order_id'],)).fetchone()
        if not account or account['status']!='active' or account['currency']!='RUB' or delivered:raise ValueError('supplier_payment_unverified')
        if worker_read is None:
            pid=int(subprocess.check_output(['systemctl','show','-p','MainPID','--value','pulse-chat-fallback.service']))
            env=dict(v.split(b'=',1) for v in pathlib.Path('/proc/'+str(pid)+'/environ').read_bytes().split(b'\0') if b'=' in v)
            token=env.get(b'CONNECTION_TOKEN',b'').decode()
            if not token:raise ValueError('supplier_payment_unverified')
            url='http://127.0.0.1:8000/accounts/'+escape(str(job['account_id']),safe='')+'/orders/?state=paid'
            with urlopen(Request(url,headers={'X-Connection-Token':token,'Accept':'application/json'}),timeout=30) as r:rows=json.loads(r.read(2097152))
        else:rows=worker_read(job)
        matches=[x for x in rows if str(x.get('id') or '')==job['order_id']] if isinstance(rows,list) else []
        if len(matches)!=1 or matches[0].get('status')!='paid':raise ValueError('supplier_payment_unverified')
        row=matches[0]
        if cached:
            if cached['status']!='paid' or stamp(cached['occurred_at'])<start or float(cached['quantity'] or 1)!=1:raise ValueError('supplier_payment_unverified')
        else:
            from datetime import datetime
            from zoneinfo import ZoneInfo
            m=re.fullmatch(r'сегодня,\s*(\d{1,2}):(\d{2})',str(row.get('date') or ''),re.I)
            if not m:raise ValueError('supplier_order_time_unverified')
            today=datetime.now(ZoneInfo('Europe/Moscow'));date=today.replace(hour=int(m[1]),minute=int(m[2]),second=0,microsecond=0)
            if date.timestamp()<start:raise ValueError('supplier_order_time_unverified')
        if classify(row.get('title'))!=job['contract_code'] or float(row.get('quantity',1))!=1:raise ValueError('supplier_product_mismatch')
        return {'platform':'funpay','order_id':job['order_id'],'gross_rub':row['price'],'quantity':1,'title':row['title'],'payment_verified':True}
    with db(PROFIT) as c:row=c.execute("SELECT * FROM external_orders WHERE platform='playerok' AND order_id=?",(job['order_id'],)).fetchone()
    if not row or row['status']!='paid' or stamp(row['occurred_at'])<start or classify(row['title'])!=job['contract_code']:raise ValueError('supplier_payment_unverified')
    if player_read is None:
        sys.path.insert(0,'/opt/pulse-web');from playerok_chat import PlayerokHTTP
        live=PlayerokHTTP().load_deal(job['order_id'])
    else:live=player_read(job)
    if live.get('id')!=job['order_id'] or live.get('status')!='PAID' or live.get('direction')!='OUT':raise ValueError('supplier_payment_unverified')
    payload=json.loads(row['payload_json'] or '{}')
    if payload.get('quantity',1)!=1:raise ValueError('supplier_product_mismatch')
    return {'platform':'playerok','order_id':job['order_id'],'gross_rub':row['gross_revenue_rub'],'marketplace_commission_rub':row['commission_rub'],'quantity':1,'title':row['title'],'payment_verified':True}

def validate_job(jid,amount=None,*,bound=False,policy=None,payment_reader=paid):
    policy=policy or b.protected(b.SECRET/'aibuy-policy.json')
    if policy.get('paused') is True and not bound:raise ValueError('supplier_owner_topup_pause')
    with db(ACTIVITY) as c:
        settings=c.execute('SELECT enabled,auto_submit FROM codex_settings WHERE id=1').fetchone()
        if not settings or not settings['enabled'] or not settings['auto_submit']:raise ValueError('supplier_automation_paused')
        raw=c.execute('SELECT * FROM codex_jobs WHERE id=?',(jid,)).fetchone()
        attempt=c.execute('SELECT * FROM market_aibuy_attempts WHERE job_id=?',(jid,)).fetchone()
        if not raw or not attempt:raise ValueError('supplier_order_ineligible')
        job=dict(raw);code=job['package'] if job['product_type']=='codex' else 0;job['contract_code']=code
        if not eligible(job,policy) or code not in PRICES or classify(job['title'])!=code or attempt['contract_code']!=code:raise ValueError('supplier_order_ineligible')
        if job['status'] not in ('waiting_data','ready','validating') or attempt['dispatched'] or job['aiee_order_id']:raise ValueError('supplier_prior_fulfillment')
        if (bool(job['key_id'])!=bound) or (bound and (attempt['key_id']!=job['key_id'] or attempt['state']!='key_ready')):raise ValueError('supplier_prior_fulfillment')
        if c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',(job['platform'],job['account_id'],job['order_id'])).fetchone():raise ValueError('supplier_refund_hold')
        if c.execute('SELECT 1 FROM codex_external_fulfillments WHERE job_id=?',(jid,)).fetchone():raise ValueError('supplier_prior_fulfillment')
        for table in ('subscription_reserve_attempts','site_aiee_attempts'):
            if c.execute('SELECT 1 FROM '+table+' WHERE job_id=?',(jid,)).fetchone():raise ValueError('supplier_prior_fulfillment')
        if c.execute("SELECT 1 FROM codex_logs WHERE job_id=? AND (event IN ('submitted','submit_uncertain','submit_pending_confirmation','manual_completed','ready') OR event LIKE 'zovocard%dispatch%')",(jid,)).fetchone():raise ValueError('supplier_prior_fulfillment')
        if not bound and job['key_pool']!=__import__('market_aibuy_common').pool(code):raise ValueError('supplier_order_contract_changed')
        encrypted=attempt['encrypted_session']
        native_key=c.execute('SELECT * FROM codex_keys WHERE id=?',(job['key_id'],)).fetchone() if bound else None
        if bound and (not native_key or native_key['reserved_job_id']!=jid or native_key['status']!='reserved'):raise ValueError('supplier_stock_conflict')
    if not encrypted:raise ValueError('supplier_session_required')
    session(Fernet(pathlib.Path(KEY).read_bytes().strip()).decrypt(encrypted.encode()).decode(),code)
    amount=PRICES[code] if amount is None else amount
    financial=payment_reader(job,policy)
    rate_policy=b.protected(b.SECRET/'policy.json')
    fee_policy=json.loads(FEE_POLICY.read_text())
    s=importlib.util.spec_from_file_location('margin_read',GUARD);guard=importlib.util.module_from_spec(s);s.loader.exec_module(guard)
    cost=quote(amount,code,rate_policy,financial,fee_policy,guard.assess)
    if bound:
        if amount!=attempt['amount_minor'] or str(cost)!=attempt['cost_rub']:raise ValueError('supplier_cost_binding_invalid')
        with db(b.STATE/'journal.sqlite') as c:
            asset=c.execute("SELECT * FROM assets WHERE order_id=? AND state='assigned'",(identity(job),)).fetchone()
        if not asset or asset['fingerprint']!=native_key['fingerprint'] or asset['credits']!=code or asset['amount_minor']!=amount or asset['trade_no']!=attempt['trade_no']:raise ValueError('supplier_cost_binding_invalid')
    return {'order_id':identity(job),'credits':code,'amount_minor':amount,'cost_rub':cost,'stock_available':False}

def handle(req,policy):
    if req=={'action':'health'}:return {'state':'alive','enabled':policy.get('enabled') is True and policy.get('marketplaces',{}).get('enabled') is True,'paused':policy.get('paused') is True}
    if set(req)!={'action','job_id'} or req['action'] not in ('procure','attest') or type(req['job_id']) is not int or req['job_id']<=0:raise ValueError('supplier_request_invalid')
    jid=req['job_id']
    if req['action']=='attest':
        with db(ACTIVITY) as c:r=c.execute('SELECT amount_minor FROM market_aibuy_attempts WHERE job_id=?',(jid,)).fetchone()
        return validate_job(jid,r['amount_minor'] if r else None,bound=True,policy=policy)
    first=validate_job(jid,policy=policy)
    def validator(oid,amount=None):
        r=validate_job(jid,amount,policy=policy)
        if r['order_id']!=oid:raise ValueError('supplier_order_contract_changed')
        return r
    out=b.procure(first['order_id'],policy,order_validator=validator)
    if out.get('code'):
        r=validate_job(jid,out['amount_minor'],policy=policy);out['cost_rub']=r['cost_rub']
    return out

def serve():
    import fcntl,pwd
    who=pwd.getpwnam('gptishka-pulse');directory=pathlib.Path(SOCKET).parent
    directory.mkdir(mode=0o750,exist_ok=True);os.chown(directory,0,who.pw_gid);os.chmod(directory,0o750)
    lock=open(b.STATE/'market-broker.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if os.path.lexists(SOCKET):os.unlink(SOCKET)
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as server:
        server.bind(SOCKET);os.chown(SOCKET,who.pw_uid,who.pw_gid);os.chmod(SOCKET,0o600);server.listen(16)
        while True:
            conn,_=server.accept()
            with conn:
                conn.settimeout(245)
                try:
                    _,uid,_=struct.unpack('3i',conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
                    if uid!=who.pw_uid:raise ValueError('supplier_peer_refused')
                    raw=b''
                    while True:
                        part=conn.recv(2048)
                        if not part:break
                        raw+=part
                        if len(raw)>2048:raise ValueError('supplier_request_invalid')
                    req=json.loads(raw)
                    with open(b.STATE/'account.lock','a') as account:
                        fcntl.flock(account,fcntl.LOCK_EX);out=handle(req,b.protected(b.SECRET/'aibuy-policy.json'))
                except Exception as e:
                    reason=str(e);out={'error':reason if re.fullmatch(r'supplier_[a-z_]{1,70}',reason) else 'supplier_requires_review'}
                try:conn.sendall(json.dumps(out).encode())
                except OSError:pass

if __name__=='__main__':
    if os.geteuid()!=0:raise SystemExit('owner runtime required')
    serve()
