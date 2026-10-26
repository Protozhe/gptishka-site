"""Install only committed Zovo status fixes. Dry-run unless --apply is supplied.

No configuration, customer data, routes, limits or payment workers are changed.
"""
from pathlib import Path
import datetime
import fcntl
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from contextlib import closing

HERE = Path(__file__).resolve().parent
RELEASE = HERE.parent.parent
TARGET = Path('/opt/pulse-web')
BACKUPS = Path('/var/lib/gptishka-runtime/zovocard-status-backups')
FILES = {
    'zovocard_job_status.py': ('job-status.py', None),
    'zovocard_notifications.py': ('notifications.py', 'c604da7417a0f158c4959cd993d70d45369ee8c24d389235e3f9fff60663d228'),
    'zovocard_pro5x_bridge.py': ('pro-bridge.py', '169279b36e19ce30d99f0ed7c500b67b70c5ae57b9eb25c364400353b8b17208'),
    'subscription_reserve_auto.py': ('../subscription-routes/reserve-auto.py', '0b8f01309a626970093e0e24aeb077d452538da78a4af3d27968a4026819409a'),
    'watch_chatgpt_next_order.py': ('watch-chatgpt.py', 'ac6606c6394a5ae9795235b5efa8393870dd550814ba426a82fd5958fb2df04e'),
}
SERVICES = ('funpay-telegram-fallback.service', 'pulse-chat-fallback.service')


def command(args):
    p = subprocess.run(args, capture_output=True, timeout=60)
    if p.returncode:
        raise ValueError('status_install_command_failed')
    return p.stdout.decode().strip()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data, stat=None):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.zovo-status-')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(name, stat.st_mode & 0o777 if stat else 0o644)
        os.chown(name, stat.st_uid if stat else 0, stat.st_gid if stat else 0)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main(apply=False):
    if os.geteuid() != 0:
        raise ValueError('root_required')
    sha = command(['git', '-C', str(RELEASE), 'rev-parse', 'HEAD'])
    expected = sys.argv[sys.argv.index('--sha') + 1] if '--sha' in sys.argv else ''
    if sha != expected or sha != command(['git', '-C', '/var/www/gptishka-new', 'rev-parse', 'HEAD']):
        raise ValueError('committed_live_release_required')
    if command(['git', '-C', str(RELEASE), 'status', '--porcelain', '--untracked-files=no']):
        raise ValueError('clean_release_required')
    candidates = {}
    for name, (source, baseline) in FILES.items():
        path = TARGET / name
        data = (HERE / source).read_bytes()
        compile(data, name, 'exec')
        old = path.read_bytes() if path.exists() else None
        if (digest(old) if old is not None else None) not in (baseline, digest(data)):
            raise ValueError('status_source_drift:' + name)
        if old != data:
            candidates[name] = (data, old, path.stat() if old is not None else None)
    result = {'dryRun': not apply, 'release': sha, 'changed': sorted(candidates)}
    if not apply or not candidates:
        return result
    # Reload only the two consumers of cached Python imports, between dispatches.
    with closing(sqlite3.connect('file:'+str(TARGET/'data/chat-activity.db')+'?mode=ro', uri=True)) as con:
        if con.execute("SELECT 1 FROM codex_jobs WHERE key_pool LIKE 'zovocard%' AND status IN ('validating','submitting') LIMIT 1").fetchone():
            raise ValueError('status_install_wait_for_active_dispatch')
    active = [unit for unit in SERVICES if command(['systemctl', 'is-active', unit]) == 'active']
    home = BACKUPS
    home.mkdir(mode=0o700, exist_ok=True)
    backup = home / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup.mkdir(mode=0o700)
    for name, (_, old, _) in candidates.items():
        if old is not None:
            saved = backup/name
            shutil.copy2(TARGET/name, saved)
            saved.chmod(0o600)
    try:
        for name, (data, _, stat) in candidates.items():
            atomic(TARGET/name, data, stat)
        for unit in active:
            command(['systemctl', 'restart', unit])
            command(['systemctl', 'is-active', unit])
        for name, (data, _, _) in candidates.items():
            if digest((TARGET/name).read_bytes()) != digest(data):
                raise ValueError('status_install_hash_mismatch')
    except Exception:
        for name, (_, old, stat) in reversed(list(candidates.items())):
            if old is None:
                (TARGET/name).unlink(missing_ok=True)
            else:
                atomic(TARGET/name, old, stat)
        for unit in active:
            subprocess.run(['systemctl', 'restart', unit], capture_output=True, timeout=60)
        raise
    result.update(backup=str(backup), reloaded=active, installed=True)
    (backup/'manifest.json').write_text(json.dumps(result, indent=2))
    return result


if __name__ == '__main__':
    try:
        with open('/var/lib/gptishka-runtime/zovocard-status-install.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            print(json.dumps(main('--apply' in sys.argv)))
    except Exception as e:
        reason = str(e) if isinstance(e, ValueError) and str(e).startswith(('status_', 'committed_', 'clean_', 'root_')) else 'status_install_failed'
        print(json.dumps({'error': reason}))
        sys.exit(1)
