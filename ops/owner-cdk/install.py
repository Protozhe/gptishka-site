"""Add owner CDK UI to the existing sole Telegram consumer, from a clean release."""
from pathlib import Path
import datetime,hashlib,json,os,shutil,sqlite3,subprocess,tempfile
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
BOT=Path('/opt/gptishka-telegram-monitor-bot/src/worker.mjs')
STOCK=Path('/opt/pulse-web/market_stock_wait.py')
BOT_BASE='551941c4c0d4e58ae3d0f7ca5d82e5d8f9e35c57b0400fb03f20ebdc20ceb5b6'
STOCK_BASE='db343630927c97ccffc9409f5d5118f7dfc516912017ca3743ffce7475164bd6'
BOT_AFTER='d9c736ffebc88b507c21fc68a6c6fef89b5f6a6c60bac5ef1b24f27c9f89f86a'

def once(source,old,new):
 if source.count(old)!=1:raise ValueError('owner_cdk_anchor_changed')
 return source.replace(old,new)

def transform(source):
 if 'const ownerCdkUi = createOwnerCdkUi(' in source:return source
 source='import { createOwnerCdkUi } from "/var/www/gptishka-new/ops/owner-cdk/telegram.mjs";\n'+source
 source=once(source,'function adminKeyboard() {','const ownerCdkUi = createOwnerCdkUi({send, answer:(id,text)=>tg("answerCallbackQuery",{callback_query_id:id,text}), botId:BOT_TOKEN.split(":")[0]});\n\nfunction adminKeyboard() {')
 source=once(source,'      [{ text: "💰 AI-BUY · Пополнить", callback_data: "aib:open" }],','      [{ text: "📥 Добавить CDK", callback_data: "cdk:open" }],\n      [{ text: "💰 AI-BUY · Пополнить", callback_data: "aib:open" }],')
 source=once(source,'  if (await aibuyTopupUi.handleMessage(message)) return;','  if (await ownerCdkUi.handleMessage(message)) return;\n  if (await aibuyTopupUi.handleMessage(message)) return;')
 source=once(source,'  if (await aibuyTopupUi.handleCallback(query)) return;','  if (await ownerCdkUi.handleCallback(query)) return;\n  if (await aibuyTopupUi.handleCallback(query)) return;')
 return once(source,'      { command: "aibuy", description: "Пополнить баланс AI-BUY" },','      { command: "cdk", description: "Добавить ключи активации" },\n      { command: "aibuy", description: "Пополнить баланс AI-BUY" },')

def atomic(target,content,st):
 fd,tmp=tempfile.mkstemp(dir=target.parent,prefix='.owner-cdk-')
 try:
  with os.fdopen(fd,'wb') as f:
   os.fchown(f.fileno(),st.st_uid,st.st_gid);os.fchmod(f.fileno(),st.st_mode&0o777);f.write(content);f.flush();os.fsync(f.fileno())
  os.replace(tmp,target)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)

