"""Owner-only AI-BUY wallet session and durable, once-only browser purchases.

The website sends only a trusted order ID over a peer-UID checked UNIX socket.
An independent DB validator determines the paid product, cutoff and margin.
No public endpoint, password, payment retry or activation lives in this broker.
"""
import base64,json,os,pathlib,re,socket,sqlite3,stat,struct,subprocess,sys,tempfile,time
from datetime import datetime,timezone
from decimal import Decimal
from hashlib import sha256
from urllib.request import Request,build_opener,HTTPRedirectHandler
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT=pathlib.Path('/var/www/gptishka-new/ops/supplier-procurement')
SECRET=pathlib.Path('/var/lib/gptishka-runtime/supplier-secrets')
STATE=pathlib.Path('/var/lib/gptishka-runtime/aibuy-procurement')
SOCKET='/run/gptishka-aibuy/rpc.sock'
ORIGIN='https://ai-buy.vip'
# 0 names the Claude Pro subscription in the existing integer ledger. It is
# never a caller-provided denomination; the independent paid-order DB decides.
PRICES={0:13400,250:7500,500:14500,1000:27600}

def request_no(oid):return 'ab-'+sha256(('website:'+oid).encode()).hexdigest()[:40]


def protected(file):
    fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd) as f:
        s=os.fstat(f.fileno())
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_mode&0o027 or s.st_size>262144:
            raise ValueError('supplier_settings_permissions')
        return json.load(f)


def session():
    saved=protected(SECRET/'aibuy-session.json')
    if saved['origin']!=ORIGIN:raise ValueError('supplier_session_origin')
    key=base64.b64decode(protected(SECRET/'aibuy-session-key.json')['key'],validate=True)
    b=base64.b64decode(saved['cookieCiphertext'],validate=True)
    cookies=json.loads(AESGCM(key).decrypt(b[:12],b[12:],(ORIGIN+'|'+str(saved['merchantId'])).encode()))
    return saved,key,cookies


def minor(v):
    n=Decimal(str(v))*100
    if not n.is_finite() or n<0 or n!=n.to_integral_value():raise ValueError('supplier_amount_unconfirmed')
    return int(n)


class Vault:
    def __init__(self,file,key):
        self.aes=AESGCM(key);self.db=sqlite3.connect(file,timeout=10,isolation_level=None)
        self.db.row_factory=sqlite3.Row;self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS buys(order_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,amount_minor INTEGER NOT NULL,state TEXT NOT NULL,baseline BLOB NOT NULL,receipt BLOB)')
        self.db.execute('CREATE TABLE IF NOT EXISTS assets(fingerprint TEXT PRIMARY KEY,credits INTEGER NOT NULL,cipher BLOB NOT NULL,amount_minor INTEGER NOT NULL,trade_no TEXT UNIQUE NOT NULL,order_id TEXT UNIQUE,state TEXT NOT NULL)')
        self.db.execute('''CREATE TABLE IF NOT EXISTS prepaid_aiee_reserves(
            fingerprint TEXT PRIMARY KEY,credits INTEGER NOT NULL,cipher BLOB NOT NULL,
            amount_minor INTEGER NOT NULL,usdt_minor INTEGER NOT NULL,purchased_on TEXT NOT NULL,
            order_id TEXT UNIQUE,state TEXT NOT NULL,assigned_at TEXT,reason TEXT)''')
        if str(file)!=':memory:':os.chmod(file,0o600)

    def seal(self,value,aad):
        nonce=os.urandom(12);return nonce+self.aes.encrypt(nonce,json.dumps(value).encode(),aad.encode())

    def open(self,value,aad):return json.loads(self.aes.decrypt(value[:12],value[12:],aad.encode()))

    def claim(self,oid,credits,amount,baseline):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            # Uncertain debits hold only their own order. The account lock still
            # serializes checkout; exact receipt references prevent cross-binding.
            changed=self.db.execute("INSERT OR IGNORE INTO buys VALUES(?,?,?,'sending',?,NULL)",
                (oid,credits,amount,self.seal(baseline,oid+'|baseline'))).rowcount
            row=self.db.execute('SELECT * FROM buys WHERE order_id=?',(oid,)).fetchone()
            if row['credits']!=credits:raise ValueError('supplier_order_contract_changed')
            if row['state']=='not_sent':
                self.db.execute("UPDATE buys SET state='sending',amount_minor=?,baseline=?,receipt=NULL WHERE order_id=?",
                    (amount,self.seal(baseline,oid+'|baseline'),oid));changed=True
                row=self.db.execute('SELECT * FROM buys WHERE order_id=?',(oid,)).fetchone()
            self.db.execute('COMMIT');return bool(changed),row
        except BaseException:
            self.db.execute('ROLLBACK');raise

    def receive(self,oid,result):
        state='not_sent' if result.get('dispatch_state')=='not_sent' else 'received'
        self.db.execute("UPDATE buys SET state=?,receipt=? WHERE order_id=?",(state,self.seal(result,oid+'|receipt'),oid))

    def assigned(self,oid):return self.db.execute('SELECT * FROM assets WHERE order_id=? AND state=?',(oid,'assigned')).fetchone()


