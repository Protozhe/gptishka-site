"""Additive reviewed Pulse hooks and root broker. Installs disabled; no purchases.

Requires the exact original source hashes and a clean committed active release.
Old code is backed up; no customer session, platform message or activation runs.
"""
import ast,hashlib,json,os,shutil,subprocess,tempfile,time
from pathlib import Path

HERE=Path(__file__).resolve().parent
PULSE=Path('/opt/pulse-web')
EXPECTED={'codex_automation.py': '8735db5d39ec6470a7dc45306229aece6f0310ba22b7d20ad8aebe5c1ce8eb7f', 'funpay_telegram_fallback.py': 'e9c411b82047fe53964c7b0cb5741fd2a93fc515fe387ace99f837e2696b0b2e'}

def once(text,old,new):
    if text.count(old)!=1:raise ValueError('market_adapter_anchor_changed')
    return text.replace(old,new)

def method(text,name,change):
    tree=ast.parse(text);node=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name==name)
    lines=text.splitlines(keepends=True);start=sum(map(len,lines[:node.lineno-1]));end=sum(map(len,lines[:node.end_lineno]))
    original=text[start:end];return text[:start]+change(original)+text[end:]

def candidates(files):
    s=files['codex_automation.py']
    s=method(s,'_classify_title',lambda t:once(t,'        text = str(title or "")','        from market_aibuy import claude_title\n        candidate=claude_title(title)\n        if candidate:return candidate\n        text = str(title or "")'))
    s=method(s,'scan_orders',lambda t:once(t,'                product_type, package, key_pool = classified','                product_type, package, key_pool = classified\n                from market_aibuy import source_allowed\n                if product_type=="claude_pro" and not source_allowed("funpay",source_created_at,order["account_id"]):continue'))
    s=method(s,'_scan_funpay_paid_fallback',lambda t:once(t,'                product_type, package, key_pool = classified','                product_type, package, key_pool = classified\n                from market_aibuy import source_allowed\n                if product_type=="claude_pro" and not source_allowed("funpay",created_at,account_id):continue'))
    s=method(s,'_scan_playerok_orders',lambda t:once(t,'            if not created_at or created_at < cutoff:\n                continue','            if not created_at or created_at < cutoff:\n                continue\n            from market_aibuy import source_allowed\n            if product_type=="claude_pro" and not source_allowed("playerok",created_at,self.playerok_account_id):continue'))
    s=s.replace('product_type in ("chatgpt_plus", "chatgpt_go", "chatgpt_pro_5x")','product_type in ("chatgpt_plus", "chatgpt_go", "chatgpt_pro_5x", "claude_pro")')
    s=method(s,'_extract_customer_data',lambda t:t.replace('("supergrok_1m", "supergrok_3m")','("supergrok_1m", "supergrok_3m", "claude_pro")'))
    s=method(s,'_process_chat_messages',lambda t:t.replace('job["key_pool"] in GROK_WORKFLOWS','(job["key_pool"] in GROK_WORKFLOWS or job["product_type"]=="claude_pro")'))
    s=method(s,'_ensure_grok_instruction',lambda t:once(t,'    def _ensure_grok_instruction(self, job_id, messages):\n','    def _ensure_grok_instruction(self, job_id, messages):\n        with self.connect() as pre:\n            item=pre.execute("SELECT product_type FROM codex_jobs WHERE id=?",(job_id,)).fetchone()\n        if item and item[0]=="claude_pro":\n            from market_aibuy import instruction\n            return instruction(self,job_id,messages)\n'))
    s=method(s,'validate_job',lambda t:once(t,'        refund_guard(self,job_id)','        refund_guard(self,job_id)\n        from market_aibuy import handle as market_handle\n        if market_handle(self,int(job_id)):return'))
    s=method(s,'submit_job',lambda t:once(t,'        refund_guard(self,job_id)','        refund_guard(self,job_id)\n        from market_aibuy import submit_guard as market_submit_guard\n        if market_submit_guard(self,int(job_id)):return {"ok":True,"job_id":job_id}'))
    s=method(s,'_poll_aiee',lambda t:once(t,"AND key_pool NOT LIKE 'subscription_reserve_%'","AND key_pool NOT LIKE 'aibuy_market_%' AND key_pool NOT LIKE 'subscription_reserve_%'"))
    s=method(s,'_process_jobs_once',lambda t:once(t,'        self._poll_aiee()','        self._poll_aiee()\n        from market_aibuy import tick as market_tick\n        market_tick(self)'))
    s=s.replace('    "plus_free": "ChatGPT Plus · аккаунт Free",','    "claude_pro": "Claude Pro · 1 месяц",\n    "aibuy_market_claude_pro": "AI-BUY · Claude Pro",\n    **{f"aibuy_market_codex_{n}": f"AI-BUY · Codex {n}" for n in (250,500,1000)},\n    "plus_free": "ChatGPT Plus · аккаунт Free",')
    f=once(files['funpay_telegram_fallback.py'],"AND COALESCE(key_pool,'') NOT LIKE 'zovocard%'","AND COALESCE(key_pool,'') NOT LIKE 'zovocard%'\n                 AND COALESCE(key_pool,'') NOT LIKE 'aibuy_market_%'")
    out={'codex_automation.py':s,'funpay_telegram_fallback.py':f}
    for n,t in out.items():compile(t,n,'exec')
    return out

