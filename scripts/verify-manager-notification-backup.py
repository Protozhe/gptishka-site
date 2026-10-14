"""Execute the real backup traversal without reading production state."""
import ast
import errno
from pathlib import Path
import re
import os
import subprocess
import tempfile

source = ast.parse(Path('scripts/backup-release-state.py').read_text())
function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'archive_runtime')
scope = {'re': re}
exec(compile(ast.Module(body=[function], type_ignores=[]), '<backup-function>', 'exec'), scope)


class Archive:
    def __init__(self, missing=None):
        self.names = []
        self.missing = missing

    def add(self, path, arcname, recursive):
        if path.name == self.missing:
            raise FileNotFoundError(errno.ENOENT, 'fixture disappeared', str(path))
        self.names.append(arcname)


with tempfile.TemporaryDirectory(prefix='gptishka-manager-backup-') as directory:
    root = Path(directory)
    names = ['manager-notifications.json', 'manager-notifications.json.lock',
             'manager-notifications.json.123.abc-123.tmp', 'durable.json',
             'telegram-request-123-abc-123.json', 'manager-notifications.json.foreign.tmp']
    for name in names:
        (root / name).write_text('fixture')
    archive = Archive()
    scope['archive_runtime'](archive, root)
    assert 'runtime/manager-notifications.json' in archive.names
    assert 'runtime/manager-notifications.json.lock' not in archive.names
    assert 'runtime/manager-notifications.json.123.abc-123.tmp' not in archive.names
    assert 'runtime/manager-notifications.json.foreign.tmp' in archive.names
    scope['archive_runtime'](Archive('telegram-request-123-abc-123.json'), root)
    for missing in ['manager-notifications.json', 'durable.json']:
        try:
            scope['archive_runtime'](Archive(missing), root)
        except FileNotFoundError:
            pass
        else:
            raise AssertionError('Missing durable state must still stop the backup')
    dump_statement = next(node for node in source.body if isinstance(node, ast.Try)
                          and 'pg_dump' in ast.unparse(node))

    class FailingCommand:
        CalledProcessError = subprocess.CalledProcessError

        @staticmethod
        def run(*args, **kwargs):
            raise subprocess.CalledProcessError(1, ['pg_dump'], stderr=b'fixture private diagnostic')

    try:
        exec(compile(ast.Module(body=[dump_statement], type_ignores=[]), '<dump-command>', 'exec'),
             {'subprocess': FailingCommand, 'dest': root, 'dump': root / 'database.dump', 'env': {}, 'os': os})
    except RuntimeError as error:
        assert 'fixture private diagnostic' not in str(error)
    else:
        raise AssertionError('Failed dumps must still stop publication')
    assert (root / 'database-error.log').read_bytes() == b'fixture private diagnostic'
    if os.name == 'posix':
        assert (root / 'database-error.log').stat().st_mode & 0o777 == 0o600
print('Manager queue snapshots preserve durable data and omit only their transient locks/staging files.')
