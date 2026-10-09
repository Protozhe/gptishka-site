#!/usr/bin/env python3
"""Private on-server snapshot. Never emits credentials or customer records."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
import os,sys,subprocess,tarfile,sqlite3,json,re


def archive_runtime(archive, runtime):
    """Keep durable data strict; an already-consumed IPC request may disappear."""
    archive.add(runtime, arcname='runtime', recursive=False)
    for path in sorted(runtime.iterdir()):
        try:
            archive.add(path, arcname='runtime/' + path.name, recursive=True)
        except FileNotFoundError as error:
            # The worker removes these root-level request files after processing.
            # Never swallow a missing durable file or a missing child directory.
            if (re.fullmatch(r'telegram-request-[0-9]+-[0-9a-f-]+\.json', path.name)
                    and error.filename == str(path)):
                continue
            raise

app=Path(sys.argv[1]).resolve()
runtime=Path('/var/lib/gptishka-runtime')
dest=Path(sys.argv[2])
assert str(app).startswith('/var/www/')
assert str(dest).startswith('/var/backups/gptishka/')
dest.mkdir(parents=True,exist_ok=False,mode=0o700)
os.chmod(dest,0o700)
config={}
for line in (app/'apps/admin-backend/.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1);config[k.strip()]=v.strip().strip('"').strip("'")
url=urlsplit(config['DATABASE_URL'])
assert url.scheme in ['postgresql','postgres'] and url.hostname in ['localhost','127.0.0.1']
env=os.environ.copy()
env.update(PGHOST=url.hostname,PGPORT=str(url.port or 5432),PGUSER=unquote(url.username or ''),PGPASSWORD=unquote(url.password or ''),PGDATABASE=url.path.lstrip('/'))
dump=dest/'database.dump'
subprocess.run(['pg_dump','--format=custom','--file',str(dump)],env=env,check=True,capture_output=True)
os.chmod(dump,0o600)
subprocess.run(['pg_restore','--list',str(dump)],check=True,capture_output=True)
archive=dest/'runtime-and-config.tar.gz'
with tarfile.open(archive,'w:gz') as t:
    archive_runtime(t, runtime)
    for file in ['.env','apps/admin-backend/.env','apps/admin-ui/.env.production']:
        p=app/file
        if p.is_file(): t.add(p.resolve(),arcname='config/'+file,recursive=False)
os.chmod(archive,0o600)
sqlite=app/'data/stats.sqlite'
if sqlite.is_file():
    with sqlite3.connect(str(sqlite)) as src,sqlite3.connect(str(dest/'stats.sqlite')) as dst:
        src.backup(dst)
    os.chmod(dest/'stats.sqlite',0o600)
(dest/'manifest.json').write_text(json.dumps({'app':str(app),'databaseBytes':dump.stat().st_size,'runtimeBytes':archive.stat().st_size}))
print('Private database and runtime backup verified:',dest)
