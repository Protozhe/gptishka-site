"""Both marketplace stock waits, mocked owner/customer/provider transports."""
import importlib.util,json,sqlite3,sys,threading,time,types,unittest
from pathlib import Path
from unittest.mock import Mock,patch

sys.path.insert(0,str(Path(__file__).parent))
import market_stock_wait as wait
spec=importlib.util.spec_from_file_location('stock_wait_fixtures',Path(__file__).with_name('test-aibuy-market.py'))
fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
adapter=fixtures.adapter


class Tests(unittest.TestCase):
    fixture=fixtures.Tests.fixture

    def setup_wait(self,platform='funpay',pool='plus_active'):
        a,path,*_=self.fixture(500,platform)
        with a.connect() as c:
            c.execute('ALTER TABLE codex_jobs ADD COLUMN submit_attempts INTEGER NOT NULL DEFAULT 0')
            c.execute("UPDATE codex_jobs SET status='validating',key_pool=?,product_type='chatgpt_plus'",(pool,))
        self.assertTrue(wait.defer(a,1,wait.StockUnavailable(pool)))
        a._worker_post_json=Mock(side_effect=AssertionError('No customer message is allowed during stock wait'))
        a.playerok_source=types.SimpleNamespace(send=Mock(side_effect=AssertionError('No customer message is allowed during stock wait')))
        return a,path

    def finish(self):
        deadline=time.monotonic()+3
        while time.monotonic()<deadline:
            with wait._lock:
                if not wait._active:return
            time.sleep(.01)
        self.fail('stock wait thread did not finish')

    def test_both_platforms_wait_refill_and_resume_without_new_chat_once(self):
        for platform in ('funpay','playerok'):
            with self.subTest(platform=platform):
                a,path=self.setup_wait(platform);calls=[]
                def validate(jid):
                    with a.connect() as c:
                        # This is the existing validator boundary: its durable
                        # claim and provider journal remain authoritative.
                        self.assertEqual(c.execute('SELECT note_url FROM codex_jobs WHERE id=?',(jid,)).fetchone()[0],'https://notebrio.com/n/fixture')
                        c.execute("UPDATE codex_jobs SET status='processing',key_id=1,aiee_order_id='fixture-provider',submit_attempts=1 WHERE id=?",(jid,))
                    calls.append(jid)
                a.validate_job=validate
                wait.tick(a);self.finish();self.assertEqual(calls,[])
                for _ in range(3):self.assertTrue(wait.hold(a,1))
                with a.connect() as c:
                    self.assertEqual(c.execute('SELECT status,error FROM codex_jobs').fetchone()[:],('waiting_data',wait.WAIT_MESSAGE))
                    self.assertEqual(c.execute('SELECT COUNT(*) FROM market_aibuy_notices').fetchone()[0],1)
                    c.execute("INSERT INTO codex_keys(id,pool,status) VALUES(1,'plus_active','available')")
                    c.execute('UPDATE market_stock_waits SET next_at=0')
                threads=[threading.Thread(target=wait.tick,args=(a,)) for _ in range(3)]
                for t in threads:t.start()
                for t in threads:t.join()
                self.finish();self.assertEqual(calls,[1])
                with a.connect() as c:c.execute('UPDATE market_stock_waits SET next_at=0')
                wait.tick(a);self.finish();self.assertEqual(calls,[1])
                self.assertFalse(a._worker_post_json.called);self.assertFalse(a.playerok_source.send.called)

    def test_wrong_pool_and_held_keys_do_not_resume(self):
        a,_=self.setup_wait('playerok');a.validate_job=Mock()
        with a.connect() as c:
            c.execute("INSERT INTO codex_keys(pool,status) VALUES('plus_free','available')")
            c.execute("INSERT INTO codex_keys(pool,status,reserved_job_id) VALUES('plus_active','available',99)")
        wait.tick(a);self.finish();self.assertFalse(a.validate_job.called)

    def test_restart_between_stock_read_and_validator_is_recoverable(self):
        a,_=self.setup_wait('playerok');a.validate_job=Mock()
        with a.connect() as c:c.execute("INSERT INTO codex_keys(pool,status) VALUES('plus_active','available')")
        self.assertFalse(wait.hold(a,1))
        # The process dies before invoking the validator, leaving released.
        with a.connect() as c:c.execute("UPDATE codex_jobs SET error='' ")
        self.assertFalse(wait.hold(a,1))
        wait.tick(a);self.finish();a.validate_job.assert_called_once_with(1)

    def test_paused_manual_archived_dispatched_refunded_and_foreign_are_never_resumed(self):
        for case in ('paused','manual_completed','cancelled','success','archived','dispatched','task','bound','refund','manual_permission','foreign','changed_error'):
            with self.subTest(case=case):
                a,_=self.setup_wait();a.validate_job=Mock()
                with a.connect() as c:
                    c.execute("INSERT INTO codex_keys(pool,status) VALUES('plus_active','available')")
                    if case in ('paused','manual_completed','cancelled','success'):c.execute('UPDATE codex_jobs SET status=?',(case,))
                    elif case=='archived':c.execute("UPDATE codex_jobs SET archived_at='fixture'")
                    elif case=='dispatched':c.execute('UPDATE codex_jobs SET submit_attempts=1')
                    elif case=='task':c.execute("UPDATE codex_jobs SET aiee_order_id='fixture-existing'")
                    elif case=='bound':c.execute('UPDATE codex_jobs SET key_id=9')
                    elif case=='refund':c.execute("INSERT INTO marketplace_refund_holds SELECT platform,account_id,order_id FROM codex_jobs")
                    elif case=='manual_permission':c.execute('UPDATE codex_jobs SET auto_submit_allowed=0')
                    elif case=='foreign':c.execute("UPDATE codex_jobs SET platform='gptishka'")
                    else:c.execute("UPDATE codex_jobs SET error='another validation error'")
                    before=dict(c.execute('SELECT * FROM codex_jobs').fetchone())
                wait.tick(a);self.finish();self.assertFalse(a.validate_job.called)
                with a.connect() as c:self.assertEqual(dict(c.execute('SELECT * FROM codex_jobs').fetchone()),before)

    def test_one_private_owner_notice_across_local_shared_reserve_and_restart(self):
        a,_=self.setup_wait('playerok')
        with a.connect() as c:j=c.execute('SELECT * FROM codex_jobs').fetchone()
        wait.notice(a,j,'plus_active');wait.notice(a,j,'plus_active');adapter.notice(a,j,'aisou_stock_empty','unused text')
        with a.connect() as c:
            rows=c.execute('SELECT * FROM market_aibuy_notices').fetchall();self.assertEqual(len(rows),1)
            self.assertIn('PlayerOK',rows[0]['message']);self.assertIn('plus_active',rows[0]['message']);self.assertNotIn('fixture@example.invalid',rows[0]['message'])
        sent=[]
        fake=types.SimpleNamespace(telegram_config=lambda:('fixture-owner','fixture-token'),telegram_call=lambda *args:{'username':'funpaypulseaibot'},
            send_message=lambda owner,token,message:sent.append(message) or {'message_id':123})
        with patch.dict(sys.modules,{'funpay_telegram_fallback':fake}):
            adapter.send_notices(a);adapter.send_notices(a);wait.notice(a,j,'plus_active');adapter.send_notices(a)
        self.assertEqual(len(sent),1)
        with a.connect() as c:self.assertEqual(c.execute('SELECT state FROM market_aibuy_notices').fetchone()[0],'sent')

    def test_missing_marketplace_bot_retains_notice_without_site_fallback(self):
        a,_=self.setup_wait();sent=Mock()
        fake=types.SimpleNamespace(telegram_config=lambda:('fixture-owner','fixture-token'),telegram_call=lambda *args:{'username':'myadminiibot'},send_message=sent)
        with patch.dict(sys.modules,{'funpay_telegram_fallback':fake}):adapter.send_notices(a)
        self.assertFalse(sent.called)
        with a.connect() as c:self.assertEqual(c.execute('SELECT state FROM market_aibuy_notices').fetchone()[0],'pending')

    def test_unconfirmed_notice_is_held_without_repeat(self):
        a,_=self.setup_wait();sent=Mock(side_effect=TimeoutError('fixture-uncertain'))
        fake=types.SimpleNamespace(telegram_config=lambda:('fixture-owner','fixture-token'),telegram_call=lambda *args:{'username':'funpaypulseaibot'},send_message=sent)
        with patch.dict(sys.modules,{'funpay_telegram_fallback':fake}):adapter.send_notices(a);adapter.send_notices(a)
        sent.assert_called_once()
        with a.connect() as c:self.assertEqual(c.execute('SELECT state FROM market_aibuy_notices').fetchone()[0],'uncertain')

    def test_only_typed_stock_errors_enter_wait(self):
        a,*_=self.fixture();self.assertFalse(wait.defer(a,1,ValueError('provider failed')))
        with a.connect() as c:self.assertEqual(c.execute('SELECT status FROM codex_jobs').fetchone()[0],'waiting_data')

    def test_guarded_installer_hooks_are_atomic_and_idempotent(self):
        spec=importlib.util.spec_from_file_location('stock_wait_installer',Path(__file__).with_name('install-market-stock-wait.py'))
        installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
        source='''class Fixture:
    def _reserve_key(self,con,job_id,pool):
        if not True:
            raise ValueError(f"Нет доступных ключей: {POOL_LABELS.get(pool, pool)}")
    def validate_job(self,job_id):
        refund_guard(self,job_id)
        try:
            pass
        except Exception as error:
            with self.connect() as con:
                pass
    def _process_jobs_once(self):
        self._poll_aiee()
    def untouched(self):
        return 'preserve all payment and finalization logic'
'''
        candidate=installer.codex_candidate(source)
        self.assertEqual(installer.codex_candidate(candidate),candidate)
        self.assertIn("return 'preserve all payment and finalization logic'",candidate)
        self.assertIn('if stock_wait_defer(self,int(job_id),error):return',candidate)
        with self.assertRaisesRegex(ValueError,'stock_wait_anchor_changed'):installer.codex_candidate(source.replace('refund_guard(self,job_id)','different_guard()'))
        reserve="def notice(a,j,suffix,text):\n    return 'existing site-owner route'\n"
        patched=installer.reserve_candidate(reserve)
        self.assertEqual(installer.reserve_candidate(patched),patched)
        self.assertIn("j['platform'] in ('funpay','playerok')",patched)
        self.assertIn("return 'existing site-owner route'",patched)


if __name__=='__main__':unittest.main()