def matching_receipt(row,rows,vault,reference_rows=None):
    baseline=vault.open(row['baseline'],row['order_id']+'|baseline')
    result=vault.open(row['receipt'],row['order_id']+'|receipt') if row['receipt'] else {}
    response=result.get('receipt') or {};data=(response.get('json') or {}).get('data') or {}
    trade=str(data.get('tradeNo') or '')
    # A captured response binds its exact trade number to this one dispatch.
    # Lost responses require an exact owner-scoped request_no search; contact
    # is randomized by the authenticated storefront and is never evidence.
    if trade:matches=[r for r in rows if str(r.get('trade_no'))==trade and str(r.get('trade_no')) not in baseline]
    else:
        if reference_rows is None:raise ValueError('supplier_correlation_unconfirmed')
        matches=[r for r in reference_rows if str(r.get('trade_no')) not in baseline]
    if len(matches)!=1:raise ValueError('supplier_purchase_unconfirmed')
    r=matches[0]
    is_claude=row['credits']==0
    if (int(r.get('commodity_id',0))!=(29 if is_claude else 75) or (r.get('race') or '')!=('' if is_claude else str(row['credits'])+'点数额度')
        or int(r.get('card_num',0))!=1 or int(r.get('pay_id',0))!=1 or int(r.get('status',0))!=1
        or not re.fullmatch(r'\d{10,32}',str(r.get('trade_no','')))
        or not 0<minor(r.get('amount'))<=row['amount_minor']):raise ValueError('supplier_receipt_mismatch')
    return r


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kw):return None