def install(expected,apply=False):
 import fcntl,pwd
 if os.geteuid()!=0 or ROOT!=Path('/var/www/gptishka-new').resolve():raise ValueError('clean_live_release_required')
 sha=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()
 if sha!=expected or subprocess.check_output(['git','-C',str(ROOT),'status','--porcelain'],text=True).strip():raise ValueError('clean_live_release_required')
 before={BOT:BOT.read_bytes(),STOCK:STOCK.read_bytes()};candidate=transform(before[BOT].decode()).encode();stock=(ROOT/'ops/supplier-procurement/market_stock_wait.py').read_bytes()
 if hashlib.sha256(before[BOT]).hexdigest() not in (BOT_BASE,BOT_AFTER) or hashlib.sha256(before[STOCK]).hexdigest() not in (STOCK_BASE,hashlib.sha256(stock).hexdigest()):raise ValueError('owner_cdk_source_drift')
 subprocess.run(['node','--check','--input-type=module','-'],input=candidate,capture_output=True,check=True);compile(stock,'market_stock_wait.py','exec')
 owner=json.loads(Path('/var/lib/gptishka-runtime/supplier-secrets/aibuy-topup-owner.json').read_text())
 ui=json.loads(Path('/var/lib/gptishka-runtime/aibuy-topup-ui/config.json').read_text())
 mfa=json.loads(Path('/etc/gptishka-admin-mfa.json').read_text())
 if str(owner['telegramId'])!=str(ui['telegramId']) or str(mfa['users'].get(owner['userId'],''))!=str(owner['telegramId']):raise ValueError('owner_binding_unconfirmed')
 if not subprocess.run(['systemctl','is-active','--quiet','gptishka-aibuy-topup.service'],capture_output=True).returncode==0:raise ValueError('owner_bridge_unavailable')
 if not apply:return {'dryRun':True,'release':sha,'ownerBindingVerified':True,'sourceVerified':True,'newConsumers':0}
 with open('/opt/pulse-web/data/market-stock-wait-install.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  with sqlite3.connect('file:/opt/pulse-web/data/chat-activity.db?mode=ro',uri=True) as c:
   if c.execute("SELECT 1 FROM codex_jobs WHERE status IN ('validating','submitting') LIMIT 1").fetchone():raise ValueError('activation_busy_retry_later')
  backup=Path('/var/lib/gptishka-runtime/monitor-backups')/('owner-cdk-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,mode=0o700)
  shutil.copy2(BOT,backup/'worker.mjs');shutil.copy2(STOCK,backup/'market_stock_wait.py')
  who=pwd.getpwnam('gptishka-notifiers');state=Path('/var/lib/gptishka-runtime/owner-cdk-ui/state');state.mkdir(parents=True,mode=0o700,exist_ok=True);os.chown(state,who.pw_uid,who.pw_gid);os.chmod(state,0o700)
  private=Path('/var/lib/gptishka-runtime/owner-cdk-private');private.mkdir(mode=0o700,exist_ok=True);os.chown(private,0,0);os.chmod(private,0o700)
  services=('pulse-chat-fallback.service','funpay-telegram-fallback.service');stopped=[]
  try:
   for service in services:subprocess.run(['systemctl','stop',service],capture_output=True,check=True);stopped.append(service)
   for target,content in before.items():
    if target.read_bytes()!=content:raise ValueError('owner_cdk_source_drift')
   atomic(BOT,candidate,BOT.stat());atomic(STOCK,stock,STOCK.stat())
   subprocess.run(['systemctl','restart','gptishka-aibuy-topup.service'],capture_output=True,check=True)
   subprocess.run(['pm2','restart','gptishka-monitor-bot'],capture_output=True,check=True,timeout=35)
  except Exception:
   for target,content in before.items():atomic(target,content,target.stat())
   subprocess.run(['pm2','restart','gptishka-monitor-bot'],capture_output=True,timeout=35);raise
  finally:
   for service in reversed(stopped):subprocess.run(['systemctl','start',service],capture_output=True,check=True)
 return {'installed':True,'release':sha,'backup':str(backup),'ownerOnly':True,'newConsumers':0,'keysImportedByInstaller':0,'customerTestMessages':0,'hashesMatch':BOT.read_bytes()==candidate and STOCK.read_bytes()==stock}

if __name__=='__main__':
 import sys
 try:print(json.dumps(install(sys.argv[sys.argv.index('--sha')+1],apply='--apply' in sys.argv)))
 except Exception as error:
  reason=str(error) if str(error) in ('owner_cdk_anchor_changed','owner_cdk_source_drift','clean_live_release_required','owner_binding_unconfirmed','owner_bridge_unavailable','activation_busy_retry_later') else 'owner_cdk_install_unconfirmed'
  print(json.dumps({'error':reason}));sys.exit(1)
