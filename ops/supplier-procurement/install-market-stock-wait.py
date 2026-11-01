"""Guarded stock-wait hooks. Never alters routes, limits or historical jobs."""
import ast,datetime,hashlib,json,os,shutil,sqlite3,subprocess,tempfile
from pathlib import Path

BASE={
 'codex_automation.py':'639b1d6163e88244ac8b273e4d29819971cbfc38913db65bff99d216e19fa3c1',
 'subscription_reserve_auto.py':'34b7736d16f7c0da526f10117d2b0d364595b46b3481f52f7c813baf1d869f19',
 'market_aibuy.py':'c9fe837c531f1671b82378bc80b5d8edc40c8a9e2aba7c5e6f8fcc2609ddd828',
}
AFTER={
 'codex_automation.py':'d218037e1b2bb8da856903985885422b678de1ef2d14f2814248ede294596ee2',
 'subscription_reserve_auto.py':'264a6c07f16a5d2a70fe0d884598363769dd97fd1af7b0e7ebe8e5752dfef1df',
}
SERVICES=('pulse-chat-fallback.service','funpay-telegram-fallback.service')


def once(text,old,new):
 if text.count(old)!=1:raise ValueError('stock_wait_anchor_changed')
 return text.replace(old,new)


def method(text,name,change):
 tree=ast.parse(text)
 nodes=[n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name==name]
 if len(nodes)!=1:raise ValueError('stock_wait_method_changed')
 n=nodes[0];lines=text.splitlines(keepends=True);body=''.join(lines[n.lineno-1:n.end_lineno])
 return ''.join(lines[:n.lineno-1])+change(body)+''.join(lines[n.end_lineno:])


def codex_candidate(text):
 markers=('from market_stock_wait import StockUnavailable','from market_stock_wait import hold as stock_wait_hold','from market_stock_wait import defer as stock_wait_defer','from market_stock_wait import tick as stock_wait_tick')
 if all(x in text for x in markers):return text
 if any(x in text for x in markers):raise ValueError('stock_wait_anchor_changed')
 text=method(text,'_reserve_key',lambda s:once(s,'            raise ValueError(f"Нет доступных ключей: {POOL_LABELS.get(pool, pool)}")',
  '            from market_stock_wait import StockUnavailable\n            raise StockUnavailable(pool)'))
 text=method(text,'validate_job',lambda s:once(once(s,'        refund_guard(self,job_id)',
  '        refund_guard(self,job_id)\n        from market_stock_wait import hold as stock_wait_hold\n        if stock_wait_hold(self,int(job_id)):return'),
  '        except Exception as error:\n            with self.connect() as con:',
  '        except Exception as error:\n            from market_stock_wait import defer as stock_wait_defer\n            if stock_wait_defer(self,int(job_id),error):return\n            with self.connect() as con:'))
 text=method(text,'_process_jobs_once',lambda s:once(s,'        self._poll_aiee()',
  '        self._poll_aiee()\n        from market_stock_wait import tick as stock_wait_tick\n        stock_wait_tick(self)'))
 compile(text,'codex_automation.py','exec');return text


def reserve_candidate(text):
 if 'from market_stock_wait import notice as stock_wait_notice' in text:return text
 text=method(text,'notice',lambda s:once(s,'def notice(a,j,suffix,text):\n',
  "def notice(a,j,suffix,text):\n    if suffix=='empty' and j['platform'] in ('funpay','playerok'):\n        from market_stock_wait import notice as stock_wait_notice\n        return stock_wait_notice(a,j)\n"))
 compile(text,'subscription_reserve_auto.py','exec');return text


def atomic(target,content,st):
 fd,tmp=tempfile.mkstemp(dir=target.parent,prefix='.market-stock-wait-')
 try:
  with os.fdopen(fd,'wb') as stream:
   os.fchown(stream.fileno(),st.st_uid,st.st_gid);os.fchmod(stream.fileno(),st.st_mode&0o777)
   stream.write(content);stream.flush();os.fsync(stream.fileno())
  os.replace(tmp,target)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)


