"""Install reviewed owner-only bot UI without replacing live bot security code."""
from pathlib import Path
import datetime,hashlib,json,os,re,shutil,subprocess,sys,tempfile
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
TARGET=Path('/opt/gptishka-telegram-monitor-bot/src/worker.mjs')
BASE='0cc05e1ae1a6153559c60b8dddd88cc661b96201fa603fca00b5daadb180c037'
MARKER='// AI-BUY owner top-up UI'

def transform(source):
 if MARKER in source:return source
 source='import { createAibuyTopupUi } from "/var/www/gptishka-new/ops/supplier-procurement/aibuy-telegram.mjs";\n'+source
 anchor='function adminKeyboard() {'
 if source.count(anchor)!=1:raise ValueError('monitor_menu_anchor')
 source=source.replace(anchor,MARKER+'\nconst aibuyTopupUi = createAibuyTopupUi({send, answer:(id,text)=>tg("answerCallbackQuery",{callback_query_id:id,text})});\n\n'+anchor)
 anchor='      [{ text: "🌐 Открыть веб-админку", url: WEB_ADMIN_URL }],'
 if source.count(anchor)!=1:raise ValueError('monitor_keyboard_anchor')
 source=source.replace(anchor,'      [{ text: "💰 AI-BUY · Пополнить", callback_data: "aib:open" }],\n'+anchor)
 pattern=r'(  if \(!isAllowed\(userId\)\) return send\(chatId, [^\n]+\);\n)'
 source,count=re.subn(pattern,r'\1  if (await aibuyTopupUi.handleMessage(message)) return;\n',source)
 if count!=1:raise ValueError('monitor_message_anchor')
 anchor='  await tg("answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});'
 if source.count(anchor)!=1:raise ValueError('monitor_callback_anchor')
 source=source.replace(anchor,'  if (await aibuyTopupUi.handleCallback(query)) return;\n'+anchor)
 anchor='      { command: "server", description: "Состояние сервера" },'
 if source.count(anchor)!=1:raise ValueError('monitor_commands_anchor')
 return source.replace(anchor,anchor+'\n      { command: "aibuy", description: "Пополнить баланс AI-BUY" },')

def atomic(file,content,mode,gid=0,uid=0):
 fd,tmp=tempfile.mkstemp(dir=file.parent,prefix='.aibuy-')
 try:
  with os.fdopen(fd,'w') as f:os.fchmod(f.fileno(),mode);os.fchown(f.fileno(),uid,gid);f.write(content);f.flush();os.fsync(f.fileno())
  os.replace(tmp,file)
 finally:
  if os.path.lexists(tmp):os.unlink(tmp)

def main():
 import pwd
 sha=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()
 if ROOT!=Path('/var/www/gptishka-new').resolve() or '--sha' not in sys.argv or sys.argv[sys.argv.index('--sha')+1]!=sha:raise ValueError('committed_live_release_required')
 if subprocess.check_output(['git','-C',str(ROOT),'status','--porcelain','--untracked-files=no']).strip():raise ValueError('clean_release_required')
 original=TARGET.read_bytes();source=original.decode();candidate=transform(source).encode()
 if original!=candidate and hashlib.sha256(original).hexdigest()!=BASE:raise ValueError('monitor_source_drift')
 subprocess.run(['node','--check','--input-type=module','-'],input=candidate,capture_output=True,check=True)
 mfa=json.loads(Path('/etc/gptishka-admin-mfa.json').read_text())
 apps=json.loads(subprocess.check_output(['pm2','jlist']));app=next(x for x in apps if x['name']=='gptishka-monitor-bot');botenv={}
 for e in Path('/proc/'+str(app['pid'])+'/environ').read_bytes().split(b'\0'):
  if b'=' in e:
   k,v=e.split(b'=',1);botenv[k.decode()]=v.decode()
 admins={s.strip() for s in botenv.get('TELEGRAM_MONITOR_ADMIN_IDS','').split(',')}
 js="""const {prisma}=require('./apps/admin-backend/dist/config/prisma.js');(async()=>{const owners=await prisma.user.findMany({where:{isActive:true,role:{code:'OWNER'}},select:{id:true}});console.log(JSON.stringify(owners.map(x=>x.id)))})().catch(()=>process.exitCode=1).finally(()=>prisma.$disconnect());"""
 p=subprocess.run(['/usr/bin/node','-e',js],text=True,capture_output=True,cwd=ROOT,timeout=30)
 if p.returncode:raise ValueError('owner_read_unconfirmed')
 owners=[{'userId':u,'telegramId':str(mfa['users'].get(u,''))} for u in json.loads(p.stdout) if str(mfa['users'].get(u,'')) in admins]
 if len(owners)!=1 or not re.fullmatch(r'[1-9][0-9]{0,19}',owners[0]['telegramId']):raise ValueError('unique_owner_binding_required')
 if '--apply' not in sys.argv:return {'dryRun':True,'sourceVerified':True,'uniqueOwnerVerified':True,'release':sha}
 who=pwd.getpwnam('gptishka-notifiers');ui=Path('/var/lib/gptishka-runtime/aibuy-topup-ui');ui.mkdir(mode=0o750,exist_ok=True);os.chown(ui,0,who.pw_gid);os.chmod(ui,0o750)
 state=ui/'state';state.mkdir(mode=0o700,exist_ok=True);os.chown(state,who.pw_uid,who.pw_gid);os.chmod(state,0o700)
 atomic(Path('/var/lib/gptishka-runtime/supplier-secrets/aibuy-topup-owner.json'),json.dumps(owners[0]),0o600)
 atomic(ui/'config.json',json.dumps({'telegramId':owners[0]['telegramId']}),0o440,who.pw_gid)
 unit='''[Unit]
Description=GPTishka AI-BUY owner unpaid top-up invoices
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=root
WorkingDirectory=/var/www/gptishka-new
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/playerok-connector/venv/bin/python /var/www/gptishka-new/ops/supplier-procurement/aibuy-topup-server.py
Restart=on-failure
RestartSec=5
UMask=0077
PrivateTmp=true
StandardOutput=null
StandardError=null
[Install]
WantedBy=multi-user.target
'''
 atomic(Path('/etc/systemd/system/gptishka-aibuy-topup.service'),unit,0o644)
 subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','gptishka-aibuy-topup.service'],check=True,capture_output=True)
 backup=Path('/var/lib/gptishka-runtime/monitor-backups')/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');backup.mkdir(parents=True,mode=0o700)
 shutil.copy2(TARGET,backup/'worker.mjs');os.chmod(backup/'worker.mjs',0o600)
 st=TARGET.stat();atomic(TARGET,candidate.decode(),st.st_mode&0o777,st.st_gid,st.st_uid)
 try:subprocess.run(['pm2','restart','gptishka-monitor-bot'],check=True,capture_output=True,timeout=30)
 except Exception:
  atomic(TARGET,source,st.st_mode&0o777,st.st_gid,st.st_uid);subprocess.run(['pm2','restart','gptishka-monitor-bot'],capture_output=True,timeout=30);raise
 (backup/'manifest.json').write_text(json.dumps({'release':sha,'before':hashlib.sha256(original).hexdigest(),'after':hashlib.sha256(candidate).hexdigest()}))
 return {'installed':True,'release':sha,'ownerOnly':True,'invoicesCreated':0,'paymentsStarted':0}

if __name__=='__main__':
 try:print(json.dumps(main()))
 except Exception as e:
  code=str(e);print(json.dumps({'error':code if re.fullmatch(r'[a-z_]{1,70}',code) else 'installation_unconfirmed'}));raise SystemExit(1)