def atomic(target,text,mode=0o644,gid=0):
    fd,tmp=tempfile.mkstemp(dir=target.parent,prefix='.aibuy-market-')
    try:
        with os.fdopen(fd,'w') as f:os.fchown(f.fileno(),0,gid);os.fchmod(f.fileno(),mode);f.write(text);f.flush();os.fsync(f.fileno())
        os.replace(tmp,target)
    finally:
        if os.path.lexists(tmp):os.unlink(tmp)

def install():
    import pwd
    if os.geteuid()!=0 or HERE!=Path('/var/www/gptishka-new').resolve()/'ops/supplier-procurement':raise ValueError('clean_deployed_release_required')
    release=HERE.parent.parent
    if subprocess.check_output(['git','-C',str(release),'status','--porcelain'],text=True).strip():raise ValueError('clean_deployed_release_required')
    files={n:(PULSE/n).read_text() for n in EXPECTED}
    for n,t in files.items():
        if hashlib.sha256(t.encode()).hexdigest()!=EXPECTED[n]:raise ValueError('market_source_changed')
    output=candidates(files);who=pwd.getpwnam('gptishka-pulse')
    backup=PULSE/'data'/('aibuy-market-backup-'+str(int(time.time())));backup.mkdir(mode=0o700)
    for n in files:shutil.copy2(PULSE/n,backup/n)
    for n in ('market_aibuy.py','market_aibuy_common.py'):atomic(PULSE/n,(HERE/n).read_text())
    for n,t in output.items():atomic(PULSE/n,t)
    if not (PULSE/'data/aibuy-market.json').exists():atomic(PULSE/'data/aibuy-market.json',json.dumps({'enabled':False}),0o640,who.pw_gid)
    unit='''[Unit]
Description=GPTishka AI-BUY marketplace procurement broker
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=root
WorkingDirectory=/var/www/gptishka-new/ops/supplier-procurement
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/playerok-connector/venv/bin/python /var/www/gptishka-new/ops/supplier-procurement/aibuy-market.py
Restart=on-failure
RestartSec=5
UMask=0077
PrivateTmp=true
StandardOutput=null
StandardError=null
[Install]
WantedBy=multi-user.target
'''
    atomic(Path('/etc/systemd/system/gptishka-aibuy-market.service'),unit)
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','enable','--now','gptishka-aibuy-market.service'],check=True,capture_output=True)
    return {'installed':True,'enabled':False,'purchases_started':0,'activations_started':0,'backup':str(backup)}

if __name__=='__main__':print(json.dumps(install()))
