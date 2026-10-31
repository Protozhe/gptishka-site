"""Private paid-website/Telegram Grok route; no arbitrary URLs or card limits."""
import json,socket,struct,pwd,os,subprocess,time,sqlite3,datetime,importlib.util,re
from decimal import Decimal,ROUND_FLOOR
SOCKET='/run/gptishka-grok-zovo/rpc.sock'
SLUGS={'grok-plus-1','grok-premium-1','grok-super-1','grok-ultra-1'}

def budget(r):
    spec=importlib.util.spec_from_file_location('finance','/opt/pulse-profit/finance_guard.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);p=m.load_policy()
    if p.get('fx_hold') or not 0<=time.time()-float(p['fx_checked_at'])<=p.get('fx_max_age_seconds',86400):raise ValueError('grok_fx_stale')
    f=r.get('financial') or {};gross=Decimal(str(f.get('gross_rub')));fee=Decimal(str(f.get('payment_commission_rub')))
    if f.get('payment_verified') is not True or not gross.is_finite() or not fee.is_finite() or not 0<=fee<gross:raise ValueError('grok_payment_unverified')
    rate=Decimal(str(p['rub_per_usdt']))/Decimal(str(p.get('usd_per_usdt',1)))
    if not rate.is_finite() or rate<=0:raise ValueError('grok_fx_stale')
    return min(25500,int(((gross-fee-Decimal(str(p.get('minimum_profit_rub',0))))/rate*100).to_integral_value(rounding=ROUND_FLOOR))),p

def forward(r):
    if r['action'] in ('grok_prepare','grok_submit','grok_receipt'):cap,p=budget(r)
    else:cap,p=25500,None
    if cap<=0:raise ValueError('grok_margin_hold')
    req={k:r[k] for k in ('action','product_slug','source_id','order','session') if k in r};req['cost_budget_usd_minor']=cap
    cmd=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/etc/gptishka-pulse/known_hosts','-o','ConnectTimeout=10','-i','/etc/gptishka-pulse/zovocard_ed25519','pulse-zovocard@91.108.242.137']
    response=subprocess.run(cmd,input=json.dumps(req).encode(),capture_output=True,timeout=180)
    if response.returncode or len(response.stdout)>65536:raise ValueError('grok_worker_unavailable')
    result=json.loads(response.stdout)
    if not isinstance(result,dict):raise ValueError('grok_worker_unavailable')
    d=result.get('result') or {}
    if r['action']=='grok_receipt' and result.get('ok') is True and d.get('state')=='completed':
        cost=d.get('total_cost_usd_minor');source=r.get('source_id','')
        if type(cost) is not int or not 0<cost<=cap or not re.fullmatch(r'gptishka:site:[a-z0-9]{20,40}',source):raise ValueError('grok_cost_unverified')
        rub=Decimal(cost)/100*Decimal(str(p['rub_per_usdt']))/Decimal(str(p.get('usd_per_usdt',1)))
        with sqlite3.connect('/opt/pulse-profit/data/profit.db',timeout=15) as c:
            old=c.execute('SELECT cost_rub FROM order_cost_overrides WHERE account_id=? AND order_id=?',('site',source.rsplit(':',1)[1])).fetchone()
            if old and abs(Decimal(str(old[0]))-rub)>Decimal('.005'):raise ValueError('grok_cost_binding_changed')
            if not old:c.execute('INSERT INTO order_cost_overrides(account_id,order_id,cost_rub,updated_at) VALUES(?,?,?,?)',('site',source.rsplit(':',1)[1],float(rub),datetime.datetime.now(datetime.timezone.utc).isoformat()))
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
                        if len(body)>16384:raise ValueError('grok_request_invalid')
                    r=json.loads(body)
                    if uid!=pwd.getpwnam('gptishka-web').pw_uid or not isinstance(r,dict) or r.get('action') not in {'grok_status','grok_prepare','grok_submit','grok_poll','grok_receipt'} or r.get('product_slug') not in SLUGS:raise ValueError('grok_request_refused')
                    result=forward(r)
                except Exception as e:
                    reason=str(e) if isinstance(e,ValueError) and re.fullmatch(r'grok_[a-z_]{1,80}',str(e)) else 'grok_worker_unavailable'
                    result={'ok':False,'reason':reason}
                try:c.sendall(json.dumps(result).encode())
                except OSError:pass
if __name__=='__main__':serve()
