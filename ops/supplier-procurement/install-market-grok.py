"""Install exact AISOU Grok hooks from the clean deployed website release."""
import ast,datetime,hashlib,json,os,shutil,sqlite3,subprocess,tempfile
from pathlib import Path

BASE={'codex_automation.py':'d218037e1b2bb8da856903985885422b678de1ef2d14f2814248ede294596ee2',
 'funpay_telegram_fallback.py':'9efec7ad1d84cae9206ba3008ce5ac54e92b6b7614229d24ed97b514a00cc869',
 'market_stock_wait.py':'c72b07dbea5841b5d223d0e8bf0c53118224a9bfbaa6899c9c99d01c955b1fb7'}
AFTER={'codex_automation.py':'6162064d1221d6a9bdc3ffa03dbfa6c3199f26d75a971a86891e31e3875ab78e',
 'funpay_telegram_fallback.py':'6377b7ab7d031adab1c6a06a4676365c9238a28126e86318bb501e5f93c81c50'}
SERVICES=('pulse-chat-fallback.service','funpay-telegram-fallback.service','gptishka-aibuy-market.service')

def once(text,old,new):
 if text.count(old)!=1:raise ValueError('grok_anchor_changed')
 return text.replace(old,new)

def method(text,name,change):
 nodes=[n for n in ast.walk(ast.parse(text)) if isinstance(n,ast.FunctionDef) and n.name==name]
 if len(nodes)!=1:raise ValueError('grok_method_changed')
 n=nodes[0];lines=text.splitlines(keepends=True)
 return ''.join(lines[:n.lineno-1])+change(''.join(lines[n.lineno-1:n.end_lineno]))+''.join(lines[n.end_lineno:])

def candidate(text):
 markers=('from market_grok import classify as grok_classify','from market_grok import init as grok_init','from market_grok import handle as grok_handle','from market_grok import handle as grok_submit','from market_grok import tick as grok_tick')
 if all(m in text for m in markers):return text
 if any(m in text for m in markers):raise ValueError('grok_anchor_changed')
 text=once(text,'POOL_LABELS = {','POOL_LABELS = {\n    **{f"aisou_grok_{tier}":f"Grok {tier.title()} · 1 месяц · AISOU" for tier in ("plus","premium","super","ultra")},')
 text=method(text,'_classify_title',lambda s:once(s,'    def _classify_title(self, title):',
  '    def _classify_title(self, title):\n        from market_grok import classify as grok_classify,monthly_title,pool as grok_pool\n        grok=grok_classify(title)\n        if grok:return "grok_aisou",0,grok_pool(grok)\n        if monthly_title(title):return None'))
 def chat(s):
  s=once(s,'        ready_to_validate = []','        from market_grok import init as grok_init,capture_messages as grok_capture,scoped_messages as grok_messages\n        grok_init(self)\n        ready_to_validate = []')
  s=once(s,'                    job["order_id"], messages, job["anchor_message_id"],','                    job["order_id"], grok_messages(self,con,job,messages), job["anchor_message_id"],')
  s=once(s,'                if values["note_url"] or (','                grok_ready=grok_capture(self,con,job,messages,anchor)\n                if grok_ready or values["note_url"] or (')
  return once(s,'                elif (job["key_pool"] in GROK_WORKFLOWS or job["product_type"]=="claude_pro")','                elif (job["key_pool"] in GROK_WORKFLOWS or job["product_type"] in ("claude_pro","grok_aisou"))')
 text=method(text,'_process_chat_messages',chat)
 text=method(text,'_ensure_grok_instruction',lambda s:once(s,'        if item and item[0]=="claude_pro":',
  '        if item and item[0]=="grok_aisou":\n            from market_grok import instruction as grok_instruction\n            return grok_instruction(self,job_id,messages)\n        if item and item[0]=="claude_pro":'))
 text=method(text,'validate_job',lambda s:once(s,'        refund_guard(self,job_id)',
  '        refund_guard(self,job_id)\n        from market_grok import handle as grok_handle\n        if grok_handle(self,int(job_id)):return'))
 text=method(text,'submit_job',lambda s:once(s,'        refund_guard(self,job_id)',
  '        refund_guard(self,job_id)\n        from market_grok import handle as grok_submit\n        if grok_submit(self,int(job_id)):return {"ok":True,"job_id":job_id}'))
 text=method(text,'_poll_aiee',lambda s:once(s,"AND key_pool NOT LIKE 'aibuy_market_%'","AND key_pool NOT LIKE 'aisou_grok_%' AND key_pool NOT LIKE 'aibuy_market_%'"))
 text=method(text,'_process_jobs_once',lambda s:once(s,'        stock_wait_tick(self)',
  '        stock_wait_tick(self)\n        from market_grok import tick as grok_tick\n        grok_tick(self)'))
 for name in ('scan_orders','_scan_funpay_paid_fallback','_scan_playerok_orders'):
  text=method(text,name,lambda s:s.replace('product_type=="claude_pro" and not source_allowed','product_type in ("claude_pro","grok_aisou") and not source_allowed').replace('"chatgpt_pro_20x", "claude_pro") or key_pool in GROK_WORKFLOWS','"chatgpt_pro_20x", "claude_pro", "grok_aisou") or key_pool in GROK_WORKFLOWS'))
 text=once(text,"                     AND key_pool NOT IN ('zovocard_go_direct'","                     AND key_pool NOT LIKE 'aisou_grok_%' AND key_pool NOT IN ('zovocard_go_direct'")
 text=once(text,'                        else "SuperGrok" if job["key_pool"] in GROK_WORKFLOWS',
  '                        else "Grok "+str(job["key_pool"]).removeprefix("aisou_grok_").title() if job["product_type"]=="grok_aisou"\n                        else "SuperGrok" if job["key_pool"] in GROK_WORKFLOWS')
 compile(text,'codex_automation.py','exec');return text

