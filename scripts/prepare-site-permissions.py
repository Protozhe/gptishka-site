#!/usr/bin/env python3
"""Idempotent production permissions. Run by the root deployment, before reload."""
import grp
import json
import os
import pathlib
import pwd
import stat
import subprocess
import argparse

RUNTIME = pathlib.Path('/var/lib/gptishka-runtime')
SHARED = RUNTIME / 'shared-site'
USER = 'gptishka-web'
WEB_STATE = RUNTIME / 'website'
ACTIVE_FILES = (
    'order-activations.json', 'manual-credentials.json', 'activation-reviews.json',
    'manager-notifications.json', 'telegram-bot-offsets.json', 'telegram-bot-sessions.json',
    'storefront-ticker-settings.json', 'ai-battle-stats.json', 'public-reviews.json',
    'telegram-reviews.json', 'preserved-reviews.json',
)

def ensure_regular(path):
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise RuntimeError('Unexpected non-regular managed file: ' + str(path))

def own_tree(directory, uid, gid, directory_mode, file_mode):
    if directory.is_symlink() or not directory.is_dir():
        raise RuntimeError('Expected real runtime directory: ' + str(directory))
    for base, dirs, files in os.walk(directory, followlinks=False):
        root = pathlib.Path(base)
        os.chown(root, uid, gid)
        os.chmod(root, directory_mode)
        for name in dirs + files:
            p = root / name
            if p.is_symlink():
                # A retained legacy key-store alias stays inside the site's
                # data tree. Never follow an upload or arbitrary private link.
                if (p == SHARED / 'admin-data' / 'cdk-keys.json' and
                        p.resolve() == SHARED / 'data' / 'cdk-keys.json' and p.is_file()):
                    continue
                raise RuntimeError('Unexpected symlink in runtime tree: ' + str(p))
            if p.is_file():
                os.chown(p, uid, gid)
                os.chmod(p, file_mode)

def migrate_state(uid, gid):
    for name in (*ACTIVE_FILES, 'order-locks'):
        legacy, target = RUNTIME / name, WEB_STATE / name
        if legacy.is_symlink():
            if legacy.resolve() != target:
                raise RuntimeError('Unexpected compatibility link: ' + str(legacy))
        elif legacy.exists():
            if target.exists():
                raise RuntimeError('Two state copies require manual reconciliation: ' + name)
            legacy.rename(target)
            legacy.symlink_to(target)
        elif target.exists():
            legacy.symlink_to(target)
        if target.is_dir():
            own_tree(target, uid, gid, 0o750, 0o600)
        elif target.exists():
            ensure_regular(target)
            os.chown(target, uid, gid)
            os.chmod(target, 0o600)
    # Maintenance Node consumers load this environment too. Their stores must
    # use the canonical directory, not atomically overwrite compatibility links.
    for name in ('root.env', 'backend.env'):
        p = SHARED / 'config' / name
        lines = p.read_text().splitlines()
        lines = [line for line in lines if not line.startswith('GPTISHKA_RUNTIME_DIR=')]
        value = '\n'.join([*lines, 'GPTISHKA_RUNTIME_DIR=' + str(WEB_STATE)]) + '\n'
        if p.read_text() != value:
            temporary = p.with_name(p.name + '.permissions.tmp')
            with open(temporary, 'x', opener=lambda path, flags: os.open(path, flags, 0o600)) as stream:
                stream.write(value)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(p)
        os.chown(p, 0, gid)
        os.chmod(p, 0o640)

def migration_complete():
    if not WEB_STATE.is_dir():
        return False
    for name in (*ACTIVE_FILES, 'order-locks'):
        p = RUNTIME / name
        if p.exists() and (not p.is_symlink() or p.resolve() != WEB_STATE / name):
            return False
    return all('GPTISHKA_RUNTIME_DIR=' + str(WEB_STATE) in (SHARED / 'config' / name).read_text().splitlines()
               for name in ('root.env', 'backend.env'))

def main(mode='prepare'):
    if os.geteuid() != 0:
        raise RuntimeError('Production permissions require root')
    for p in (RUNTIME, SHARED, SHARED / 'config'):
        if p.is_symlink() or not p.is_dir():
            raise RuntimeError('Expected real runtime directory: ' + str(p))
    try:
        user = pwd.getpwnam(USER)
    except KeyError:
        subprocess.run(['useradd', '--system', '--user-group', '--no-create-home',
                        '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', USER], check=True)
        user = pwd.getpwnam(USER)
    if user.pw_uid == 0 or user.pw_shell != '/usr/sbin/nologin':
        raise RuntimeError('Unexpected service account')
    uid, gid = user.pw_uid, user.pw_gid
    if mode == 'check':
        if not migration_complete():
            raise SystemExit(1)
        print(json.dumps({'ok': True, 'migration_complete': True}))
        return
    # State is isolated from root-owned deployment files, configuration, and
    # unrelated bot state. No service can create or rename files at this level.
    os.chown(RUNTIME, 0, 0)
    os.chmod(RUNTIME, 0o755)
    WEB_STATE.mkdir(exist_ok=True)
    if WEB_STATE.is_symlink():
        raise RuntimeError('Unexpected state directory link')
    os.chown(WEB_STATE, uid, gid)
    os.chmod(WEB_STATE, 0o750)
    os.chown(SHARED, 0, 0)
    os.chmod(SHARED, 0o755)
    config = SHARED / 'config'
    os.chown(config, 0, gid)
    os.chmod(config, 0o750)
    for name in ('root.env', 'backend.env', 'admin-ui.env'):
        p = config / name
        ensure_regular(p)
        if p.exists():
            os.chown(p, 0, gid)
            os.chmod(p, 0o640)
    for name in ('data', 'admin-data'):
        own_tree(SHARED / name, uid, gid, 0o750, 0o640)
    uploads = SHARED / 'uploads'
    products = uploads / 'products'
    # The legacy products link points back into an absent checkout directory.
    # Replace only that verified dangling link, never a live upload directory.
    if products.is_symlink():
        if products.exists() or os.readlink(products) != '/var/www/gptishka-new/apps/admin-backend/uploads/products':
            raise RuntimeError('Unexpected products upload link')
        products.unlink()
        products.mkdir()
    else:
        products.mkdir(exist_ok=True)
    own_tree(uploads, uid, grp.getgrnam('www-data').gr_gid, 0o2750, 0o640)
    if mode == 'activate':
        migrate_state(uid, gid)
    print(json.dumps({'ok': True, 'user': USER, 'uid': uid, 'gid': gid,
                      'mode': mode, 'config_service_writable': False}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    main('activate' if args.activate else 'check' if args.check else 'prepare')
