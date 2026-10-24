"""Install only from a committed deployed release. Starts paused; never buys.

Existing encrypted owner session is retained. An operator enables the policy
only after the sandboxed server UI read-only preflight passes.
"""
import datetime,json,os,pwd,subprocess,tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
STATE=Path('/var/lib/gptishka-runtime/aibuy-procurement')
SECRETS=Path('/var/lib/gptishka-runtime/supplier-secrets')


def atomic(file,content,mode=0o644,gid=0):
    fd,tmp=tempfile.mkstemp(dir=file.parent,prefix='.aibuy-')
    try:
        with os.fdopen(fd,'w') as f:
            os.fchmod(f.fileno(),mode);os.fchown(f.fileno(),0,gid)
            f.write(content);f.flush();os.fsync(f.fileno())
        os.replace(tmp,file)
    finally:
        if os.path.lexists(tmp):os.unlink(tmp)


def install():
    if os.geteuid()!=0:raise ValueError('owner required')
    active=Path('/var/www/gptishka-new').resolve()
    if HERE!=active/'ops/supplier-procurement':raise ValueError('deployed release required')
    try:pwd.getpwnam('gptishka-buy')
    except KeyError:subprocess.run(['useradd','--system','--no-create-home','--home-dir','/nonexistent','--shell','/usr/sbin/nologin','gptishka-buy'],check=True)
    STATE.mkdir(mode=0o700,exist_ok=True);os.chmod(STATE,0o700);os.chown(STATE,0,0)
    web=pwd.getpwnam('gptishka-web')
    if not (SECRETS/'aibuy-policy.json').exists():
        atomic(SECRETS/'aibuy-policy.json',json.dumps({'enabled':False,'paused':True,
            'enabledAfter':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'products':['codex-250','codex-500','codex-1000']}),0o640,web.pw_gid)
    unit='''[Unit]
Description=GPTishka AI-BUY procurement broker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/gptishka-new
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/playerok-connector/venv/bin/python /var/www/gptishka-new/ops/supplier-procurement/aibuy-broker.py
Restart=on-failure
RestartSec=5
UMask=0077
PrivateTmp=true
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target
'''
    atomic(Path('/etc/systemd/system/gptishka-aibuy.service'),unit)
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','enable','--now','gptishka-aibuy.service'],check=True,capture_output=True)
    return {'installed':True,'initially_paused':True,'purchases_started':0,'customer_activations':0}


if __name__=='__main__':print(json.dumps(install()))
