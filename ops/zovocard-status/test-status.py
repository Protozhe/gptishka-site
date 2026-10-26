import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import types
import unittest
from contextlib import contextmanager, closing
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
if sys.platform == 'win32':
    sys.modules['fcntl'] = types.SimpleNamespace()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


policy = load('zovocard_job_status', HERE/'job-status.py')
n = load('zovocard_notifications', HERE/'notifications.py')
r = load('reserve_status_fixture', HERE.parent/'subscription-routes/reserve-auto.py')
with patch.dict(sys.modules, {'zovocard_pro5x_scope': types.SimpleNamespace(primary=None, primary_source=None, legacy_blocked=None)}):
    b = load('pro_status_fixture', HERE/'pro-bridge.py')
utc_now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
stamp = lambda value: datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


class Database:
    def __init__(self, path):
        self.path = path

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        try:
            with con:
                yield con
        finally:
            con.close()


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.a = Database(str(Path(self.tmp.name)/'activity.db'))
        self.state = sqlite3.connect(str(Path(self.tmp.name)/'notices.db'))
        self.addCleanup(self.state.close)
        self.market, self.site = Mock(), Mock()
        with self.a.connect() as c:
            c.executescript("""
                CREATE TABLE codex_jobs(id INTEGER PRIMARY KEY,platform TEXT,account_id TEXT,order_id TEXT,
                    package INTEGER,product_type TEXT,status TEXT,error TEXT,finished_at TEXT,updated_at TEXT,
                    created_at TEXT,source_created_at TEXT,key_pool TEXT,key_id TEXT,aiee_order_id TEXT);
                CREATE TABLE codex_logs(id INTEGER PRIMARY KEY,job_id INTEGER,event TEXT,detail TEXT,created_at TEXT);
                CREATE TABLE codex_zovocard_finance(job_id INTEGER PRIMARY KEY,payload TEXT,updated_at REAL);
                CREATE TABLE codex_external_fulfillments(job_id INTEGER PRIMARY KEY,provider TEXT,provider_order_id TEXT,
                    pool TEXT,card_last_four TEXT,status TEXT,created_at TEXT);
                INSERT INTO codex_jobs VALUES(1,'gptishka','site','fixture-order',20,'chatgpt_pro_20x',
                    'manual_action','ZovoCard Pro 20x: Нет свободной карты с подтверждённой историей.',NULL,
                    datetime('now'),datetime('now','-1 hour'),datetime('now','-1 hour'),'zovocard_pro20x_direct',NULL,NULL);
                INSERT INTO codex_logs(job_id,event,detail,created_at) VALUES(1,'zovocard_sitepro20x_review','pool_waiting_for_card',datetime('now'));
                INSERT INTO codex_zovocard_finance VALUES(1,'{}',0);
            """)

    def job(self):
        with self.a.connect() as c:
            return c.execute('SELECT * FROM codex_jobs WHERE id=1').fetchone()

    def change(self, status, error='', finance=None):
        with self.a.connect() as c:
            c.execute("UPDATE codex_jobs SET status=?,error=?,updated_at=datetime('now'),finished_at=CASE WHEN ?='success' THEN datetime('now') ELSE finished_at END WHERE id=1", (status, error, status))
            if finance is not None:
                c.execute('UPDATE codex_zovocard_finance SET payload=?,updated_at=? WHERE job_id=1', (json.dumps(finance), time.time()))

    def finalized(self):
        with self.a.connect() as c:
            c.execute("INSERT INTO codex_logs(job_id,event,detail) VALUES(1,'zovocard_sitepro20x_finalized','verified')")

    def notify(self):
        n.notify(self.state, self.a.path, self.market, send_site=self.site)

    def test_full_busy_processing_success_sequence_has_two_messages(self):
        self.notify()
        self.assertIn('В обработке', self.site.call_args.args[0])
        self.assertNotIn('Требуется проверка', self.site.call_args.args[0])
        self.assertIn('Продолжим автоматически', self.site.call_args.args[0])
        for status in ('ready', 'submitting', 'processing'):
            self.change(status, finance={'card_last_four': '1234'})
            self.notify()
        self.assertEqual(self.site.call_count, 1)
        self.change('success')
        self.notify()  # Neither finalization nor settlement has been proved yet.
        self.assertEqual(self.site.call_count, 1)
        self.finalized()
        finance = {'card_last_four': '1234', 'card_charge_usd_minor': 14094,
                   'total_cost_usd_minor': 14109, 'return_state': 'pending'}
        self.change('success', finance=finance)
        self.notify()
        self.assertEqual(self.site.call_count, 2)
        self.assertIn('$141.09', self.site.call_args.args[0])
        self.change('success', finance={**finance, 'return_state': 'confirmed', 'returned_usd_minor': 100})
        self.notify()
        self.change('manual_action', 'stale poll failure')
        self.notify()
        self.assertEqual(self.site.call_count, 2)
        self.assertTrue(n.notification_confirmed(self.state, 1, 'gptishka'))
        self.market.assert_not_called()

    def test_real_new_obstacles_alert_once_without_raw_error_or_finance_secrets(self):
        for error in ('wallet_insufficient', 'wallet_insufficient', 'funding_requires_reconciliation'):
            self.change('manual_action', error, {'card_last_four': '1234', 'token': 'secret-fixture', 'card_number': 'secret-fixture'})
            self.notify()
        self.assertEqual(self.site.call_count, 2)
        for call in self.site.call_args_list:
            self.assertIn('Требуется проверка', call.args[0])
            self.assertNotIn('secret-fixture', call.args[0])
            self.assertNotIn('wallet_insufficient', call.args[0])

    def test_delivery_failure_retries_only_failed_destination(self):
        with self.a.connect() as c:
            c.execute("INSERT INTO codex_jobs SELECT 2,'funpay',account_id,'market-fixture',package,product_type,'processing','',finished_at,updated_at,created_at,source_created_at,key_pool,key_id,aiee_order_id FROM codex_jobs WHERE id=1")
        self.site.side_effect = RuntimeError('fixture offline')
        with self.assertRaisesRegex(RuntimeError, 'notification_delivery_incomplete'):
            self.notify()
        self.assertEqual(self.market.call_count, 1)
        self.assertFalse(n.notification_confirmed(self.state, 1, 'gptishka'))
        self.site.side_effect = None
        self.notify()
        self.assertEqual(self.market.call_count, 1)
        self.assertEqual(self.site.call_count, 2)

    def seed_legacy(self, notified_at):
        self.state.execute('CREATE TABLE zovocard_notifications(job_id INTEGER PRIMARY KEY,signature TEXT,notified_at TEXT,destination TEXT)')
        self.state.execute('INSERT INTO zovocard_notifications VALUES(1,?,?,?)', ('earlier-return-pending-signature', notified_at, 'site_admin'))
        self.state.commit()

    def test_migration_does_not_reannounce_finished_orders_after_return_update(self):
        self.change('success', finance={'card_charge_usd_minor': 14094, 'total_cost_usd_minor': 14109, 'return_state': 'confirmed'})
        self.finalized()
        with self.a.connect() as c:
            c.execute("UPDATE codex_jobs SET finished_at=datetime('now','-1 minute')")
        self.seed_legacy(utc_now())
        self.notify()
        self.site.assert_not_called()
        self.assertTrue(n.notification_confirmed(self.state, 1, 'gptishka'))

    def test_legacy_progress_cannot_be_mistaken_for_delivered_success(self):
        self.change('success', finance={'card_charge_usd_minor': 14094, 'total_cost_usd_minor': 14109})
        self.finalized()
        self.seed_legacy('2020-01-01 00:00:00')
        self.notify()
        self.assertEqual(self.site.call_count, 1)
        self.assertTrue(n.notification_confirmed(self.state, 1, 'gptishka'))

    def test_no_cross_bot_fallback_for_missing_destination(self):
        n.notify(self.state, self.a.path, self.market)
        self.market.assert_not_called()
        with self.a.connect() as c:
            c.execute("UPDATE codex_jobs SET platform='unknown'")
        self.notify()
        self.site.assert_not_called()

    def test_busy_observation_preserves_processing_and_settled_receipt(self):
        with patch.dict(sys.modules, {'codex_automation': types.SimpleNamespace(utc_now=utc_now)}):
            self.change('processing')
            b.record(self.a, 1, {'ok': True, 'result': {'state': 'processing', 'provider_order_id': '77', 'card_last_four': '1234'}}, pool='zovocard_pro20x_direct')
            for status in ('processing', 'submitting'):
                self.change(status)
                b.record(self.a, 1, {'ok': False, 'reason': 'pool_waiting_for_card'}, pool='zovocard_pro20x_direct')
                self.assertEqual(self.job()['status'], status)
            with self.a.connect() as c:
                before = tuple(c.execute('SELECT * FROM codex_zovocard_receipts').fetchone())
            self.change('success')
            b.record(self.a, 1, {'ok': True, 'result': {'state': 'prepared', 'provider_order_id': '88'}}, pool='zovocard_pro20x_direct')
            with self.a.connect() as c:
                self.assertEqual(tuple(c.execute('SELECT * FROM codex_zovocard_receipts').fetchone()), before)
            self.assertEqual(self.job()['status'], 'success')

    def candidate(self):
        with patch.dict(sys.modules, {'zovocard_pulse_bridge': types.SimpleNamespace(_time=stamp)}):
            return r.current_candidate(self.a, 1, {'enabled': True, 'enabled_after': '2020-01-01T00:00:00Z', 'minimum_wait_seconds': 0})

    def test_uncertain_transport_reply_still_requires_review(self):
        self.change('processing')
        with patch.dict(sys.modules, {'codex_automation': types.SimpleNamespace(utc_now=utc_now)}):
            b.record(self.a, 1, {'ok': False, 'reason': 'worker_connection_uncertain'}, pool='zovocard_pro20x_direct')
        self.assertEqual(self.job()['status'], 'manual_action')
        self.assertIn('не подтверждён', self.job()['error'])

    def test_reserve_rechecks_primary_and_allows_only_terminal_failure_inspection(self):
        self.assertIsNone(self.candidate())  # Recoverable pre-dispatch busy.
        self.change('manual_action', 'genuine payment failure')
        self.assertIsNotNone(self.candidate())  # Old busy log cannot hide a new error.
        with self.a.connect() as c:
            c.execute("INSERT INTO codex_logs(job_id,event) VALUES(1,'zovocard_sitepro20x_dispatch')")
        self.assertIsNone(self.candidate())  # Dispatch without an outcome: inspect-only.
        with self.a.connect() as c:
            c.execute("INSERT INTO codex_external_fulfillments(job_id,status) VALUES(1,'processing')")
        self.assertIsNone(self.candidate())
        with self.a.connect() as c:
            c.execute("UPDATE codex_external_fulfillments SET status='terminal_failure'")
        self.assertIsNotNone(self.candidate())  # Remote zero-charge seal is still mandatory.
        self.change('processing')
        self.assertIsNone(self.candidate())
        self.change('success')
        self.assertIsNone(self.candidate())

    def test_primary_progress_during_evidence_read_is_quiet_and_creates_no_reserve(self):
        self.change('manual_action', 'genuine failure')
        cfg = {'enabled': True, 'enabled_after': '2020-01-01T00:00:00Z', 'minimum_wait_seconds': 0}
        root = Path(self.tmp.name)
        (root/'data').mkdir()
        (root/'data/subscription-reserve.json').write_text(json.dumps(cfg))
        def race(*args):
            self.change('processing')
            raise ValueError('reserve_evidence_unavailable')
        with patch.dict(sys.modules, {'site_credit250': types.SimpleNamespace(automation=lambda: self.a),
                                     'zovocard_pulse_bridge': types.SimpleNamespace(_time=stamp)}), \
                patch.object(r, 'ROOT', root), patch.object(r, 'evidence', side_effect=race), \
                patch.object(r, 'notify_native_completions'), patch.object(r, 'send_notices'):
            r.run()
        with self.a.connect() as c:
            self.assertEqual(c.execute('SELECT count(*) FROM subscription_reserve_attempts').fetchone()[0], 0)
            self.assertEqual(c.execute('SELECT count(*) FROM subscription_reserve_notices').fetchone()[0], 0)

    def test_reserve_still_refuses_missing_remote_zero_charge_seal(self):
        self.change('manual_action', 'genuine failure')
        attempt = {'state': 'attesting', 'dispatched': 0, 'encrypted_session': 'fixture-session'}
        remote = Mock(return_value={'ok': True, 'result': {'state': 'processing'}})
        with patch.dict(sys.modules, {'codex_automation': types.SimpleNamespace(utc_now=utc_now),
                'zovocard_pulse_bridge': types.SimpleNamespace(remote=remote, job_source=lambda _: 'fixture')}), \
                patch.object(r, 'decrypted', return_value='fixture-session'), \
                patch.object(r, 'evidence', return_value={'session': 'fixture-session', 'order': {}, 'financial': {}}), \
                patch.object(r, 'assess', return_value={}):
            with self.assertRaisesRegex(ValueError, 'reserve_primary_'):
                r.process(self.a, self.job(), attempt)
        self.assertEqual(remote.call_args.args[0]['action'], 'subscription_fallback_claim')
        self.assertEqual(self.job()['key_pool'], 'zovocard_pro20x_direct')


class InstallationTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.target = self.root/'runtime'
        self.source = self.root/'release'
        self.target.mkdir()
        self.source.mkdir()
        (self.target/'data').mkdir()
        with closing(sqlite3.connect(self.target/'data/chat-activity.db')) as c:
            c.execute('CREATE TABLE codex_jobs(key_pool TEXT,status TEXT)')
        (self.target/'existing.py').write_bytes(b'old = True\n')
        (self.source/'existing.py').write_bytes(b'new = True\n')
        (self.source/'new.py').write_bytes(b'helper = True\n')
        self.i = load('install_fixture', HERE/'install.py')
        self.i.HERE = self.source
        self.i.TARGET = self.target
        self.i.BACKUPS = self.root/'backups'
        self.i.FILES = {'new.py': ('new.py', None),
                        'existing.py': ('existing.py', hashlib.sha256(b'old = True\n').hexdigest())}
        self.command = Mock(side_effect=lambda args: 'fixture-sha' if 'rev-parse' in args else
                            'active' if args[:2] == ['systemctl', 'is-active'] else '')
        for p in (patch.object(self.i, 'command', self.command),
                  patch.object(self.i.os, 'geteuid', return_value=0, create=True),
                  patch.object(self.i.os, 'chown', create=True),
                  patch.object(sys, 'argv', ['install.py', '--sha', 'fixture-sha'])):
            p.start()
            self.addCleanup(p.stop)

    def test_dry_run_and_source_drift_never_write_runtime(self):
        self.assertEqual(self.i.main()['changed'], ['existing.py', 'new.py'])
        self.assertEqual((self.target/'existing.py').read_bytes(), b'old = True\n')
        self.assertFalse((self.target/'new.py').exists())
        (self.target/'existing.py').write_bytes(b'unknown edit\n')
        with self.assertRaisesRegex(ValueError, 'status_source_drift'):
            self.i.main(True)
        self.assertFalse(self.i.BACKUPS.exists())

    def test_active_submission_defers_install_without_service_actions(self):
        with closing(sqlite3.connect(self.target/'data/chat-activity.db')) as c:
            c.execute("INSERT INTO codex_jobs VALUES('zovocard_pro20x_direct','submitting')")
            c.commit()
        with self.assertRaisesRegex(ValueError, 'wait_for_active_dispatch'):
            self.i.main(True)
        self.assertFalse((self.target/'new.py').exists())
        self.assertFalse(any(call.args[0][0] == 'systemctl' for call in self.command.call_args_list))

    def test_success_is_idempotent_and_changes_only_listed_modules(self):
        result = self.i.main(True)
        self.assertTrue(result['installed'])
        self.assertEqual((self.target/'existing.py').read_bytes(), b'new = True\n')
        self.assertEqual((self.target/'new.py').read_bytes(), b'helper = True\n')
        self.assertEqual(self.i.main(True)['changed'], [])
        self.assertEqual(set(result['reloaded']), set(self.i.SERVICES))
        self.assertTrue((Path(result['backup'])/'existing.py').exists())

    def test_restart_failure_rolls_back_existing_and_new_modules(self):
        def fail_restart(args):
            if args[:2] == ['systemctl', 'restart']:
                raise ValueError('status_install_command_failed')
            return 'fixture-sha' if 'rev-parse' in args else 'active' if 'is-active' in args else ''
        self.command.side_effect = fail_restart
        with patch.object(self.i.subprocess, 'run') as rollback_service:
            with self.assertRaisesRegex(ValueError, 'status_install_command_failed'):
                self.i.main(True)
            self.assertEqual(rollback_service.call_count, 2)
        self.assertEqual((self.target/'existing.py').read_bytes(), b'old = True\n')
        self.assertFalse((self.target/'new.py').exists())


if __name__ == '__main__':
    unittest.main()
