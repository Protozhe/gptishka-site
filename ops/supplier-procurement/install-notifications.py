"""Apply only the reviewed notification rules; preserve live security code.
Run after deploying the exact committed website release. No messages/payments.
"""
from pathlib import Path
import subprocess,sys,hashlib,os,tempfile,json,datetime,shutil
ROOT=Path(__file__).resolve().parents[2]
TARGET=Path('/opt/gptishka-telegram-monitor-bot/src/worker.mjs')
BASE='85a4d83942340865f13c55aead16dacbe28c4d4cd4d0206fa735cfb9a28210f6'
def predicate(source):
 start=source.index('function requiresActivationKey(record) {')
 end=source.index('\n\nasync function pollActivationNotifications',start)
 return start,end,source[start:end]
def transform(source,committed):
 start,end,_=predicate(source)
 result=source[:start]+predicate(committed)[2]+source[end:]
 old='      await notifyAdmins(await activationNotification(record, current));'
 new='      if (!hasZovocardStatusNotifier(record)) await notifyAdmins(await activationNotification(record, current));'
 if committed.count(new)!=1:raise ValueError('notification_source_anchor')
 if result.count(new)==1 and old not in result:return result
 if result.count(old)!=1 or new in result:raise ValueError('notification_call_anchor')
 return result.replace(old,new)
def main():
 sha=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD']).decode().strip()
 live=subprocess.check_output(['git','-C','/var/www/gptishka-new','rev-parse','HEAD']).decode().strip()
 if sha!=live or '--sha' not in sys.argv or sys.argv[sys.argv.index('--sha')+1]!=sha:raise ValueError('committed_live_release_required')
 if subprocess.check_output(['git','-C',str(ROOT),'status','--porcelain','--untracked-files=no']).strip():raise ValueError('clean_release_required')
 original=TARGET.read_bytes()
 candidate=transform(original.decode(),(ROOT/'ops/telegram-monitor-bot/worker.mjs').read_text()).encode()
 oldhash=hashlib.sha256(original).hexdigest()
 if original==candidate:return {'installed':True,'alreadyCurrent':True,'release':sha}
 if oldhash!=BASE:raise ValueError('monitor_source_drift')
 subprocess.run(['node','--check','--input-type=module','-'],input=candidate,capture_output=True,check=True)
 if '--apply' not in sys.argv:return {'dryRun':True,'release':sha,'sourceVerified':True}
 backup=Path('/var/lib/gptishka-runtime/monitor-backups')/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
 backup.mkdir(mode=0o700,parents=True);shutil.copy2(TARGET,backup/'worker.mjs');os.chmod(backup/'worker.mjs',0o600)
 st=TARGET.stat();fd,tmp=tempfile.mkstemp(dir=TARGET.parent,prefix='.notification-')
 with os.fdopen(fd,'wb') as f:f.write(candidate);f.flush();os.fsync(f.fileno())
 os.chown(tmp,st.st_uid,st.st_gid);os.chmod(tmp,st.st_mode&0o777);os.replace(tmp,TARGET)
 try:subprocess.run(['pm2','restart','gptishka-monitor-bot'],capture_output=True,check=True,timeout=30)
 except Exception:
  TARGET.write_bytes(original);os.chown(TARGET,st.st_uid,st.st_gid);os.chmod(TARGET,st.st_mode&0o777)
  subprocess.run(['pm2','restart','gptishka-monitor-bot'],capture_output=True,timeout=30);raise
 (backup/'manifest.json').write_text(json.dumps({'release':sha,'before':oldhash,'after':hashlib.sha256(candidate).hexdigest()}))
 return {'installed':True,'release':sha,'backup':str(backup),'onlyNotificationRulesChanged':True}
if __name__=='__main__':print(json.dumps(main()))
