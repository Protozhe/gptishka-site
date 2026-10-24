"""Deploy committed runtime integrations after a successful website release.
Dry-run by default. It never submits an activation, buys keys or changes a limit.
"""
from pathlib import Path
import json,hashlib,base64,os,pwd,grp,subprocess,datetime,tempfile,shutil,sys,fcntl
HERE=Path(__file__).resolve().parent;RELEASE=HERE.parent.parent
PULSE={'subscription_reserve_auto.py':'reserve-auto.py','/opt/gptishka-reserve-site/helper.cjs':'reserve-helper.cjs','claude_zovo_broker.py':'claude-broker.py','/opt/pulse-web/aisou_stock.py':'../supplier-procurement/pulse-stock.py','/etc/systemd/system/gptishka-claude-zovo.service':'claude-zovo.service'}
PULSE_BASE={'subscription_reserve_auto.py':'1b5155de246d9d52b8f803e6bf4c85f1979d45473526b91bddd116bfbd7ef04c','/opt/gptishka-reserve-site/helper.cjs':'bf38b746aef78489b89d578a47d135a22cdb6d0e8796991807c4504c062a8fa6','/opt/pulse-web/aisou_stock.py':'cb0de2a63c001777d1770e1c107b1bee6987bd8c14686e1a9bab1d83893cf757'}
GATEWAY={'zovocard_gateway.py':'gateway.py','zovocard_claude.py':'claude-worker.py','zovocard_claude_gateway.py':'claude-gateway.py','zovocard_card_pool.py':'card-pool.py','zovocard_settled_cost.py':'settled-cost.py'}
PRO=['chatgpt-pro-5x-1','chatgpt-pro-20x-1','chatgpt-pro-25x-1'];GROK=['grok-'+x+'-1' for x in ('plus','premium','super','ultra')]
SSH=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/root/.ssh/pulse_zovocard_known_hosts','-o','ConnectTimeout=10','-i','/root/.ssh/playerok_de_ed25519','root@91.108.242.137','/opt/pulse-zovocard/venv/bin/python -']

def command(args,**kw):
 p=subprocess.run(args,capture_output=True,timeout=90,**kw)
 if p.returncode:raise ValueError('runtime_command_failed')
 return p.stdout
def catalog(mode,backup=None):return json.loads(command(['node',str(HERE/'catalog-command.cjs'),mode]+([str(backup)] if backup else [])).decode())
def remote(payload):
 script='PAYLOAD='+repr(payload)+'\n'+(HERE/'install-gateway.py').read_text()
 return json.loads(command(SSH,input=script.encode()).decode())
def atomic(target,b,mode=0o644,uid=0,gid=0):
 target=Path(target);fd,tmp=tempfile.mkstemp(dir=target.parent,prefix='.subscription-')
 with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
 os.chown(tmp,uid,gid);os.chmod(tmp,mode);os.replace(tmp,target)
