"""Shared prepaid Codex and Claude Pro stock; no purchase calls."""
import json,time
from pathlib import Path
from market_aibuy_common import stamp,workflow,product

CONFIG=Path('/opt/pulse-web/data/codex-shared-stock.json')
AIBUY='https://aichongzhi.fun'
AISOU='https://aiee.fun'

def enabled(job,attempt):
    try:
        cfg=json.loads(CONFIG.read_text());cutoff=stamp(cfg['enabledAfter'])
        contract=(job['product_type']=='codex' and job['package'] in (250,500,1000)) or (job['product_type']=='claude_pro' and job['package']==0)
        return (cfg.get('enabled') is True and cutoff<=time.time() and contract
            and job['platform'] in ('funpay','playerok')
            and stamp(job['created_at'])>=cutoff and stamp(job['source_created_at'])>=cutoff and attempt['created_at']>=cutoff)
    except (OSError,ValueError,KeyError,TypeError):return False

def init(a):
    with a.connect() as c:c.execute('''CREATE TABLE IF NOT EXISTS market_shared_stock(
      job_id INTEGER PRIMARY KEY,native_key_id TEXT NOT NULL UNIQUE,activation_site TEXT NOT NULL,sid TEXT NOT NULL DEFAULT '')''')

def binding(a,jid):
    with a.connect() as c:return c.execute('SELECT * FROM market_shared_stock WHERE job_id=?',(jid,)).fetchone()

def bind(a,j,r,result):
    code=r['contract_code'];site=result.get('activationSiteUrl')
    if (result.get('state')!='shared_stock' or result.get('credits')!=code or type(result.get('credits')) is not int
        or result.get('product_key')!=product(code) or site not in ((AIBUY,) if code==0 else (AIBUY,AISOU))
        or not isinstance(result.get('native_key_id'),str) or not isinstance(result.get('code'),str)):
        raise ValueError('supplier_stock_contract_invalid')
    import hashlib
    value=result['code'];fingerprint=hashlib.sha256(value.encode()).hexdigest()
    if result.get('fingerprint')!=fingerprint:raise ValueError('supplier_stock_binding_invalid')
    from market_aibuy_common import pool
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE');fresh=c.execute('SELECT * FROM codex_jobs WHERE id=?',(j['id'],)).fetchone()
        if fresh['status'] not in ('waiting_data','ready') or fresh['aiee_order_id'] or fresh['key_id'] not in (None,r['key_id']):raise ValueError('supplier_order_changed')
        key=c.execute('SELECT * FROM codex_keys WHERE fingerprint=?',(fingerprint,)).fetchone()
        if key and (key['reserved_job_id']!=j['id'] or key['pool']!=pool(code) or key['status']!='reserved'):raise ValueError('supplier_stock_conflict')
        if not key:
            c.execute("INSERT INTO codex_keys(package,pool,encrypted_key,fingerprint,status,reserved_job_id,added_at) VALUES(?,?,?,?,'reserved',?,datetime('now'))",(code,pool(code),a._fernet().encrypt(value.encode()).decode(),fingerprint,j['id']))
            key_id=c.execute('SELECT last_insert_rowid()').fetchone()[0]
        else:key_id=key['id']
        old=c.execute('SELECT * FROM market_shared_stock WHERE job_id=?',(j['id'],)).fetchone()
        if old and (old['native_key_id']!=result['native_key_id'] or old['activation_site']!=site):raise ValueError('supplier_stock_binding_invalid')
        c.execute('INSERT OR IGNORE INTO market_shared_stock(job_id,native_key_id,activation_site) VALUES(?,?,?)',(j['id'],result['native_key_id'],site))
        c.execute("UPDATE market_aibuy_attempts SET state='key_ready',key_id=?,next_at=0,reason='',updated_at=? WHERE job_id=? AND dispatched=0",(key_id,time.time(),j['id']))
        c.execute("UPDATE codex_jobs SET key_id=?,status='ready',error='',updated_at=datetime('now') WHERE id=?",(key_id,j['id']))

def verify(a,value,code,site,raw):
    if site==AIBUY:
        result=a._post_json(AIBUY+'/api/redeem.php?a=verifyCdk',{'code':value,'product':'claude' if code==0 else 'gpt'},timeout=45)
        if result.get('ok') is not True or result.get('workflow')!=workflow(code) or result.get('status')!='unused' or result.get('job_id') or result.get('task_id') or result.get('email'):raise ValueError('supplier_key_quarantined')
        return ''
    if site!=AISOU or code==0:raise ValueError('supplier_stock_contract_invalid')
    url=AISOU+'/api/auth.php'
    query=a._post_json(url,{'action':'query_code','cdk':value},timeout=45)
    result=a._post_json(url,{'action':'verify_code','cdk':value},timeout=45)
    if (query.get('success') is not True or query.get('status') not in ('active','available','unused')
        or query.get('order_id') or query.get('previous_failed') or query.get('recharge_status') not in (None,'','unused','none')
        or result.get('success') is not True or result.get('plan_type')!='codex'+str(code)
        or result.get('require_cookie') not in (None,0,False,'0') or not result.get('sid') or result.get('can_submit') is False):
        raise ValueError('supplier_key_quarantined')
    sid=str(result['sid'])
    checked=a._post_json(url,{'action':'validate_token','cdk':value,'sid':sid,'json_token':raw,'chatgpt_cookie':''},timeout=45)
    if checked.get('success') is not True:raise ValueError('supplier_session_required')
    return sid

def normalize_aiee(result,code):
    if result.get('success') is not True:raise ValueError('supplier_activation_unconfirmed')
    if result.get('plan_type') and result['plan_type']!='codex'+str(code):raise ValueError('supplier_stock_contract_invalid')
    recharge=str(result.get('recharge_status') or '').lower()
    success=recharge in ('success','completed','done')
    failed=recharge in ('failed','error','cancelled','canceled')
    return {'ok':True,'workflow':workflow(code),'final':success or failed,'status':'done' if success else 'failed' if failed else 'processing'}

def submit(a,value,code,site,raw,sid):
    if site==AIBUY:return a._post_json(AIBUY+'/api/redeem.php?a=activate',{'code':value,'token':raw,'cookie':'','product':'claude' if code==0 else 'gpt'},timeout=90)
    if site!=AISOU or code==0:raise ValueError('supplier_stock_contract_invalid')
    result=a._post_json(AISOU+'/api/auth.php',{'action':'submit_recharge','cdk':value,'sid':sid,'json_token':raw,'chatgpt_cookie':''},timeout=90)
    return normalize_aiee(result,code)

def poll(a,value,code,site):
    if site==AIBUY:return a._post_json(AIBUY+'/api/redeem.php?a=status',{'code':value,'product':'claude' if code==0 else 'gpt'},timeout=45)
    if site!=AISOU or code==0:raise ValueError('supplier_stock_contract_invalid')
    return normalize_aiee(a._post_json(AISOU+'/api/auth.php',{'action':'query_code','cdk':value},timeout=45),code)
