"""Add the shared manual-key adapter from a verified clean website release."""
import fcntl,hashlib,json,os,pwd,shutil,sqlite3,subprocess,tempfile,time
from datetime import datetime,timezone
from pathlib import Path

HERE=Path(__file__).resolve().parent
PULSE=Path('/opt/pulse-web')
BASE_HASH='e545a38b898c49c7c7f9219dbcd07ef30c322d3f294d1bd60817df3acb096872'
PRIOR_SHARED_HASH='7be0ab7bbd1dbabcadea6059f39051917745bdb18c4cfa5802c84cef4a1af317'
PRIOR_AISOU_HASH='3f3cc5934f3bee8edbc30c3e5f695592392eeb4dea73779b57ed8f7e264afacf'
PRIOR_INPUT_REASON_HASH='86c36cbda3ace6dd037adbc84a78b24fe2671af572b672c21d9f2f003e8ea537'
SERVICES=['pulse-chat-fallback.service','funpay-telegram-fallback.service','gptishka-aibuy-market.service']

def atomic(path,content,mode=0o644,gid=0):
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.shared-stock-')
    try:
        with os.fdopen(fd,'wb') as stream:
            os.fchown(stream.fileno(),0,gid);os.fchmod(stream.fileno(),mode)
            stream.write(content);stream.flush();os.fsync(stream.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.lexists(tmp):os.unlink(tmp)

def install():
    release=HERE.parent.parent
    if os.geteuid()!=0 or release!=Path('/var/www/gptishka-new').resolve():raise ValueError('clean_deployed_release_required')
    if subprocess.check_output(['git','-C',str(release),'status','--porcelain'],text=True).strip():raise ValueError('clean_deployed_release_required')
    source={name:(HERE/name).read_bytes() for name in ('market_aibuy.py','market_shared_stock.py')}
    actual=hashlib.sha256((PULSE/'market_aibuy.py').read_bytes()).hexdigest()
    if actual not in (BASE_HASH,PRIOR_SHARED_HASH,PRIOR_AISOU_HASH,PRIOR_INPUT_REASON_HASH,hashlib.sha256(source['market_aibuy.py']).hexdigest()):raise ValueError('market_source_changed')
    for name,content in source.items():compile(content,name,'exec')
    with open('/var/lib/gptishka-runtime/aibuy-procurement/account.lock','a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('supplier_busy_retry_later') from None
        backup=PULSE/'data'/('shared-stock-backup-'+str(int(time.time())));backup.mkdir(mode=0o700)
        cfg=PULSE/'data/codex-shared-stock.json'
        for name in source:
            if (PULSE/name).exists():shutil.copy2(PULSE/name,backup/name)
        if cfg.exists():shutil.copy2(cfg,backup/cfg.name)
        stopped=[]
        try:
            for service in SERVICES:
                subprocess.run(['systemctl','stop',service],check=True,capture_output=True);stopped.append(service)
            for name,content in source.items():atomic(PULSE/name,content)
            who=pwd.getpwnam('gptishka-pulse')
            if not cfg.exists():
                settings={'enabled':True,'enabledAfter':datetime.now(timezone.utc).isoformat()}
                atomic(cfg,json.dumps(settings).encode(),0o640,who.pw_gid)
            else:settings=json.loads(cfg.read_text())
            settings={**settings,'defaultActivationSite':'https://aiee.fun','codexAibuyFallback':False}
            atomic(cfg,json.dumps(settings).encode(),0o640,who.pw_gid)
            with sqlite3.connect(PULSE/'data/chat-activity.db') as c:
                c.execute("CREATE TABLE IF NOT EXISTS market_shared_stock(job_id INTEGER PRIMARY KEY,native_key_id TEXT NOT NULL UNIQUE,activation_site TEXT NOT NULL,sid TEXT NOT NULL DEFAULT '')")
        except Exception:
            for name in source:
                if (backup/name).exists():atomic(PULSE/name,(backup/name).read_bytes())
            if (backup/cfg.name).exists():atomic(cfg,(backup/cfg.name).read_bytes(),0o640,pwd.getpwnam('gptishka-pulse').pw_gid)
            elif cfg.exists():cfg.unlink()
            raise
        finally:
            for service in reversed(stopped):subprocess.run(['systemctl','start',service],check=True,capture_output=True)
    return {'installed':True,'enabled':settings.get('enabled') is True,'newOrdersAfter':settings.get('enabledAfter'),
        'services':{service:subprocess.run(['systemctl','is-active','--quiet',service],capture_output=True).returncode==0 for service in SERVICES},
        'hashesMatch':all((PULSE/name).read_bytes()==content for name,content in source.items()),'purchasesStartedByInstall':0,'activationsStartedByInstall':0}

if __name__=='__main__':
    try:print(json.dumps(install()))
    except Exception as error:
        safe=str(error) if str(error) in ('clean_deployed_release_required','market_source_changed','supplier_busy_retry_later') else 'shared_stock_install_unconfirmed'
        print(json.dumps({'error':safe}));raise SystemExit(1)