def verify_key(code,credits):
    if credits not in PRICES or not isinstance(code,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{12,256}',code):raise ValueError('supplier_key_unconfirmed')
    req=Request('https://aichongzhi.fun/api/redeem.php?a=verifyCdk',
        data=json.dumps({'code':code,'product':'claude' if credits==0 else 'gpt'}).encode(),headers={'Content-Type':'application/json'},method='POST')
    with build_opener(NoRedirect).open(req,timeout=30) as r:d=json.loads(r.read(262144))
    if (d.get('ok') is not True or d.get('workflow')!=('claude_pro' if credits==0 else 'codex_'+str(credits))
        or str(d.get('status','')).lower() not in ('unused','available','active','ready')
        or d.get('job_id') or d.get('task_id') or d.get('email')):raise ValueError('supplier_key_quarantined')
    return True


def verify_aiee_key(code,credits):
    if credits!=1000 or not isinstance(code,str):raise ValueError('supplier_fallback_product_invalid')
    results={}
    for action in ('query_code','verify_code'):
        req=Request('https://aiee.fun/api/auth.php',data=json.dumps({'action':action,'cdk':code}).encode(),
            headers={'Content-Type':'application/json'},method='POST')
        with build_opener(NoRedirect).open(req,timeout=25) as response:results[action]=json.loads(response.read(262144))
    query,verify=results['query_code'],results['verify_code']
    if (query.get('success') is not True or str(query.get('status','')).lower() not in ('active','available','unused')
        or query.get('order_id') or query.get('recharge_status') or query.get('previous_failed')
        or verify.get('success') is not True or verify.get('plan_type')!='codex1000'
        or int(verify.get('require_cookie') or 0)!=0 or not verify.get('sid') or verify.get('can_submit') is False):
        raise ValueError('supplier_fallback_key_unverified')
    return True


def fallback_reply(vault,row):
    return {'state':'prepaid_fallback','source':'owner_prepaid_aiee','credits':row['credits'],
        'code':vault.open(row['cipher'],row['fingerprint']),'fallback_id':row['fingerprint'],
        'amount_minor':row['amount_minor'],'usdt_minor':row['usdt_minor'],'purchased_on':row['purchased_on'],
        'activationSiteUrl':'https://aiee.fun','primary_sealed_no_charge':True}


def prepaid_fallback(vault,oid,credits,policy,reason,validator,oracle=verify_aiee_key):
    cfg=policy.get('prepaidAieeFallback') or {}
    allowed={'supplier_login_required','supplier_checkout_not_ready','supplier_balance_insufficient'}
    if cfg.get('enabled') is not True or credits!=1000 or reason not in allowed:return None
    prior=vault.db.execute('SELECT state FROM buys WHERE order_id=?',(oid,)).fetchone()
    if prior and prior['state']!='not_sent':return None
    row=vault.db.execute("SELECT * FROM prepaid_aiee_reserves WHERE credits=? AND state='available' AND order_id IS NULL ORDER BY rowid LIMIT 1",(credits,)).fetchone()
    if not row:return None
    intent=validator(oid,row['amount_minor'])
    try:
        start=datetime.fromisoformat(str(cfg['enabledAfter']).replace('Z','+00:00'))
        if start.tzinfo is None or start>datetime.now(timezone.utc):return None
        for field in ('created_at','payment_at'):
            date=datetime.fromisoformat(str(intent[field]).replace('Z','+00:00'))
            if date.tzinfo is None or date<start:return None
    except (ValueError,TypeError,KeyError):return None
    if intent.get('stock_available'):return {'state':'stock_available'}
    oracle(vault.open(row['cipher'],row['fingerprint']),credits)
    vault.db.execute('BEGIN IMMEDIATE')
    try:
        prior=vault.db.execute('SELECT state FROM buys WHERE order_id=?',(oid,)).fetchone()
        if prior and prior['state']!='not_sent':raise ValueError('supplier_fallback_primary_unconfirmed')
        changed=vault.db.execute("UPDATE prepaid_aiee_reserves SET state='assigned',order_id=?,assigned_at=?,reason=? WHERE fingerprint=? AND state='available' AND order_id IS NULL",
            (oid,datetime.now(timezone.utc).isoformat(),reason,row['fingerprint'])).rowcount
        if changed!=1:raise ValueError('supplier_fallback_stock_changed')
        if prior:vault.db.execute("UPDATE buys SET state='cancelled_no_charge' WHERE order_id=? AND state='not_sent'",(oid,))
        else:vault.db.execute("INSERT INTO buys VALUES(?,?,?,'cancelled_no_charge',?,?)",
            (oid,credits,row['amount_minor'],vault.seal([],oid+'|baseline'),vault.seal({'prepaid_fallback':True,'reason':reason,'dispatch_state':'not_sent'},oid+'|receipt')))
        vault.db.execute('COMMIT')
    except BaseException:vault.db.execute('ROLLBACK');raise
    return fallback_reply(vault,row)


def child(data):
    import pwd
    saved,key,current=session()
    data={**data,'cookies':current,'merchantId':saved['merchantId']}
    who=pwd.getpwnam('gptishka-buy')
    with tempfile.TemporaryDirectory(prefix='aibuy-ui-') as d:
        os.chown(d,who.pw_uid,who.pw_gid)
        def demote():os.setgroups([]);os.setgid(who.pw_gid);os.setuid(who.pw_uid)
        p=subprocess.run(['/opt/playerok-connector/venv/bin/python',str(ROOT/'aibuy-browser.py')],
            input=json.dumps(data),text=True,capture_output=True,cwd=d,timeout=180,preexec_fn=demote,
            env={'HOME':d,'XDG_CACHE_HOME':d,'XDG_CONFIG_HOME':d,'PATH':'/usr/bin:/bin'})
        if p.returncode or len(p.stdout)>4194304:raise ValueError('supplier_browser_unconfirmed')
        result=json.loads(p.stdout)
        if result.get('error') and not (data.get('mode')=='buy' and result.get('dispatch_state')=='not_sent' or data.get('mode')=='topup'):
            raise ValueError(result['error'])
        rows=result.pop('_cookies',None)
        if rows is not None:
            if not rows or any(r.get('domain','').lstrip('.')!='ai-buy.vip' for r in rows):raise ValueError('supplier_session_origin')
            nonce=os.urandom(12)
            saved['cookieCiphertext']=base64.b64encode(nonce+AESGCM(key).encrypt(nonce,json.dumps(rows).encode(),(ORIGIN+'|'+str(saved['merchantId'])).encode())).decode()
            saved['refreshedAt']=int(time.time())
            fd,tmp=tempfile.mkstemp(prefix='.aibuy-session-',dir=SECRET)
            try:
                with os.fdopen(fd,'w') as f:
                    os.fchmod(f.fileno(),0o600);json.dump(saved,f);f.flush();os.fsync(f.fileno())
                os.replace(tmp,SECRET/'aibuy-session.json')
            finally:
                if os.path.lexists(tmp):os.unlink(tmp)
        return result


def validate(oid,amount=None):
    import pwd
    # Read the live process environment only into this child. Never print it.
    apps=json.loads(subprocess.check_output(['pm2','jlist']))
    app=next(x for x in apps if x['name']=='gptishka-admin-api')
    env={}
    for e in pathlib.Path('/proc/'+str(app['pid'])+'/environ').read_bytes().split(b'\0'):
        if b'=' in e:
            k,v=e.split(b'=',1);env[k.decode()]=v.decode()
    for k in ('NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'):env.pop(k,None)
    who=pwd.getpwnam('gptishka-web')
    def demote():os.setgroups([]);os.setgid(who.pw_gid);os.setuid(who.pw_uid)
    payload={'order_id':oid}
    if amount is not None:payload['amount_minor']=amount
    p=subprocess.run(['/usr/bin/node',str(ROOT/'aibuy-validate.cjs')],input=json.dumps(payload),
        text=True,capture_output=True,env=env,preexec_fn=demote,cwd=ROOT.parent.parent,timeout=30)
    try:r=json.loads(p.stdout)
    except Exception:raise ValueError('supplier_order_unconfirmed') from None
    if r.get('error'):raise ValueError(r['error'])
    if p.returncode:raise ValueError('supplier_order_unconfirmed')
    return r


def asset_reply(vault,asset):
    return {'code':vault.open(asset['cipher'],asset['fingerprint']),
        'product_key':'claude-pro' if asset['credits']==0 else 'codex-'+str(asset['credits']),
        'credits':asset['credits'],'amount_minor':asset['amount_minor'],'trade_no':asset['trade_no'],
        'activationSiteUrl':'https://aichongzhi.fun'}


def procure(oid,policy,*,browser=child,order_validator=validate,oracle=verify_key,fallback_oracle=verify_aiee_key):
    if not re.fullmatch(r'[a-z0-9]{20,40}',oid or ''):raise ValueError('supplier_request_invalid')
    if policy.get('enabled') is not True:raise ValueError('supplier_disabled')
    if policy.get('paused') is True:raise ValueError('supplier_owner_topup_pause')
    intent=order_validator(oid);credits=intent['credits']
    if type(credits) is not int or credits not in PRICES:raise ValueError('supplier_product_disabled')
    if intent.get('stock_available'):return {'state':'stock_available'}
    saved,key,cookies=session();vault=Vault(STATE/'journal.sqlite',key)
    try:
        held=vault.db.execute('SELECT state FROM buys WHERE order_id=?',(oid,)).fetchone()
        if held and held['state']=='owner_stock_switch':raise ValueError('supplier_owner_completed')
        reserve=vault.db.execute("SELECT * FROM prepaid_aiee_reserves WHERE order_id=? AND state='assigned'",(oid,)).fetchone()
        if reserve:return fallback_reply(vault,reserve)
        asset=vault.assigned(oid)
        if asset:return asset_reply(vault,asset)
        # Stock allocation is atomic and verified again before assignment.
        while True:
            asset=vault.db.execute("SELECT * FROM assets WHERE credits=? AND state='available' AND order_id IS NULL ORDER BY rowid LIMIT 1",(credits,)).fetchone()
            if not asset:break
            try:oracle(vault.open(asset['cipher'],asset['fingerprint']),credits)
            except ValueError as e:
                if str(e)!='supplier_key_quarantined':raise
                vault.db.execute("UPDATE assets SET state='quarantined' WHERE fingerprint=?",(asset['fingerprint'],));continue
            changed=vault.db.execute("UPDATE assets SET order_id=?,state='assigned' WHERE fingerprint=? AND state='available' AND order_id IS NULL",(oid,asset['fingerprint'])).rowcount
            if changed:return asset_reply(vault,vault.assigned(oid))
            raise ValueError('supplier_stock_changed')
        prior=vault.db.execute('SELECT * FROM buys WHERE order_id=?',(oid,)).fetchone()
        if prior and prior['state']=='cancelled_no_charge':raise ValueError('supplier_owner_completed')
        retryable=prior is None or prior['state']=='not_sent'
        data={'mode':'prepare' if retryable else 'history','cookies':cookies,'merchantId':saved['merchantId'],'credits':credits}
        if not retryable:data['request_no']=request_no(oid)
        result=browser(data)
        if not retryable:
            if prior['credits']!=credits:raise ValueError('supplier_order_contract_changed')
        else:
            amount=result['amount_minor'];intent=order_validator(oid,amount)
            if intent.get('stock_available'):return {'state':'stock_available'}
            # The logged-in shop page is the authoritative balance display.
            balance=result.get('balance_minor')
            if not isinstance(balance,int):raise ValueError('supplier_balance_unconfirmed')
            if balance<amount:
                reserve=prepaid_fallback(vault,oid,credits,policy,'supplier_balance_insufficient',order_validator,fallback_oracle)
                if reserve:return reserve
                return {'state':'funds_wait','required_minor':amount,'balance_minor':balance}
            baseline=[str(r['trade_no']) for r in result['history']]
            claimed,prior=vault.claim(oid,credits,amount,baseline)
            if claimed:
                if order_validator(oid,amount).get('stock_available'):
                    # No browser buy has been invoked. Retain a terminal,
                    # never-replayed claim and use the owner's supplied stock.
                    vault.db.execute("UPDATE buys SET state='verified' WHERE order_id=?",(oid,))
                    return {'state':'stock_available'}
                try:
                    result=browser({**data,'mode':'buy','amount_minor':amount,'baseline':baseline,'request_no':request_no(oid)})
                    vault.receive(oid,result)
                    if result.get('dispatch_state')=='not_sent':
                        code=result.get('error','supplier_checkout_not_ready')
                        raise ValueError(code if re.fullmatch(r'supplier_[a-z_]{1,70}',code) else 'supplier_checkout_not_ready')
                except Exception:
                    # The durable sending claim is deliberately never reset.
                    saved=vault.db.execute('SELECT state FROM buys WHERE order_id=?',(oid,)).fetchone()
                    if saved['state']=='not_sent':raise
                    raise ValueError('supplier_purchase_unconfirmed') from None
            else:result=browser({**data,'mode':'history','request_no':request_no(oid)})
            prior=vault.db.execute('SELECT * FROM buys WHERE order_id=?',(oid,)).fetchone()
        receipt=matching_receipt(prior,result['history'],vault,result.get('reference_history'))
        code=receipt.get('secret')
        if not isinstance(code,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{12,256}',code.strip()):raise ValueError('supplier_delivery_pending')
        code=code.strip();fingerprint=sha256(code.encode()).hexdigest()
        # Save even a mismatched/used code, but never hand it to a customer.
        vault.db.execute("INSERT OR IGNORE INTO assets VALUES(?,?,?,?,?,NULL,'quarantined')",
            (fingerprint,credits,vault.seal(code,fingerprint),minor(receipt['amount']),str(receipt['trade_no'])))
        oracle(code,credits)
        order_validator(oid,minor(receipt['amount']))
        old=vault.db.execute('SELECT * FROM assets WHERE fingerprint=?',(fingerprint,)).fetchone()
        if old is None or old['order_id'] not in (None,oid) or old['credits']!=credits:raise ValueError('supplier_stock_conflict')
        vault.db.execute('BEGIN IMMEDIATE')
        try:
            vault.db.execute("UPDATE assets SET state='assigned',order_id=? WHERE fingerprint=? AND (order_id IS NULL OR order_id=?)",(oid,fingerprint,oid))
            vault.db.execute("UPDATE buys SET state='verified' WHERE order_id=?",(oid,));vault.db.execute('COMMIT')
        except BaseException:vault.db.execute('ROLLBACK');raise
        return asset_reply(vault,vault.assigned(oid))
    except ValueError as error:
        reserve=prepaid_fallback(vault,oid,credits,policy,str(error),order_validator,fallback_oracle)
        if reserve:return reserve
        raise
    finally:vault.db.close()


def prepare_socket_directory(gid):
    directory=pathlib.Path(SOCKET).parent
    directory.mkdir(mode=0o750,exist_ok=True)
    os.chown(directory,0,gid)
    # systemd's UMask=0077 otherwise removes the web group's traversal bit.
    os.chmod(directory,0o750)


def serve():
    import pwd,fcntl
    who=pwd.getpwnam('gptishka-web')
    STATE.mkdir(mode=0o700,exist_ok=True)
    prepare_socket_directory(who.pw_gid)
    lock=open(STATE/'broker.lock','a');os.chmod(lock.name,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if os.path.lexists(SOCKET):os.unlink(SOCKET)
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as server:
        server.bind(SOCKET);os.chown(SOCKET,who.pw_uid,who.pw_gid);os.chmod(SOCKET,0o600);server.listen(16)
        while True:
            conn,_=server.accept()
            with conn:
                conn.settimeout(210)
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
                    if req=={'action':'health'}:
                        policy=protected(SECRET/'aibuy-policy.json')
                        conn.sendall(json.dumps({'state':'alive','enabled':policy.get('enabled') is True,'paused':policy.get('paused') is True}).encode());continue
                    if set(req)!={'action','order_id'} or req['action']!='procure':raise ValueError('supplier_request_invalid')
                    with open(STATE/'account.lock','a') as account:
                        os.chmod(account.name,0o600);fcntl.flock(account,fcntl.LOCK_EX)
                        out=procure(req['order_id'],protected(SECRET/'aibuy-policy.json'))
                except Exception as e:
                    reason=str(e);out={'error':reason if re.fullmatch('supplier_[a-z_]{1,70}',reason) else 'supplier_requires_review'}
                try:conn.sendall(json.dumps(out).encode())
                except OSError:pass


if __name__=='__main__':
    if os.geteuid()!=0:raise SystemExit('owner runtime required')
    serve()