def main(apply=False):
 if os.geteuid()!=0:raise ValueError('root_required')
 sha=command(['git','-C',str(RELEASE),'rev-parse','HEAD']).decode().strip()
 live=command(['git','-C','/var/www/gptishka-new','rev-parse','HEAD']).decode().strip()
 if sha!=live or command(['git','-C',str(RELEASE),'status','--porcelain','--untracked-files=no']).strip():raise ValueError('committed_live_release_required')
 expected=sys.argv[sys.argv.index('--sha')+1] if '--sha' in sys.argv else ''
 if sha!=expected:raise ValueError('release_sha_required')
 info=catalog('inspect');products={x['slug']:x['id'] for x in info['claudeProducts']}
 cutoff=datetime.datetime.now(datetime.timezone.utc).isoformat()
 native=Path('/var/lib/gptishka-runtime/subscription-routes.json')
 if native.exists():cutoff=json.loads(native.read_text())['claude']['enabledAfter']
 candidates={str(Path(n) if n.startswith('/') else Path('/opt/pulse-web')/n):(HERE/src).read_bytes() for n,src in PULSE.items()}
 for n,b in candidates.items():
  base=PULSE_BASE.get(n,PULSE_BASE.get(Path(n).name));actual=hashlib.sha256(Path(n).read_bytes()).hexdigest() if Path(n).exists() else None
  if actual!=hashlib.sha256(b).hexdigest() and actual!=base:raise ValueError('pulse_source_drift:'+Path(n).name)
  if n.endswith('.py'):compile(b,n,'exec')
  if n.endswith('.cjs'):
   p=subprocess.run(['node','--check','-'],input=b,capture_output=True)
   if p.returncode:raise ValueError('runtime_syntax_failed')
 payload={'apply':apply,'cutoff':cutoff,'product_ids':products,'baseline':json.loads((HERE/'runtime-baseline.json').read_text()),'files':{n:base64.b64encode((HERE/f).read_bytes()).decode() for n,f in GATEWAY.items()}}
 gw=remote({**payload,'apply':False})
 # Confirm broker identity can read finance policy and open the accounting DB, without writes.
 command(['runuser','-u','gptishka-pulse','--','/opt/playerok-connector/venv/bin/python','-c',"import sqlite3,sys;sys.path.insert(0,'/opt/pulse-profit');import finance_guard;finance_guard.load_policy();sqlite3.connect('file:/opt/pulse-profit/data/profit.db?mode=rw',uri=True).close()"])
 if not apply:return {'dryRun':True,'release':sha,'catalog':info,'gateway':gw,'claudeCutoff':cutoff,'primaryFiles':sorted(candidates)}
 home=Path('/var/lib/gptishka-runtime/subscription-backups');home.mkdir(mode=0o700,exist_ok=True)
 backup=home/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700)
 cfgpaths=[native,Path('/var/lib/gptishka-runtime/supplier-secrets/policy.json'),Path('/opt/pulse-web/data/subscription-reserve.json'),Path('/opt/pulse-web/data/aisou-procurement.json')]
 originals={};manifest={'release':sha,'originals':originals}
 for i,p in enumerate([*map(Path,candidates),*cfgpaths]):
  saved=backup/str(i)
  if p.exists():shutil.copy2(p,saved);os.chmod(saved,0o600);originals[str(p)]={'saved':str(saved),'mode':p.stat().st_mode&0o777,'uid':p.stat().st_uid,'gid':p.stat().st_gid}
  else:originals[str(p)]=None
 (backup/'manifest.json').write_text(json.dumps(manifest))
 try:
  gw=remote(payload);manifest['gateway']=gw
  for n,b in candidates.items():atomic(n,b)
  catalog('apply',backup/'catalog.json')
  webgid=grp.getgrnam('gptishka-web').gr_gid
  for p in cfgpaths:
   cfg=json.loads(p.read_text()) if p.exists() else {}
   if p==native:
    cfg.setdefault('claude',{'enabled':True,'enabledAfter':gw['claudeCutoff']})
   elif p.name=='subscription-reserve.json':
    dates=cfg.setdefault('product_enabled_after',{})
    for product in ('chatgpt_pro_5x','chatgpt_pro_20x','chatgpt_pro_25x'):dates.setdefault(product,cutoff)
   else:
    for slug in PRO+GROK:
     if slug not in cfg.setdefault('products',[]):cfg['products'].append(slug)
     cfg.setdefault('productEnabledAfter',{}).setdefault(slug,cutoff)
   st=p.stat() if p.exists() else None
   atomic(p,(json.dumps(cfg,indent=2)+'\n').encode(),st.st_mode&0o777 if st else 0o640,st.st_uid if st else 0,st.st_gid if st else webgid)
  command(['systemctl','daemon-reload']);command(['systemctl','restart','gptishka-reserve-site.service']);command(['systemctl','enable','--now','gptishka-claude-zovo.service'])
  for unit in ('gptishka-reserve-site.service','gptishka-claude-zovo.service'):command(['systemctl','is-active',unit])
  manifest['installed']={n:hashlib.sha256(Path(n).read_bytes()).hexdigest() for n in originals}
  (backup/'manifest.json').write_text(json.dumps(manifest))
 except Exception:
  if (backup/'catalog.json').exists():catalog('rollback',backup/'catalog.json')
  if gw.get('backup'):remote({'rollback':gw['backup']})
  command(['systemctl','stop','gptishka-claude-zovo.service'])
  for p,old in originals.items():
   if old:atomic(p,Path(old['saved']).read_bytes(),old['mode'],old['uid'],old['gid'])
   else:Path(p).unlink(missing_ok=True)
  command(['systemctl','daemon-reload']);command(['systemctl','restart','gptishka-reserve-site.service'])
  manifest['rolledBack']=True;(backup/'manifest.json').write_text(json.dumps(manifest));raise
 return {'installed':True,'release':sha,'backup':str(backup),'gatewayBackup':gw['backup'],'claudeCutoff':gw['claudeCutoff'],'newGrok':info['prices'],'noFinancialOperations':True}

if __name__=='__main__':
 with open('/var/lib/gptishka-runtime/subscription-routes-install.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  print(json.dumps(main('--apply' in sys.argv)))
