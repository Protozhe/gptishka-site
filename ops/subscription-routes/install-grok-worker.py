"""Install only reviewed Grok modules while the shared gateway is idle."""
import base64,datetime,fcntl,hashlib,json,os,shutil,tempfile
from pathlib import Path
GATEWAY_SHA='1d5f9262be79f5dea9f415681ffd8848bdfb683b9b630a2a26baf6d738ea1ba7'
HOOK="""        if isinstance(action,str) and action.startswith('grok_'):
            from zovocard_grok_gateway import handle
            config=json.loads((ROOT/'config.json').read_text())
            cipher=Fernet((ROOT/'data/secret.key').read_bytes())
            print(json.dumps(handle(request,ROOT,config,cipher)));return
"""
ANCHOR="        if action == 'retry_declined':"
BASE={
 'zovocard_claude.py':'f9048c238ed5bf3ebbb78625331fd32c351f4c255e2b8e907771651925d66b1a',
 'zovocard_card_pool.py':'e06bd53f946cb22d59d20369992a2320aff6b955b96b963510a7156999d998f4',
 'zovocard_settled_cost.py':'3cef9fdc306715630a4910d5c766506bdecd2cd6cb376ab1965c222c8101dfeb',
}
DEPENDENCIES={
 'zovocard_direct_worker.py':'5b26ebe3f02d09769ce84ba16a5f7638af18a17d3c863be5e9a31a248830a0e5',
 'zovocard_direct_transport.py':'5cda0cf0349ca189662fcda4b2253b695c941ee6071e87ef8aaad75f1967688e',
}

def patch_gateway(source,expected=GATEWAY_SHA):
    original=source.replace(HOOK,'',1) if HOOK in source else source
    if hashlib.sha256(original.encode()).hexdigest()!=expected or original.count(ANCHOR)!=1:raise ValueError('gateway_source_drift')
    return original.replace(ANCHOR,HOOK+ANCHOR,1)

def atomic(path,data,reference=None):
    ref=path if path.exists() else reference
    st=ref.stat();fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.grok-')
    with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    os.chmod(tmp,st.st_mode&0o777);os.chown(tmp,st.st_uid,st.st_gid);os.replace(tmp,path)

def install(payload):
    root=Path('/opt/pulse-zovocard');app=root/'app'
    with (root/'data/gateway.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('gateway_busy_retry_later') from None
        if payload.get('rollback'):
            backup=Path(payload['rollback']).resolve()
            if backup.parent!=root/'data' or not backup.name.startswith('grok-backup-'):raise ValueError('invalid_backup')
            manifest=json.loads((backup/'manifest.json').read_text())
            for target,digest in manifest['installed'].items():
                if hashlib.sha256(Path(target).read_bytes()).hexdigest()!=digest:raise ValueError('rollback_source_drift')
            for target,saved in manifest['originals'].items():
                p=Path(target)
                if saved:atomic(p,Path(saved).read_bytes())
                else:p.unlink(missing_ok=True)
            return {'rolledBack':True}
        files={name:base64.b64decode(value) for name,value in payload['files'].items()}
        for name,digest in DEPENDENCIES.items():
            if hashlib.sha256((app/name).read_bytes()).hexdigest()!=digest:raise ValueError('worker_dependency_drift')
        if set(files)!=set(BASE)|{'zovocard_grok.py','zovocard_grok_gateway.py'}:raise ValueError('worker_payload_invalid')
        gateway=app/'zovocard_gateway.py';files['zovocard_gateway.py']=patch_gateway(gateway.read_text()).encode()
        for name,data in files.items():
            target=app/name;actual=hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
            if name in BASE and actual not in (BASE[name],hashlib.sha256(data).hexdigest()):raise ValueError('worker_source_drift')
            if name.startswith('zovocard_grok') and actual not in (None,hashlib.sha256(data).hexdigest()):raise ValueError('grok_source_drift')
            compile(data,name,'exec')
        cfg=json.loads((root/'config.json').read_text())
        if cfg.get('max_cumulative_wallet_debit_usd_minor')!=400000:raise ValueError('wallet_limit_changed')
        before={k:v for k,v in cfg.items() if k!='grok_site'}
        old=cfg.get('grok_site')
        if old and old!=payload['policy']:raise ValueError('grok_policy_conflict')
        cfg['grok_site']=payload['policy']
        if {k:v for k,v in cfg.items() if k!='grok_site'}!=before:raise ValueError('unrelated_policy_changed')
        if not payload.get('apply'):return {'dryRun':True,'files':sorted(files),'walletLimitUnchanged':True}
        backup=root/'data'/('grok-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700)
        targets={app/name:data for name,data in files.items()};targets[root/'config.json']=(json.dumps(cfg,indent=2)+'\n').encode()
        originals={str(path):str(backup/path.name) if path.exists() else None for path in targets}
        for target,saved in originals.items():
            if saved:shutil.copy2(target,saved);os.chmod(saved,0o600)
        try:
            for path,data in targets.items():atomic(path,data,gateway)
            installed={str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in targets}
            (backup/'manifest.json').write_text(json.dumps({'originals':originals,'installed':installed}))
        except Exception:
            for target,saved in originals.items():
                if saved:atomic(Path(target),Path(saved).read_bytes())
                else:Path(target).unlink(missing_ok=True)
            raise
        return {'installed':True,'backup':str(backup),'walletLimitUnchanged':True,'hashes':installed}

if __name__=='__main__':print(json.dumps(install(PAYLOAD)))
