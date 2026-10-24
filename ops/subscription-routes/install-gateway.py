"""Root-only reviewed deployment payload, executed by install-runtime.py over SSH.
No supplier API calls or activation methods are invoked by this installer.
"""
from pathlib import Path
import base64,hashlib,json,os,shutil,tempfile,datetime,fcntl

def install(payload):
    root=Path('/opt/pulse-zovocard');app=root/'app'
    with (root/'data/gateway.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if payload.get('rollback'):
            backup=Path(payload['rollback']).resolve()
            if backup.parent!=root/'data' or not backup.name.startswith('subscription-routes-backup-'):raise ValueError('invalid_backup')
            m=json.loads((backup/'manifest.json').read_text())
            for p,h in m['installed'].items():
                if hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h:raise ValueError('rollback_source_drift')
            for p,saved in m['originals'].items():
                if saved:
                    target=Path(p);st=target.stat();b=Path(saved).read_bytes()
                    fd,tmp=tempfile.mkstemp(dir=target.parent,prefix='.rollback-')
                    with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
                    os.chown(tmp,st.st_uid,st.st_gid);os.chmod(tmp,st.st_mode&0o777);os.replace(tmp,target)
                else:Path(p).unlink(missing_ok=True)
            return {'rolledBack':True}
        candidate={n:base64.b64decode(v) for n,v in payload['files'].items()}
        previous={n:hashlib.sha256((app/n).read_bytes()).hexdigest() if (app/n).exists() else None for n in candidate}
        for n,h in payload['baseline'].items():
            actual=hashlib.sha256((app/n).read_bytes()).hexdigest()
            if actual!=h and actual!=hashlib.sha256(candidate.get(n,b'')).hexdigest():raise ValueError('gateway_source_drift:'+n)
        for n,b in candidate.items():
            if n not in payload['baseline'] and previous[n] not in (None,hashlib.sha256(b).hexdigest()):raise ValueError('new_gateway_file_conflict')
            compile(b,n,'exec')
        cfg=json.loads((root/'config.json').read_text())
        if cfg.get('max_cumulative_wallet_debit_usd_minor')!=400000:raise ValueError('cumulative_limit_changed')
        existing=cfg.get('claude_site')
        if existing and existing.get('product_ids')!=payload['product_ids']:raise ValueError('claude_config_conflict')
        cfg['claude_site']=existing or {'enabled':True,'enabled_after':payload['cutoff'],'product_ids':payload['product_ids']}
        if not payload['apply']:return {'dryRun':True,'gatewayFiles':sorted(candidate),'capUsd':4000,'claudeCutoff':cfg['claude_site']['enabled_after']}
        backup=root/'data'/('subscription-routes-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        backup.mkdir(mode=0o700)
        originals={str(app/n):str(backup/n) if (app/n).exists() else None for n in candidate}
        originals[str(root/'config.json')]=str(backup/'config.json')
        for p,saved in originals.items():
            if saved:shutil.copy2(p,saved);os.chmod(saved,0o600)
        installed={}
        try:
            for n,b in candidate.items():
                target=app/n;st=(target if target.exists() else app/'zovocard_gateway.py').stat()
                fd,tmp=tempfile.mkstemp(dir=app,prefix='.routes-')
                with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
                os.chmod(tmp,st.st_mode&0o777);os.chown(tmp,st.st_uid,st.st_gid);os.replace(tmp,target)
                installed[str(target)]=hashlib.sha256(b).hexdigest()
            target=root/'config.json';st=target.stat();b=(json.dumps(cfg,indent=2)+'\n').encode()
            fd,tmp=tempfile.mkstemp(dir=root,prefix='.routes-')
            with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
            os.chmod(tmp,st.st_mode&0o777);os.chown(tmp,st.st_uid,st.st_gid);os.replace(tmp,target)
            installed[str(target)]=hashlib.sha256(b).hexdigest()
            (backup/'manifest.json').write_text(json.dumps({'originals':originals,'installed':installed}))
        except Exception:
            for p,saved in originals.items():
                if saved:shutil.copy2(saved,p)
                else:Path(p).unlink(missing_ok=True)
            raise
        return {'installed':True,'backup':str(backup),'capUsd':4000,'claudeCutoff':cfg['claude_site']['enabled_after']}

if __name__=='__main__':print(json.dumps(install(PAYLOAD)))
