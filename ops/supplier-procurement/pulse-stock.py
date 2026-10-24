"""Website-only empty-pool procurement, called outside a SQLite transaction.
API credentials never leave the website service. No activation is performed.
"""
import json,socket,time
from pathlib import Path

CONFIG=Path('/opt/pulse-web/data/aisou-procurement.json')

def enabled(job):
    from zovocard_pulse_bridge import _time
    try:cfg=json.loads(CONFIG.read_text())
    except (OSError,ValueError):return False
    return (cfg.get('enabled') is True and job['platform']=='gptishka' and job['account_id']=='site'
        and job['product_type'] in ('codex','chatgpt_plus','chatgpt_go','chatgpt_pro_5x','chatgpt_pro_20x','chatgpt_pro_25x')
        and _time(job['source_created_at'] or job['created_at'])>=_time(cfg['enabled_after'])
        and _time(job['created_at'])>=_time(cfg['enabled_after']))

def rpc(job,proof,**extra):
    fields='order_id platform account_id product_type package id'.split()
    request={'action':'procure','order_id':job['order_id'],'context':{'job':{k:job[k] for k in fields},'reserve':{'proof':json.dumps(proof)}}}
    request['context'].update(extra)
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
        s.settimeout(245);s.connect('/run/gptishka-aisou/rpc.sock');s.sendall(json.dumps(request).encode());s.shutdown(socket.SHUT_WR)
        raw=b''
        while True:
            p=s.recv(4096)
            if not p:break
            raw+=p
            if len(raw)>8192:raise ValueError('supplier_reply_invalid')
    result=json.loads(raw)
    if result.get('error'):raise ValueError(result['error'])
    return result

def codex(a,job,module):
    if not enabled(job) or job['status']!='manual_action' or job['key_id'] or job['aiee_order_id']:return
    package=job['package'];pool=f'aiee_site_reserve_{package}'
    if package not in (250,500,1000):return
    from codex_primary_route import aiee_primary
    pools=(pool,f'codex_{package}') if aiee_primary(package) else (pool,pool)
    with a.connect() as c:
        if c.execute("SELECT 1 FROM codex_keys WHERE pool IN (?,?) AND status='available'",pools).fetchone():return
    from zovocard_pulse_bridge import remote
    from site_aiee_costs import init
    fresh=module.site('evidence',job['order_id']);module.finance(fresh)
    proof=remote({'action':f'credit{package}_fallback_claim','source_id':'gptishka:site:'+job['order_id'],'order':fresh['order']})
    if proof.get('ok') is not True or (proof.get('result') or {}).get('state')!='fallback_sealed':raise ValueError('supplier_primary_seal_required')
    result=rpc(job,proof['result'])
    if result.get('enabled') is False:return
    value=str(result.get('code') or '')
    if not value.upper().startswith(f'C{package}-') or not result.get('tradeNo') or result.get('costRub',0)<=0:raise ValueError('supplier_reply_invalid')
    # The supplier independently verified the exact denomination and unused state.
    init(a)
    from codex_automation import utc_now
    import hashlib
    fingerprint=hashlib.sha256(value.encode()).hexdigest()
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        existing=c.execute('SELECT id,pool,status FROM codex_keys WHERE fingerprint=?',(fingerprint,)).fetchone()
        if existing:
            if existing['pool']!=pool:raise ValueError('supplier_key_binding_conflict')
            return
        c.execute("INSERT INTO codex_keys(package,pool,encrypted_key,fingerprint,status,added_at) VALUES(?,?,?,?,'available',?)",(package,pool,a._fernet().encrypt(value.encode()).decode(),fingerprint,utc_now()))
        key_id=c.execute('SELECT last_insert_rowid()').fetchone()[0]
        c.execute('INSERT INTO site_aiee_key_costs VALUES(?,?,?,?,?,?,?)',(key_id,package,str(result['amountCny']),str(result['costRub']),str(round(result['amountCny']*.15,4)),'aisou:'+result['tradeNo'],time.time()))
        a._log(c,job['id'],'info','aisou_key_purchased','Correct Codex denomination independently verified; key encrypted in website-only pool; durable purchase reference retained')

def subscription(a,job,r):
    if not enabled(job):return False
    proof=json.loads(r['proof']);result=rpc(job,proof)
    if not result.get('stockAvailable'):return False
    if result.get('costRub'):
        proof['aisou_key_cost_rub']=result['costRub'];proof['aisou_key_id']=result['keyId']
        with a.connect() as c:c.execute('UPDATE subscription_reserve_attempts SET proof=? WHERE job_id=?',(json.dumps(proof),job['id']))
    return True

def subscription_cost(job,key_id,proof):
    if not enabled(job):return proof
    result=rpc(job,proof,mode='cost',keyId=key_id)
    if result.get('keyId')!=key_id:raise ValueError('supplier_cost_binding_invalid')
    if result.get('costRub') is not None:
        if result['costRub']<=0:raise ValueError('supplier_cost_binding_invalid')
        return {**proof,'aisou_key_cost_rub':result['costRub'],'aisou_key_id':key_id}
    return proof