def owner_candidate(text):
 if '"grok_aisou": "Grok · AISOU"' in text:return text
 return method(text,'activation_message',lambda s:once(s,'    labels = {','    labels = {\n        "grok_aisou": "Grok · AISOU",'))

def atomic(path,content,st):
 fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.grok-stock-')
 try:
  with os.fdopen(fd,'wb') as stream:
   os.fchown(stream.fileno(),st.st_uid,st.st_gid);os.fchmod(stream.fileno(),st.st_mode&0o777)
   stream.write(content);stream.flush();os.fsync(stream.fileno())
  os.replace(tmp,path)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)

def install(expected,apply=False):
 import fcntl
 here=Path(__file__).resolve().parent;release=here.parent.parent;root=Path('/opt/pulse-web')
 if os.geteuid()!=0 or release!=Path('/var/www/gptishka-new').resolve():raise ValueError('clean_deployed_release_required')
 sha=subprocess.check_output(['git','-C',str(release),'rev-parse','HEAD'],text=True).strip()
 if sha!=expected or subprocess.check_output(['git','-C',str(release),'status','--porcelain'],text=True).strip():raise ValueError('clean_deployed_release_required')
 before={n:(root/n).read_bytes() for n in BASE}
 files={'codex_automation.py':candidate(before['codex_automation.py'].decode()).encode(),
  'funpay_telegram_fallback.py':owner_candidate(before['funpay_telegram_fallback.py'].decode()).encode(),
  'market_stock_wait.py':(here/'market_stock_wait.py').read_bytes(),'market_grok.py':(here/'market_grok.py').read_bytes()}
 for name,content in files.items():compile(content,name,'exec')
 for name,content in before.items():
  allowed=(BASE[name],AFTER[name]) if name in AFTER else (BASE[name],hashlib.sha256(files[name]).hexdigest())
  if hashlib.sha256(content).hexdigest() not in allowed:raise ValueError('grok_source_drift')
 if not apply:return {'dryRun':True,'release':sha,'sourceVerified':True,'files':sorted(files)}
 with (root/'data/market-stock-wait-install.lock').open('a') as lock,open('/var/lib/gptishka-runtime/aibuy-procurement/account.lock','a') as broker:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(broker,fcntl.LOCK_EX|fcntl.LOCK_NB)
  def busy():
   with sqlite3.connect('file:'+str(root/'data/chat-activity.db')+'?mode=ro',uri=True) as c:
    return bool(c.execute("SELECT 1 FROM codex_jobs WHERE status IN ('validating','submitting') LIMIT 1").fetchone())
  if busy():raise ValueError('activation_busy_retry_later')
  backup=root/'data'/('grok-stock-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700)
  for name in files:
   if (root/name).exists():shutil.copy2(root/name,backup/name)
  stopped=[]
  try:
   for service in SERVICES:subprocess.run(['systemctl','stop',service],check=True,capture_output=True);stopped.append(service)
   if busy():raise ValueError('activation_busy_retry_later')
   for name,content in before.items():
    if (root/name).read_bytes()!=content:raise ValueError('grok_source_drift')
   for name,content in files.items():atomic(root/name,content,(root/name).stat() if (root/name).exists() else (root/'codex_automation.py').stat())
  except Exception:
   for name in files:
    if (backup/name).exists():atomic(root/name,(backup/name).read_bytes(),(backup/name).stat())
    elif (root/name).exists():(root/name).unlink()
   raise
  finally:
   for service in reversed(stopped):subprocess.run(['systemctl','start',service],check=True,capture_output=True)
 return {'installed':True,'release':sha,'backup':str(backup),'hashesMatch':all((root/n).read_bytes()==v for n,v in files.items()),
  'services':{s:subprocess.run(['systemctl','is-active','--quiet',s],capture_output=True).returncode==0 for s in SERVICES},'historicalJobsReplayed':0,'customerTestMessages':0}

if __name__=='__main__':
 import sys
 try:print(json.dumps(install(sys.argv[sys.argv.index('--sha')+1],apply='--apply' in sys.argv)))
 except Exception as error:
  reason=str(error) if str(error) in ('grok_anchor_changed','grok_method_changed','grok_source_drift','clean_deployed_release_required','activation_busy_retry_later') else 'grok_install_unconfirmed'
  print(json.dumps({'error':reason}));sys.exit(1)
