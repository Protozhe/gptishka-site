"""Private website -> restricted Zovo SSH bridge. Never accepts a URL or shell command."""
import socket,struct,pwd,json,os,subprocess,time
from decimal import Decimal,ROUND_FLOOR
SOCKET='/run/gptishka-claude-zovo/rpc.sock'
SLUGS={'claude-5x-max','claude-20x-max'}
def allowed(uid,r):
    return uid==pwd.getpwnam('gptishka-web').pw_uid and isinstance(r,dict) and r.get('action') in {'claude_status','claude_prepare','claude_submit','claude_poll','claude_receipt'} and r.get('product_slug') in SLUGS
def budget(r):
    import importlib.util
    spec=importlib.util.spec_from_file_location('finance','/opt/pulse-profit/finance_guard.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);p=m.load_policy()
    if p.get('fx_hold') or not 0<=time.time()-float(p['fx_checked_at'])<=p.get('fx_max_age_seconds',86400):raise ValueError('claude_fx_stale')
    f=r.get('financial') or {};gross=Decimal(str(f.get('gross_rub')));fee=Decimal(str(f.get('payment_commission_rub')))
    if f.get('payment_verified') is not True or not gross.is_finite() or not fee.is_finite() or not 0<=fee<gross:raise ValueError('claude_payment_unverified')
    rate=Decimal(str(p['rub_per_usdt']))/Decimal(str(p.get('usd_per_usdt',1)))
    if not rate.is_finite() or rate<=0:raise ValueError('claude_fx_stale')
    return min(50000,int(((gross-fee-Decimal(str(p.get('minimum_profit_rub',0))))/rate*100).to_integral_value(rounding=ROUND_FLOOR)))
def forward(r):
    cap=budget(r) if r['action'] in ('claude_prepare','claude_submit') else (13800 if r['product_slug']=='claude-5x-max' else 26650)
    if cap<=0:raise ValueError('claude_margin_hold')
    req={k:r[k] for k in ('action','product_slug','source_id','order','session') if k in r};req['cost_budget_usd_minor']=cap
    cmd=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/etc/gptishka-pulse/known_hosts','-o','ConnectTimeout=10','-i','/etc/gptishka-pulse/zovocard_ed25519','pulse-zovocard@91.108.242.137']
    p=subprocess.run(cmd,input=json.dumps(req).encode(),capture_output=True,timeout=180)
    if p.returncode or len(p.stdout)>65536:raise ValueError('claude_worker_unavailable')
    result=json.loads(p.stdout)
    if not isinstance(result,dict):raise ValueError('claude_worker_unavailable')
    d=result.get('result') or {}
    if r['action']=='claude_receipt' and result.get('ok') is True and d.get('state')=='completed':
        import sqlite3,importlib.util,datetime,re
        cost=d.get('total_cost_usd_minor');source=r.get('source_id','')
        if type(cost) is not int or not 0<cost<=cap or not re.fullmatch(r'gptishka:site:[a-z0-9]{20,40}',source):raise ValueError('claude_cost_unverified')
        budget(r) # also confirms a fresh reference before accounting
        spec=importlib.util.spec_from_file_location('finance_receipt','/opt/pulse-profit/finance_guard.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);policy=m.load_policy()
        rub=Decimal(cost)/100*Decimal(str(policy['rub_per_usdt']))/Decimal(str(policy.get('usd_per_usdt',1)))
        with sqlite3.connect('/opt/pulse-profit/data/profit.db',timeout=15) as c:
            c.execute('INSERT INTO order_cost_overrides(account_id,order_id,cost_rub,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id,order_id) DO UPDATE SET cost_rub=excluded.cost_rub,updated_at=excluded.updated_at',('site',source.rsplit(':',1)[1],float(rub),datetime.datetime.now(datetime.timezone.utc).isoformat()))
    return result
def serve():
    import pathlib
    pathlib.Path(SOCKET).unlink(missing_ok=True)
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as server:
        server.bind(SOCKET);os.chmod(SOCKET,0o660);server.listen(5)
        while True:
            c,_=server.accept()
            with c:
                try:
                    c.settimeout(8);_,uid,_=struct.unpack('3i',c.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));body=b''
                    while True:
                        part=c.recv(4096)
                        if not part:break
                        body+=part
                        if len(body)>16384:raise ValueError('claude_request_invalid')
                    req=json.loads(body)
                    if not allowed(uid,req):raise ValueError('claude_request_refused')
                    result=forward(req)
                except Exception as e:
                    reason=str(e) if isinstance(e,ValueError) and str(e).startswith('claude_') and str(e).replace('_','').isalnum() else 'claude_worker_unavailable'
                    result={'ok':False,'reason':reason}
                try:c.sendall(json.dumps(result).encode())
                except OSError:pass
if __name__=='__main__':serve()
