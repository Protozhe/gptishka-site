#!/usr/bin/env python3
"""Linux/root integration test, exclusively in a temporary fixture tree."""
import importlib.util
import json
import os
import pathlib
import pwd
import shutil
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('permissions', pathlib.Path(__file__).with_name('prepare-site-permissions.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert os.geteuid() == 0
base = pathlib.Path(tempfile.mkdtemp(prefix='gptishka-permission-test-', dir='/var/tmp'))
try:
    # Fixtures contain no production data or credentials.
    os.chmod(base, 0o755)
    module.RUNTIME = base / 'runtime'
    module.SHARED = module.RUNTIME / 'shared-site'
    module.WEB_STATE = module.RUNTIME / 'website'
    for name in ('config', 'data', 'admin-data', 'uploads'):
        (module.SHARED / name).mkdir(parents=True)
    for name in ('root.env', 'backend.env', 'admin-ui.env'):
        (module.SHARED / 'config' / name).write_text('FIXTURE=yes\n')
    (module.SHARED / 'data' / 'cdk-keys.json').write_text('{"fixture":true}')
    (module.SHARED / 'admin-data' / 'cdk-keys.json').symlink_to(module.SHARED / 'data' / 'cdk-keys.json')
    for name in module.ACTIVE_FILES:
        (module.RUNTIME / name).write_text('{"fixture":true}')
    (module.RUNTIME / 'order-locks').mkdir()
    (module.RUNTIME / 'deploy.lock').touch()
    (base / 'server.js').write_text('// immutable fixture\n')
    module.main('prepare')
    assert not module.migration_complete()
    # Database-backed installations may retain this exact empty legacy alias.
    (module.SHARED / 'data' / 'cdk-keys.json').unlink()
    module.main('activate')
    assert module.migration_complete()
    module.main('activate')  # Idempotency must preserve one state copy.
    hostile = module.SHARED / 'data' / 'outside-link'
    hostile.symlink_to('/etc/passwd')
    try:
        module.own_tree(module.SHARED / 'data', pwd.getpwnam(module.USER).pw_uid,
                        pwd.getpwnam(module.USER).pw_gid, 0o750, 0o640)
        raise AssertionError('An arbitrary symlink was accepted')
    except RuntimeError:
        pass
    hostile.unlink()
    paths = {'state': str(module.WEB_STATE), 'root': str(module.RUNTIME),
             'config': str(module.SHARED / 'config' / 'backend.env'),
             'data': str(module.SHARED / 'data'), 'uploads': str(module.SHARED / 'uploads'),
             'code': str(base / 'server.js')}
    script = r'''
import json,pathlib,sys,os,sqlite3
p=json.loads(sys.argv[1]);state=pathlib.Path(p['state'])
assert pathlib.Path(p['config']).read_text().startswith('FIXTURE=')
for filename in [p['code'],p['config'],p['root']+'/deploy.lock']:
 try:pathlib.Path(filename).write_text('forbidden');raise AssertionError('Writable protected path')
 except PermissionError:pass
try:pathlib.Path(p['root']+'/shared-site').rename(p['root']+'/replaced');raise AssertionError('Writable configuration parent')
except PermissionError:pass
temp=state/'atomic.tmp';temp.write_text('{"updated":true}');temp.replace(state/'activation-reviews.json')
lock=state/'order-locks/test.lock';lock.write_text('fixture');lock.unlink()
db=sqlite3.connect(p['data']+'/probe.sqlite');db.execute('CREATE TABLE probe(value)');db.execute('INSERT INTO probe VALUES(1)');db.commit();db.close()
upload=pathlib.Path(p['uploads'])/'products/test.png';upload.write_bytes(b'fixture')
assert upload.stat().st_gid==__import__('grp').getgrnam('www-data').gr_gid
assert not os.access('/root/.ssh',os.R_OK)
assert not os.access('/var/run/docker.sock',os.R_OK|os.W_OK)
print(json.dumps({'ok':True,'uid':os.geteuid(),'atomic_write':True,'sqlite_write':True,'root_code_config_blocked':True}))
'''
    result = subprocess.run(['runuser', '-u', module.USER, '--', '/usr/bin/python3', '-c', script, json.dumps(paths)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    # Root maintenance reads/writes through compatibility paths without the
    # protected_regular failure caused by a shared sticky state directory.
    (module.RUNTIME / 'order-activations.json').write_text('{"root_fixture":true}')
    assert json.loads((module.WEB_STATE / 'order-activations.json').read_text())['root_fixture']
    print(result.stdout.strip())
finally:
    shutil.rmtree(base)