def install(expected,apply=False):
 import fcntl
 here=Path(__file__).resolve().parent;release=here.parent.parent;root=Path('/opt/pulse-web')
 if os.geteuid()!=0 or release!=Path('/var/www/gptishka-new').resolve():raise ValueError('committed_live_release_required')
 sha=subprocess.check_output(['git','-C',str(release),'rev-parse','HEAD'],text=True).strip()
 if sha!=expected or subprocess.check_output(['git','-C',str(release),'status','--porcelain'],text=True).strip():raise ValueError('committed_live_release_required')
 before={n:(root/n).read_bytes() for n in BASE}
 candidates={
  'codex_automation.py':codex_candidate(before['codex_automation.py'].decode()).encode(),
  'subscription_reserve_auto.py':reserve_candidate(before['subscription_reserve_auto.py'].decode()).encode(),
  'market_aibuy.py':(here/'market_aibuy.py').read_bytes(),
  'market_stock_wait.py':(here/'market_stock_wait.py').read_bytes(),
 }
 for n,content in candidates.items():compile(content,n,'exec')
 for n,content in before.items():
  actual=hashlib.sha256(content).hexdigest()
  allowed=(BASE[n],AFTER[n]) if n in AFTER else (BASE[n],hashlib.sha256(candidates[n]).hexdigest())
  if actual not in allowed:raise ValueError('stock_wait_source_drift')
 if all((root/n).is_file() and (root/n).read_bytes()==v for n,v in candidates.items()):return {'installed':True,'alreadyCurrent':True,'release':sha}
 if not apply:return {'dryRun':True,'release':sha,'sourceVerified':True,'files':sorted(candidates)}
 with (root/'data/market-stock-wait-install.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  with sqlite3.connect('file:'+str(root/'data/chat-activity.db')+'?mode=ro',uri=True) as c:
   if c.execute("SELECT 1 FROM codex_jobs WHERE status IN ('validating','submitting') LIMIT 1").fetchone():raise ValueError('activation_busy_retry_later')
  backup=root/'data'/('stock-wait-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700)
  for n in candidates:
   if (root/n).exists():shutil.copy2(root/n,backup/n)
  stopped=[]
  try:
   for service in SERVICES:
    subprocess.run(['systemctl','stop',service],check=True,capture_output=True);stopped.append(service)
   for n,content in before.items():
    if (root/n).read_bytes()!=content:raise ValueError('stock_wait_source_drift')
   for n,content in candidates.items():atomic(root/n,content,(root/n).stat() if (root/n).exists() else (root/'codex_automation.py').stat())
  except Exception:
   for n in candidates:
    if (backup/n).exists():atomic(root/n,(backup/n).read_bytes(),(backup/n).stat())
    elif n not in before and (root/n).exists():(root/n).unlink()
   raise
  finally:
   for service in reversed(stopped):subprocess.run(['systemctl','start',service],check=True,capture_output=True)
 return {'installed':True,'release':sha,'backup':str(backup),'hashesMatch':all((root/n).read_bytes()==v for n,v in candidates.items()),
  'services':{s:subprocess.run(['systemctl','is-active','--quiet',s],capture_output=True).returncode==0 for s in SERVICES},'historicalJobsReplayed':0,'customerTestMessages':0}


if __name__=='__main__':
 import sys
 try:print(json.dumps(install(sys.argv[sys.argv.index('--sha')+1],apply='--apply' in sys.argv)))
 except Exception as error:
  reason=str(error) if str(error) in ('stock_wait_source_drift','stock_wait_anchor_changed','stock_wait_method_changed','committed_live_release_required','activation_busy_retry_later') else 'stock_wait_install_unconfirmed'
  print(json.dumps({'error':reason}));sys.exit(1)
