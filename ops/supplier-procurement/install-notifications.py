"""Apply only the reviewed notification predicate; preserve live security code.
Run after deploying the exact committed website release. No messages/payments.
"""
from pathlib import Path
import subprocess,sys,hashlib,os,tempfile,json,datetime,shutil
ROOT=Path(__file__).resolve().parents[2]
TARGET=Path('/opt/gptishka-telegram-monitor-bot/src/worker.mjs')
BASE='d09b6c695336de2a2bd546690248d4b5871181f7a5bfe020f4bc77aefd8d35dc'
def predicate(source):
 start=source.index('function requiresActivationKey(record) {')
 end=source.index('\n\nasync function pollActivationNotifications',start)
 return start,end,source[start:end]
def main():
 sha=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD']).decode().strip()
 live=subprocess.check_output(['git','-C','/var/www/gptishka-new','rev-parse','HEAD']).decode().strip()
 if sha!=live or '--sha' not in sys.argv or sys.argv[sys.argv.index('--sha')+1]!=sha:raise ValueError('committed_live_release_required')
 if subprocess.check_output(['git','-C',str(ROOT),'status','--porcelain','--untracked-files=no']).strip():raise ValueError('clean_release_required')
 original=TARGET.read_bytes();text=original.decode();start,end,_=predicate(text)
 desired=predicate((ROOT/'ops/telegram-monitor-bot/worker.mjs').read_text())[2]
 candidate=(text[:start]+desired+text[end:]).encode()
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
 return {'installed':True,'release':sha,'backup':str(backup),'onlyNotificationPredicateChanged':True}
if __name__=='__main__':print(json.dumps(main()))
