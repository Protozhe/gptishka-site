"""Isolated paid-order fixtures. No merchant, customer, marketplace or bot calls."""
import base64,contextlib,importlib.util,json,os,sqlite3,sys,tempfile,time,types,unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime,timezone
from cryptography.fernet import Fernet
sys.path.insert(0,str(Path(__file__).parent))
import market_aibuy as adapter
import market_aibuy_common as common
import market_shared_stock as shared_stock
spec=importlib.util.spec_from_file_location('market_root',Path(__file__).with_name('aibuy-market.py'));root=importlib.util.module_from_spec(spec);spec.loader.exec_module(root)
if os.name!='posix':sys.modules['fcntl']=types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None)

def iso(seconds=0):return datetime.fromtimestamp(time.time()+seconds,timezone.utc).isoformat()
sys.modules['codex_automation']=types.SimpleNamespace(utc_now=iso)

class Tests(unittest.TestCase):
    def fixture(self,code=250,platform='funpay'):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);path=Path(temp.name)
        # Legacy procurement fixtures choose their route explicitly; never read
        # the server's live shared-stock switch. Shared-stock cases override this.
        stock_cfg=path/'shared-stock.json';stock_cfg.write_text(json.dumps({'enabled':False}))
        stock_patch=patch.object(shared_stock,'CONFIG',stock_cfg);stock_patch.start();self.addCleanup(stock_patch.stop)
        db=sqlite3.connect(path/'activity.db');db.row_factory=sqlite3.Row
        db.executescript('''CREATE TABLE codex_jobs(id INTEGER PRIMARY KEY,order_id TEXT,account_id TEXT,platform TEXT,
          package INTEGER,product_type TEXT,title TEXT,status TEXT,key_pool TEXT,key_id INTEGER,aiee_order_id TEXT DEFAULT '',
          started_at TEXT,last_poll_status TEXT DEFAULT '',source_created_at TEXT,created_at TEXT,updated_at TEXT,
          auto_submit_allowed INTEGER,archived_at TEXT,note_url TEXT,email TEXT,finished_at TEXT,error TEXT,instruction_sent_at TEXT,anchor_message_id INTEGER,chat_id TEXT);
          CREATE TABLE codex_keys(id INTEGER PRIMARY KEY,package INTEGER,pool TEXT,encrypted_key TEXT,fingerprint TEXT UNIQUE,status TEXT,reserved_job_id INTEGER,added_at TEXT,used_at TEXT);
          CREATE TABLE codex_logs(job_id INTEGER,event TEXT);
          CREATE TABLE marketplace_refund_holds(platform TEXT,account_id TEXT,order_id TEXT);
          CREATE TABLE codex_external_fulfillments(job_id INTEGER);
          CREATE TABLE subscription_reserve_attempts(job_id INTEGER);
          CREATE TABLE site_aiee_attempts(job_id INTEGER);''')
        db.execute('CREATE TABLE codex_settings(id INTEGER PRIMARY KEY,enabled INTEGER,auto_submit INTEGER)');db.execute('INSERT INTO codex_settings VALUES(1,1,1)')
        profit=sqlite3.connect(path/'profit.db');profit.execute('CREATE TABLE order_cost_overrides(account_id TEXT,order_id TEXT,cost_rub REAL,updated_at TEXT)');profit.close()
        title='Codex '+str(code)+' кредитов' if code else 'CLAUDE PRO на ваш аккаунт 1 месяц'
        account='2' if platform=='funpay' else 'playerok:fixture'
        db.execute("INSERT INTO codex_jobs(id,order_id,account_id,platform,package,product_type,title,status,key_pool,source_created_at,created_at,updated_at,auto_submit_allowed,note_url,email,anchor_message_id,chat_id) VALUES(1,?,?,?,?,?,?,'waiting_data',?,?,?,?,1,'https://notebrio.com/n/fixture',?,1,'fixture-chat')",
          ('FIXTURE-ORDER',account,platform,code,'codex' if code else 'claude_pro',title,'codex_'+str(code) if code else 'claude_pro',iso(-30),iso(-20),iso(-10),'00000000-0000-4000-8000-000000000029' if code==0 else 'fixture@example.invalid'))
        db.commit();db.close()
        @contextlib.contextmanager
        def connect():
            c=sqlite3.connect(path/'activity.db');c.row_factory=sqlite3.Row
            try:
                with c:yield c
            finally:c.close()
        key=Fernet.generate_key();(path/'key').write_bytes(key);fernet=Fernet(key)
        token='fixture.'+base64.urlsafe_b64encode(json.dumps({'exp':time.time()+3600}).encode()).decode().rstrip('=')+'.signature'
        note={'account':{'planType':'plus'},'accessToken':token,'user':{'email':'fixture@example.invalid'}}
        policy={'enabled':True,'marketplaces':{'enabled':True,'enabledAfter':iso(-60),'accounts':{'funpay':['2'],'playerok':['playerok:fixture']}}}
        cfg=path/'policy.json';cfg.write_text(json.dumps(policy));p=patch.object(adapter,'CONFIG',cfg);p.start();self.addCleanup(p.stop)
        calls=[]
        def post(url,payload,**kwargs):
            action=url.split('=')[-1];calls.append(action)
            if action=='verifyCdk':return {'ok':True,'workflow':common.workflow(code),'status':'unused'}
            if action=='activate':raise TimeoutError('isolated accepted response lost')
            return {'ok':True,'workflow':common.workflow(code),'status':'done','final':True}
        a=types.SimpleNamespace(db_path=str(path/'activity.db'),profit_db_path=str(path/'profit.db'),connect=connect,_fernet=lambda:fernet,_fetch_note=lambda _:note,_post_json=post)
        reply={'product_key':common.product(code),'credits':code,'activationSiteUrl':'https://aichongzhi.fun','code':'ISOLATED-MARKET-KEY','trade_no':'20000000000029','amount_minor':common.PRICES[code],'cost_rub':str(common.PRICES[code]*13.2/100)}
        return a,path,policy,calls,reply

    def test_fixture_does_not_inherit_enabled_live_shared_stock(self):
        with tempfile.TemporaryDirectory() as td:
            live=Path(td)/'live-policy.json'
            live.write_text(json.dumps({'enabled':True,'enabledAfter':iso(-3600)}))
            with patch.object(shared_stock,'CONFIG',live):
                a,path,_,_,_=self.fixture(250)
                with a.connect() as c:job=dict(c.execute('SELECT * FROM codex_jobs').fetchone())
                self.assertEqual(shared_stock.CONFIG,path/'shared-stock.json')
                self.assertFalse(shared_stock.enabled(job,{'created_at':time.time()}))

    def test_contracts_and_new_paid_source_boundaries(self):
        for code in (0,250,500,1000):
            a,path,p,calls,r=self.fixture(code)
            with a.connect() as c:j=dict(c.execute('SELECT * FROM codex_jobs').fetchone())
            self.assertTrue(common.eligible(j,p));self.assertEqual(common.classify(j['title']),code)
            for changes in ({'source_created_at':iso(-1000)},{'created_at':iso(-1000)},{'platform':'gptishka'},{'account_id':'other-shop'},{'auto_submit_allowed':0},{'archived_at':iso()}):
                self.assertFalse(common.eligible({**j,**changes},p))
            self.assertNotEqual(common.identity(j),common.identity({**j,'account_id':'another'}))
        for title in ('Codex 250 500','Claude Max 5x','Claude Pro 3 месяца','Claude Pro готовый аккаунт 1 месяц','Codex 2500'):
            self.assertIsNone(common.classify(title))

    def test_existing_codex_stock_is_used_without_acquisition(self):
        a,path,p,calls,r=self.fixture()
        with a.connect() as c:c.execute("INSERT INTO codex_keys(pool,status) VALUES('codex_250','available')")
        with patch.object(adapter,'rpc',side_effect=AssertionError('must not buy')):self.assertFalse(adapter.handle(a,1))
        with a.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM market_aibuy_attempts').fetchone()[0],0)

    def test_2500_unavailable_variant_never_substitutes_or_buys(self):
        a,path,p,calls,r=self.fixture(1000)
        with a.connect() as c:c.execute("UPDATE codex_jobs SET package=2500,title='Codex 2500',key_pool='codex_2500'")
        with patch.object(adapter,'rpc',side_effect=AssertionError('2500 is not a merchant contract')):self.assertTrue(adapter.handle(a,1));self.assertTrue(adapter.handle(a,1))
        with a.connect() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM market_aibuy_attempts').fetchone()[0],0)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM market_aibuy_notices').fetchone()[0],1)

    def test_ambiguous_variant_never_falls_through_to_a_legacy_smaller_key(self):
        a,path,p,calls,r=self.fixture(250)
        with a.connect() as c:
            c.execute("UPDATE codex_jobs SET title='Codex 250 / 500 / 1000'")
            c.execute("INSERT INTO codex_keys(pool,status) VALUES('codex_250','available')")
        with patch.object(adapter,'rpc',side_effect=AssertionError('ambiguous order cannot buy')):self.assertTrue(adapter.handle(a,1))
        with a.connect() as c:
            self.assertIsNone(c.execute('SELECT key_id FROM codex_jobs').fetchone()[0])
            self.assertEqual(c.execute('SELECT COUNT(*) FROM market_aibuy_attempts').fetchone()[0],0)

    @unittest.skipUnless(os.name=='posix','Real cross-thread flock exercised by Linux CI')
    def test_concurrent_customer_validation_has_one_purchase_and_one_activation(self):
        import concurrent.futures
        a,path,p,calls,result=self.fixture();requests=[]
        def rpc(jid,action='procure'):requests.append(action);time.sleep(.05);return result
        with patch.object(adapter,'rpc',rpc),concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
            list(workers.map(lambda _:adapter.handle(a,1),range(2)))
        self.assertEqual(requests.count('procure'),1);self.assertEqual(calls.count('activate'),1)

    def test_lost_activation_reply_and_restart_never_rebuy_or_resubmit_all_products_platforms(self):
        for platform in ('funpay','playerok'):
            for code in (0,250,500,1000):
                with self.subTest(platform=platform,code=code):
                    a,path,p,calls,result=self.fixture(code,platform);requests=[]
                    def rpc(jid,action='procure'):
                        requests.append(action);return result if action=='procure' else {'cost_rub':result['cost_rub']}
                    with patch.object(adapter,'rpc',rpc):
                        self.assertTrue(adapter.handle(a,1))
                        with a.connect() as c:
                            r=c.execute('SELECT * FROM market_aibuy_attempts').fetchone();self.assertEqual(r['dispatched'],1)
                            self.assertEqual(c.execute('SELECT status FROM codex_jobs').fetchone()[0],'submitting')
                            c.execute('UPDATE market_aibuy_attempts SET next_at=0')
                        self.assertTrue(adapter.handle(a,1));adapter.drive(a,1)
                    self.assertEqual(requests,['procure','attest']);self.assertEqual(calls,['verifyCdk','activate','status'])
                    with a.connect() as c:
                        self.assertEqual(c.execute('SELECT status FROM codex_jobs').fetchone()[0],'success')
                        r=c.execute('SELECT * FROM market_aibuy_attempts').fetchone();self.assertEqual(r['state'],'completed');self.assertIsNone(r['encrypted_session'])
                        self.assertEqual(c.execute('SELECT COUNT(*) FROM codex_keys').fetchone()[0],1)
                        self.assertEqual(c.execute("SELECT COUNT(*) FROM market_aibuy_notices WHERE event='1:completed'").fetchone()[0],1)
                    adapter.drive(a,1);self.assertEqual(calls.count('activate'),1)
                    self.assertNotIn(b'ISOLATED-MARKET-KEY',(path/'activity.db').read_bytes())

    def test_wrong_product_reply_and_wrong_key_workflow_stop_before_dispatch(self):
        for wrong in ('reply','workflow'):
            a,path,p,calls,result=self.fixture(500)
            if wrong=='reply':result['credits']=250
            else:
                a._post_json=lambda *a,**kw:{'ok':True,'workflow':'claude_pro','status':'unused'}
            with patch.object(adapter,'rpc',lambda *a:result):self.assertTrue(adapter.handle(a,1))
            with a.connect() as c:
                r=c.execute('SELECT * FROM market_aibuy_attempts').fetchone();self.assertEqual(r['dispatched'],0)
                self.assertEqual(c.execute('SELECT status FROM codex_jobs').fetchone()[0],'waiting_data' if wrong=='reply' else 'ready')
            self.assertNotIn('activate',calls)

    def test_funds_deadline_is_durable_once_and_same_demand_resumes(self):
        a,path,p,calls,result=self.fixture();rpc_calls=[]
        def rpc(*args):rpc_calls.append(args);return {'state':'funds_wait','required_minor':7500,'balance_minor':1}
        with patch.object(adapter,'rpc',rpc):
            adapter.handle(a,1)
            with a.connect() as c:c.execute('UPDATE market_aibuy_attempts SET funds_at=?,next_at=0',(time.time()-901,))
            adapter.drive(a,1)
            with a.connect() as c:c.execute('UPDATE market_aibuy_attempts SET next_at=0')
            adapter.drive(a,1)
        with a.connect() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM market_aibuy_notices').fetchone()[0],2)
            self.assertEqual(c.execute('SELECT dispatched FROM market_aibuy_attempts').fetchone()[0],0)
            c.execute('UPDATE market_aibuy_attempts SET next_at=0')
        with patch.object(adapter,'rpc',lambda *args:result):adapter.drive(a,1)
        self.assertEqual(calls.count('activate'),1)

    def test_notification_identity_and_lost_send_are_not_retried(self):
        a,path,p,calls,result=self.fixture();adapter.init(a)
        with a.connect() as c:j=c.execute('SELECT * FROM codex_jobs').fetchone()
        adapter.notice(a,j,'completed','Fixture owner only');sends=[]
        fake=types.SimpleNamespace(telegram_config=lambda:('owner','isolated-token'),telegram_call=lambda *args:{'username':'myadminiibot'},send_message=lambda *args:sends.append(args))
        with patch.dict(sys.modules,{'funpay_telegram_fallback':fake}):adapter.send_notices(a)
        self.assertEqual(sends,[])
        def lost(*args):sends.append(args);raise TimeoutError('lost send receipt')
        fake.telegram_call=lambda *args:{'username':'funpaypulseaibot'};fake.send_message=lost
        with patch.dict(sys.modules,{'funpay_telegram_fallback':fake}):adapter.send_notices(a);adapter.send_notices(a)
        self.assertEqual(len(sends),1)
        with a.connect() as c:self.assertEqual(c.execute('SELECT state FROM market_aibuy_notices').fetchone()[0],'uncertain')

    def test_root_rejects_old_and_dispatched_jobs_before_payment_or_browser(self):
        a,path,p,calls,result=self.fixture(0);adapter.init(a)
        with patch.object(adapter,'drive',lambda *a:None):adapter.handle(a,1)
        with patch.object(root,'ACTIVITY',str(path/'activity.db')):
            for sql,args in [("UPDATE codex_jobs SET source_created_at=?",(iso(-1000),)),("UPDATE codex_jobs SET source_created_at=?,aiee_order_id='already-sent'",(iso(-30),))]:
                with a.connect() as c:c.execute(sql,args)
                with self.assertRaisesRegex(ValueError,'supplier_(order_ineligible|prior_fulfillment)'):
                    root.validate_job(1,policy=p,payment_reader=lambda *a:(_ for _ in ()).throw(AssertionError('must not query payment')))

    def test_market_and_website_uncertain_debits_are_isolated_per_order(self):
        vault=root.b.Vault(':memory:',os.urandom(32))
        vault.claim('website-fixture',1000,27600,[])
        self.assertTrue(vault.claim('market-fixture',0,13400,[])[0])
        self.assertFalse(vault.claim('website-fixture',1000,27600,[])[0])
        self.assertFalse(vault.claim('market-fixture',0,13400,[])[0])
        vault.db.close()

    def test_waiting_customer_can_return_after_a_month_without_blocking_new_orders(self):
        for platform in ('funpay','playerok'):
            with self.subTest(platform=platform):
                a,path,p,calls,result=self.fixture(250,platform)
                p['marketplaces']['enabledAfter']=iso(-40*86400)
                adapter.CONFIG.write_text(json.dumps(p))
                with a.connect() as c:
                    c.execute('UPDATE codex_jobs SET created_at=?,source_created_at=?,note_url=NULL,email=NULL',(iso(-31*86400),iso(-31*86400)))
                    c.execute("INSERT INTO codex_jobs SELECT 2,'SECOND-ORDER',account_id,platform,package,product_type,title,status,key_pool,key_id,aiee_order_id,started_at,last_poll_status,?,?,updated_at,auto_submit_allowed,archived_at,'https://notebrio.com/n/second','fixture@example.invalid',finished_at,error,instruction_sent_at,anchor_message_id,chat_id FROM codex_jobs WHERE id=1",(iso(-30),iso(-30)))
                requests=[]
                def rpc(jid,action='procure'):
                    requests.append((jid,action));return result
                original=adapter.capture
                def capture(automation,job):
                    if job['id']==1 and not job['note_url']:raise ValueError('supplier_session_required')
                    return original(automation,job)
                with patch.object(adapter,'capture',capture),patch.object(adapter,'rpc',rpc):
                    self.assertTrue(adapter.handle(a,1))
                    self.assertEqual(requests,[])
                    with a.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM market_aibuy_attempts').fetchone()[0],0)
                    self.assertTrue(adapter.handle(a,2))
                    self.assertEqual(requests,[(2,'procure'),(2,'attest')])
                    with a.connect() as c:
                        c.execute("UPDATE codex_jobs SET note_url='https://notebrio.com/n/fresh',email='fixture@example.invalid' WHERE id=1")
                    first_result={**result,'code':'ISOLATED-RETURNING-KEY','trade_no':'30000000000029'}
                    def returning_rpc(jid,action='procure'):
                        requests.append((jid,action));return first_result
                    with patch.object(adapter,'rpc',returning_rpc):self.assertTrue(adapter.handle(a,1))
                self.assertEqual(requests,[(2,'procure'),(2,'attest'),(1,'procure'),(1,'attest')])
                self.assertEqual(calls.count('activate'),2)

    def test_root_paid_order_finance_and_fresh_session_checks_before_purchase(self):
        for platform in ('funpay','playerok'):
            for code in (0,250,500,1000):
                with self.subTest(platform=platform,code=code):
                    a,path,p,calls,result=self.fixture(code,platform)
                    adapter.init(a)
                    with patch.object(adapter,'drive',lambda *a:None):adapter.handle(a,1)
                    fee=path/'fee.json';fee.write_text(json.dumps({'enabled':True,'minimum_profit_rub':0}))
                    guard=path/'guard.py';guard.write_text("from decimal import Decimal\ndef assess(financial,policy,lookup,now=None):\n cost=Decimal(lookup(financial['title'])['cost_rub']);profit=Decimal(str(financial['gross_rub']))-Decimal('100')-cost\n return {'allowed':profit>=0,'profit_bound_rub':str(profit)}\n")
                    rate={'enabled':True,'costCheckedAt':iso(-30),'costMaxAgeMs':86400000,'rubPerCny':13.2,'minimumProfitRub':0}
                    financial={'platform':platform,'order_id':'FIXTURE-ORDER','payment_verified':True,'quantity':1,'title':'fixture','gross_rub':7000}
                    with patch.multiple(root,ACTIVITY=str(path/'activity.db'),KEY=str(path/'key'),FEE_POLICY=fee,GUARD=str(guard)),patch.object(root.b,'protected',lambda _:rate):
                        r=root.validate_job(1,policy=p,payment_reader=lambda *a:financial)
                        self.assertEqual(r['credits'],code);self.assertEqual(r['amount_minor'],common.PRICES[code]);self.assertGreater(float(r['cost_rub']),0)
                        financial['gross_rub']=1
                        with self.assertRaisesRegex(ValueError,'margin_hold'):root.validate_job(1,policy=p,payment_reader=lambda *a:financial)
                        financial['gross_rub']=7000;rate['costCheckedAt']=iso(-999999)
                        with self.assertRaisesRegex(ValueError,'cost_unconfirmed'):root.validate_job(1,policy=p,payment_reader=lambda *a:financial)
                        rate['costCheckedAt']=iso(-30)
                        with a.connect() as c:c.execute("INSERT INTO marketplace_refund_holds VALUES(?,?,?)",(platform,'2' if platform=='funpay' else 'playerok:fixture','FIXTURE-ORDER'))
                        with self.assertRaisesRegex(ValueError,'refund_hold'):root.validate_job(1,policy=p,payment_reader=lambda *a:financial)

    def test_fresh_funpay_payment_cannot_change_product_quantity_or_currency(self):
        a,path,p,calls,result=self.fixture(500)
        worker=path/'worker.db';db=sqlite3.connect(worker)
        db.executescript('CREATE TABLE account(id TEXT,status TEXT,currency TEXT); CREATE TABLE broker_order_cache(account_id TEXT,order_id TEXT,status TEXT,occurred_at TEXT,quantity REAL); CREATE TABLE auto_delivery_reservation(order_id TEXT);')
        db.execute("INSERT INTO account VALUES('2','active','RUB')");db.execute("INSERT INTO broker_order_cache VALUES('2','FIXTURE-ORDER','paid',?,1)",(iso(-30),));db.commit();db.close()
        job={'account_id':'2','platform':'funpay','order_id':'FIXTURE-ORDER','contract_code':500}
        live={'id':'FIXTURE-ORDER','status':'paid','title':'Codex 500','price':2500,'quantity':1}
        with patch.object(root,'WORKER',str(worker)):
            self.assertEqual(root.paid(job,p,worker_read=lambda *a:[live])['gross_rub'],2500)
            for changed in ({'status':'refunded'},{'quantity':2},{'title':'Codex 250'}):
                with self.assertRaises(ValueError):root.paid(job,p,worker_read=lambda *a:[{**live,**changed}])
            with contextlib.closing(sqlite3.connect(worker)) as db:
                with db:db.execute("UPDATE account SET currency='USD'")
            with self.assertRaisesRegex(ValueError,'payment_unverified'):root.paid(job,p,worker_read=lambda *a:[live])

    def test_playerok_requires_authoritative_paid_outgoing_deal(self):
        a,path,p,calls,result=self.fixture(0,'playerok')
        profit=path/'player.db';db=sqlite3.connect(profit)
        db.execute('CREATE TABLE external_orders(platform TEXT,order_id TEXT,status TEXT,occurred_at TEXT,title TEXT,payload_json TEXT,gross_revenue_rub REAL,commission_rub REAL)')
        db.execute("INSERT INTO external_orders VALUES('playerok','FIXTURE-ORDER','paid',?,'Claude Pro 1 месяц','{}',2299,100)",(iso(-30),));db.commit();db.close()
        job={'platform':'playerok','order_id':'FIXTURE-ORDER','contract_code':0}
        with patch.object(root,'PROFIT',str(profit)):
            good={'id':'FIXTURE-ORDER','status':'PAID','direction':'OUT'}
            self.assertEqual(root.paid(job,p,player_read=lambda *a:good)['gross_rub'],2299)
            for changed in ({'status':'SENT'},{'direction':'IN'},{'id':'ANOTHER'}):
                with self.assertRaisesRegex(ValueError,'payment_unverified'):root.paid(job,p,player_read=lambda *a:{**good,**changed})

if __name__=='__main__':unittest.main()
