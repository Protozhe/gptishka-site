import importlib.util,json,os,tempfile,unittest
from pathlib import Path

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('broker',HERE/'aibuy-broker.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
spec=importlib.util.spec_from_file_location('browser',HERE/'aibuy-browser.py');ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui)


class Tests(unittest.TestCase):
    def test_claude_purchase_and_lost_response_recovery_never_select_codex_or_repay(self):
        for lost in (False,True):
            with self.subTest(lost=lost):
                oid,key,intent,receipt=self.fixture();intent['credits']=0
                receipt.update(commodity_id=29,race='',amount='134',secret='ISOLATED-CLAUDE-PRO-KEY')
                calls=[];verified=[]
                def browser(data):
                    self.assertEqual(data['credits'],0);calls.append(data['mode'])
                    if data['mode']=='prepare':return {'amount_minor':13400,'balance_minor':63700,'history':[]}
                    if data['mode']=='buy' and lost:raise TimeoutError('isolated lost receipt')
                    return {'receipt':{'json':{'data':{'tradeNo':receipt['trade_no']}}},'history':[receipt],'reference_history':[receipt]}
                args=dict(browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:verified.append(a))
                if lost:
                    with self.assertRaisesRegex(ValueError,'purchase_unconfirmed'):b.procure(oid,{'enabled':True},**args)
                first=b.procure(oid,{'enabled':True},**args);again=b.procure(oid,{'enabled':True},**args)
                self.assertEqual(first,again);self.assertEqual(first['product_key'],'claude-pro');self.assertEqual(first['amount_minor'],13400)
                self.assertEqual(calls,['prepare','buy','history'] if lost else ['prepare','buy']);self.assertEqual(len(verified),1)
                self.assertNotIn(receipt['secret'].encode(),(b.STATE/'journal.sqlite').read_bytes())

    def test_claude_receipt_requires_exact_item_no_variant_one_paid_balance_key(self):
        for changed in ({'commodity_id':75},{'race':'250点数额度'},{'card_num':2},{'pay_id':2},{'status':0},{'amount':'134.01'}):
            v=b.Vault(':memory:',os.urandom(32));v.claim('fixture',0,13400,[])
            v.receive('fixture',{'receipt':{'json':{'data':{'tradeNo':'20000000000029'}}}})
            row=v.db.execute('SELECT * FROM buys').fetchone()
            receipt={'trade_no':'20000000000029','commodity_id':29,'race':'','card_num':1,'pay_id':1,'status':1,'amount':'134',**changed}
            with self.assertRaisesRegex(ValueError,'receipt_mismatch'):b.matching_receipt(row,[receipt],v)
            v.db.close()

    def test_claude_key_oracle_uses_workflow_not_a_key_prefix_and_is_read_only(self):
        from unittest.mock import patch
        for data,valid in (({'ok':True,'status':'unused','workflow':'claude_pro'},True),({'ok':True,'status':'unused','workflow':'codex_250'},False),({'ok':True,'status':'done','workflow':'claude_pro'},False)):
            class Response:
                def __enter__(self):return self
                def __exit__(self,*a):pass
                def read(self,*a):return json.dumps(data).encode()
            class Opener:
                def open(self,req,**kw):
                    if not req.full_url.endswith('a=verifyCdk') or json.loads(req.data)['product']!='claude':raise AssertionError('wrong action/product')
                    return Response()
            with patch.object(b,'build_opener',lambda *a:Opener()):
                if valid:self.assertTrue(b.verify_key('ARBITRARY-ISOLATED-KEY',0))
                else:
                    with self.assertRaisesRegex(ValueError,'key_quarantined'):b.verify_key('ARBITRARY-ISOLATED-KEY',0)

    def test_claude_checkout_requires_no_variants_and_quantity_one(self):
        for count in (0,1):
            events=[]
            class Locator:
                def __init__(self,selector):self.selector=selector
                def wait_for(self,**kw):events.append('ready')
                def count(self):return count if self.selector=='.switch-race' else 1
                def fill(self,value):events.append('qty:'+value)
                def dispatch_event(self,name):events.append(name)
            class Page:
                def locator(self,selector):return Locator(selector)
            if count:
                with self.assertRaisesRegex(ValueError,'variant_unconfirmed'):ui.select_purchase_ui(Page(),0)
            else:
                result=ui.select_purchase_ui(Page(),0);self.assertEqual(result[:2],('',None));self.assertEqual(events,['ready','qty:1','change'])

    @unittest.skipUnless(os.name=='posix','Unix socket directory permissions')
    def test_private_service_umask_preserves_web_group_socket_access(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as d:
            directory=Path(d)/'runtime'
            mask=os.umask(0o077)
            try:
                with patch.object(b,'SOCKET',str(directory/'rpc.sock')),patch.object(b.os,'chown') as chown:
                    b.prepare_socket_directory(os.getgid())
                    self.assertEqual(directory.stat().st_mode&0o777,0o750)
                    chown.assert_called_once_with(directory,0,os.getgid())
                    os.chmod(directory,0o700)
                    b.prepare_socket_directory(os.getgid())
                    self.assertEqual(directory.stat().st_mode&0o777,0o750)
            finally:os.umask(mask)

    def fixture(self):
        from unittest.mock import patch
        directory=tempfile.TemporaryDirectory();self.addCleanup(directory.cleanup)
        key=os.urandom(32)
        for p in (patch.object(b,'STATE',Path(directory.name)),patch.object(b,'session',lambda:({'merchantId':1},key,[]))):
            p.start();self.addCleanup(p.stop)
        oid='c'+'a'*24
        intent={'credits':250,'stock_available':False}
        receipt={'trade_no':'20000000000000','commodity_id':75,'race':'250点数额度','card_num':1,'pay_id':1,'status':1,'amount':'75','contact':'shop-random-value','secret':'ISOLATED-TEST-FIXTURE-250'}
        return oid,key,intent,receipt

    def test_full_purchase_and_restart_returns_same_asset_without_second_browser_payment(self):
        oid,key,intent,receipt=self.fixture();calls=[];verified=[]
        def browser(data):
            calls.append(data['mode'])
            if data['mode']=='prepare':return {'amount_minor':7500,'balance_minor':100000,'history':[]}
            self.assertEqual(data['request_no'],b.request_no(oid))
            return {'receipt':{'json':{'code':200,'data':{'tradeNo':receipt['trade_no']}}},'history':[receipt]}
        first=b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:verified.append(a))
        second=b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:verified.append(a))
        self.assertEqual(first,second);self.assertEqual(calls,['prepare','buy']);self.assertEqual(len(verified),1)
        self.assertNotIn(receipt['secret'].encode(),(b.STATE/'journal.sqlite').read_bytes())

    def test_timeout_reconciles_by_correlation_and_never_clicks_again(self):
        oid,key,intent,receipt=self.fixture();calls=[]
        def browser(data):
            calls.append(data['mode'])
            if data['mode']=='prepare':return {'amount_minor':7500,'balance_minor':100000,'history':[]}
            if data['mode']=='buy':raise TimeoutError('lost response after accepted payment')
            self.assertEqual(data['request_no'],b.request_no(oid))
            return {'history':[receipt],'reference_history':[receipt]}
        with self.assertRaisesRegex(ValueError,'purchase_unconfirmed'):b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True)
        result=b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True)
        self.assertEqual(result['code'],receipt['secret']);self.assertEqual(calls,['prepare','buy','history'])

    def test_funds_shortage_does_not_acquire_a_payment_claim(self):
        oid,key,intent,receipt=self.fixture()
        def browser(data):
            self.assertEqual(data['mode'],'prepare');return {'amount_minor':7500,'balance_minor':100,'history':[]}
        result=b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True)
        self.assertEqual(result['state'],'funds_wait')
        v=b.Vault(b.STATE/'journal.sqlite',key);self.assertEqual(v.db.execute('SELECT COUNT(*) FROM buys').fetchone()[0],0);v.db.close()

    def test_delivery_delay_does_not_poison_the_asset_and_later_key_is_recovered(self):
        oid,key,intent,receipt=self.fixture();calls=[]
        def browser(data):
            calls.append(data['mode'])
            if data['mode']=='prepare':return {'amount_minor':7500,'balance_minor':100000,'history':[]}
            return {'receipt':{'json':{'data':{'tradeNo':receipt['trade_no']}}},'history':[{**receipt,'secret':''} if data['mode']=='buy' else receipt]}
        with self.assertRaisesRegex(ValueError,'delivery_pending'):b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True)
        self.assertEqual(b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True)['credits'],250)
        self.assertEqual(calls,['prepare','buy','history'])

    def test_cross_process_claim_and_restart_never_replays_payment(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'j.sqlite';key=os.urandom(32);a=b.Vault(file,key);c=b.Vault(file,key)
            yes,row=a.claim('website-fixture',500,14500,['old'])
            self.assertTrue(yes);self.assertFalse(c.claim('website-fixture',500,14500,['old'])[0])
            self.assertTrue(c.claim('another-fixture',250,7500,['old'])[0])
            self.assertFalse(a.claim('another-fixture',250,7500,['old'])[0])
            with self.assertRaises(ValueError):c.claim('website-fixture',1000,27600,['old'])
            a.receive('website-fixture',{'receipt':{'json':{'data':{'tradeNo':'12345678901234'}}}})
            self.assertNotIn(b'tradeNo',Path(file).read_bytes())
            a.db.close();c.db.close();a=b.Vault(file,key)
            self.assertFalse(a.claim('website-fixture',500,14500,['old'])[0])
            self.assertFalse(a.claim('another-fixture',250,7500,['old'])[0]);a.db.close()

    def test_uncertain_purchase_does_not_block_another_or_adopt_its_receipt(self):
        for lost in (False,True):
            with self.subTest(lost=lost):
                oid,key,intent,receipt=self.fixture()
                other='c'+'b'*24;later={**receipt,'trade_no':'30000000000000','secret':'ISOLATED-OTHER-ORDER-KEY'}
                calls=[]
                def uncertain(data):
                    calls.append(('first',data['mode']))
                    if data['mode']=='prepare':return {'amount_minor':7500,'balance_minor':100000,'history':[]}
                    if lost:raise TimeoutError('isolated ambiguous debit')
                    return {'dispatch_state':'sent_or_uncertain','receipt':{'http_status':500},'history':[],'reference_history':[]}
                args=dict(order_validator=lambda *a:intent,oracle=lambda *a:True)
                with self.assertRaisesRegex(ValueError,'purchase_unconfirmed'):
                    b.procure(oid,{'enabled':True},browser=uncertain,**args)
                v=b.Vault(b.STATE/'journal.sqlite',key)
                before=tuple(v.db.execute('SELECT * FROM buys WHERE order_id=?',(oid,)).fetchone());v.db.close()
                def buy_other(data):
                    calls.append(('other',data['mode']))
                    if data['mode']=='prepare':return {'amount_minor':7500,'balance_minor':92500,'history':[]}
                    return {'receipt':{'json':{'data':{'tradeNo':later['trade_no']}}},'history':[later]}
                second=b.procure(other,{'enabled':True},browser=buy_other,**args)
                self.assertEqual(second['code'],later['secret'])
                v=b.Vault(b.STATE/'journal.sqlite',key)
                self.assertEqual(tuple(v.db.execute('SELECT * FROM buys WHERE order_id=?',(oid,)).fetchone()),before);v.db.close()
                def unrelated_history(data):
                    calls.append(('first',data['mode']));self.assertEqual(data['mode'],'history')
                    self.assertEqual(data['request_no'],b.request_no(oid))
                    return {'history':[later],'reference_history':[]}
                with self.assertRaisesRegex(ValueError,'purchase_unconfirmed'):
                    b.procure(oid,{'enabled':True},browser=unrelated_history,**args)
                def recovered_history(data):
                    calls.append(('first',data['mode']));self.assertEqual(data['mode'],'history')
                    return {'history':[later,receipt],'reference_history':[receipt]}
                first=b.procure(oid,{'enabled':True},browser=recovered_history,**args)
                self.assertEqual(first['code'],receipt['secret'])
                def forbidden(*a):raise AssertionError('assigned orders must not repurchase')
                self.assertEqual(b.procure(other,{'enabled':True},browser=forbidden,**args),second)
                self.assertEqual(b.procure(oid,{'enabled':True},browser=forbidden,**args),first)
                self.assertEqual(calls.count(('first','buy')),1);self.assertEqual(calls.count(('other','buy')),1)

    def test_history_is_bound_to_owner_baseline_item_quantity_variant_price_and_balance_method(self):
        v=b.Vault(':memory:',os.urandom(32));_,row=v.claim('order-fixture',500,14500,['10000000000000'])
        r={'trade_no':'20000000000000','commodity_id':75,'race':'500点数额度','card_num':1,'pay_id':1,'status':1,'amount':'145.00','contact':'randomized-by-authenticated-shop'}
        self.assertEqual(b.matching_receipt(row,[r],v,[r])['trade_no'],r['trade_no'])
        for changes in ({'race':'250点数额度'},{'card_num':2},{'pay_id':14},{'commodity_id':64},{'status':0},{'amount':'146.00'},{'trade_no':'10000000000000'}):
            with self.assertRaises(ValueError):b.matching_receipt(row,[r],v,[{**r,**changes}])
        with self.assertRaises(ValueError):b.matching_receipt(row,[r],v,[r,{**r,'trade_no':'30000000000000'}])
        with self.assertRaises(ValueError):b.matching_receipt(row,[{**r,'contact':b.request_no('order-fixture')}],v)
        with self.assertRaises(ValueError):b.matching_receipt(row,[r],v,[])
        v.db.close()

    def test_safe_pre_click_failure_can_recover_but_never_replays_a_possible_click(self):
        oid,key,intent,receipt=self.fixture();calls=[];clicks=[]
        def browser(data):
            calls.append(data['mode'])
            if data['mode']=='prepare':return {'amount_minor':7500,'balance_minor':100000,'history':[]}
            if calls.count('buy')==1:return {'dispatch_state':'not_sent','error':'supplier_checkout_not_ready'}
            clicks.append('financial-click')
            return {'receipt':{'json':{'code':200,'data':{'tradeNo':receipt['trade_no']}}},'history':[receipt]}
        with self.assertRaisesRegex(ValueError,'checkout_not_ready'):
            b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True)
        v=b.Vault(b.STATE/'journal.sqlite',key);self.assertEqual(v.db.execute('SELECT state FROM buys').fetchone()[0],'not_sent');v.db.close()
        a=b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True)
        self.assertEqual(a['credits'],250);self.assertEqual(clicks,['financial-click'])
        self.assertEqual(calls,['prepare','buy','prepare','buy'])
        self.assertEqual(b.procure(oid,{'enabled':True},browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True),a)
        self.assertEqual(len(clicks),1)

    def test_safe_unsent_or_owner_reconciled_claim_does_not_block_another_order(self):
        v=b.Vault(':memory:',os.urandom(32));v.claim('first',250,7500,[])
        v.receive('first',{'dispatch_state':'not_sent','error':'supplier_checkout_not_ready'})
        self.assertTrue(v.claim('second',500,14500,[])[0])
        v.db.execute("UPDATE buys SET state='cancelled_no_charge' WHERE order_id='second'")
        self.assertTrue(v.claim('third',1000,27600,[])[0]);v.db.close()

    def test_browser_failure_proves_not_sent_only_before_the_click_boundary(self):
        from unittest.mock import patch
        def before(data,state):raise ValueError('supplier_checkout_not_ready')
        def after(data,state):state['started']=True;raise TimeoutError('lost response')
        with patch.object(ui,'_main',before):self.assertEqual(ui.main({'mode':'buy'}),{'error':'supplier_checkout_not_ready','dispatch_state':'not_sent'})
        with patch.object(ui,'_main',after),self.assertRaises(TimeoutError):ui.main({'mode':'buy'})

    def test_reference_search_rejects_an_ignored_filter(self):
        class Context:
            def __init__(self,ignored=False):self.request=self;self.forms=[];self.ignored=ignored
            def post(self,url,**kw):
                self.forms.append(kw['form']);control=kw['form']['equal-request_no']=='ab-'+'0'*40
                rows=[{'trade_no':'20000000000000'}] if self.ignored or not control else []
                class Response:
                    status=200
                    def json(self):return {'code':200,'data':{'list':rows}}
                return Response()
        c=Context();self.assertEqual(len(ui.reference_history(c,'ab-'+'a'*40)),1)
        self.assertEqual(c.forms[1]['equal-request_no'],'ab-'+'a'*40)
        with self.assertRaisesRegex(ValueError,'correlation_unconfirmed'):ui.reference_history(Context(True),'ab-'+'a'*40)

    def test_checkout_waits_for_async_payment_methods_before_selecting_exact_variant(self):
        events=[]
        class Locator:
            def __init__(self,kind):self.kind=kind
            def wait_for(self,**kw):events.append('ready')
            def filter(self,**kw):self.race=kw['has_text'];return self
            def count(self):return 1
            def get_attribute(self,name):return self.race
            def click(self):
                self.assert_ready=events==['ready'];events.append('select')
                if not self.assert_ready:raise AssertionError('unbound storefront handlers')
            def fill(self,value):events.append('quantity:'+value)
            def dispatch_event(self,name):events.append(name)
        class Page:
            def locator(self,selector):return Locator(selector)
            def wait_for_function(self,expression,**kw):
                if kw['arg']!='1000点数额度' or events!=['ready','select']:raise AssertionError('wrong selection')
                events.append('confirmed')
        self.assertEqual(ui.select_purchase_ui(Page(),1000)[0],'1000点数额度')
        self.assertEqual(events,['ready','select','confirmed','quantity:1','change'])

    def test_sending_claim_recovers_original_order_from_response_not_unrelated_new_order(self):
        v=b.Vault(':memory:',os.urandom(32));v.claim('order-fixture',250,7500,['10000000000000'])
        v.receive('order-fixture',{'receipt':{'json':{'code':200,'data':{'tradeNo':'20000000000000'}}}})
        row=v.db.execute('SELECT * FROM buys').fetchone()
        r={'trade_no':'20000000000000','commodity_id':75,'race':'250点数额度','card_num':1,'pay_id':1,'status':1,'amount':'75','contact':b.request_no('order-fixture')}
        self.assertEqual(b.matching_receipt(row,[r,{**r,'trade_no':'30000000000000'}],v)['trade_no'],r['trade_no'])
        v.db.close()

    def test_pause_and_order_validation_happen_before_session_or_browser_access(self):
        def fail(*args):raise AssertionError('browser must not be called')
        with self.assertRaisesRegex(ValueError,'owner_topup_pause'):
            b.procure('c'+'a'*24,{'enabled':True,'paused':True},browser=fail,order_validator=fail)
        with self.assertRaisesRegex(ValueError,'request_invalid'):
            b.procure('old/../order',{'enabled':True},browser=fail,order_validator=fail)

    def reserve_fixture(self):
        oid,key,intent,receipt=self.fixture()
        intent.update(credits=1000,created_at='2026-10-25T00:00:00Z',payment_at='2026-10-25T00:01:00Z')
        receipt.update(race='1000点数额度',amount='276',secret='ISOLATED-AIBUY-FIXTURE-1000')
        code='ISOLATED-AIEE-RESERVE-1000';fingerprint=b.sha256(code.encode()).hexdigest()
        v=b.Vault(b.STATE/'journal.sqlite',key)
        v.db.execute("INSERT INTO prepaid_aiee_reserves VALUES(?,?,?,?,?,?,NULL,'available',NULL,NULL)",
            (fingerprint,1000,v.seal(code,fingerprint),27600,4140,'2026-10-24'))
        v.db.close()
        policy={'enabled':True,'prepaidAieeFallback':{'enabled':True,'enabledAfter':'2026-10-24T23:00:00Z'}}
        return oid,key,intent,receipt,code,policy

    def test_prepaid_reserve_is_not_primary_and_stays_encrypted(self):
        oid,key,intent,receipt,code,policy=self.reserve_fixture();calls=[]
        def browser(data):
            calls.append(data['mode'])
            if data['mode']=='prepare':return {'amount_minor':27600,'balance_minor':100000,'history':[]}
            return {'receipt':{'json':{'data':{'tradeNo':receipt['trade_no']}}},'history':[receipt]}
        def forbidden(*args):raise AssertionError('reserve must not be checked on a healthy primary')
        result=b.procure(oid,policy,browser=browser,order_validator=lambda *a:intent,oracle=lambda *a:True,fallback_oracle=forbidden)
        self.assertEqual(result['code'],receipt['secret']);self.assertEqual(calls,['prepare','buy'])
        v=b.Vault(b.STATE/'journal.sqlite',key)
        self.assertEqual(v.db.execute('SELECT state FROM prepaid_aiee_reserves').fetchone()[0],'available');v.db.close()
        self.assertNotIn(code.encode(),(b.STATE/'journal.sqlite').read_bytes())

    def test_proven_precharge_failures_use_reserve_and_restart_cannot_buy_again(self):
        for failure in ('supplier_login_required','supplier_checkout_not_ready','supplier_balance_insufficient'):
            with self.subTest(failure=failure):
                oid,key,intent,receipt,code,policy=self.reserve_fixture();calls=[];checks=[]
                def browser(data):
                    calls.append(data['mode'])
                    if failure=='supplier_login_required':raise ValueError(failure)
                    if data['mode']=='prepare':return {'amount_minor':27600,'balance_minor':0 if failure.endswith('insufficient') else 100000,'history':[]}
                    return {'dispatch_state':'not_sent','error':failure}
                args=dict(browser=browser,order_validator=lambda *a:intent,fallback_oracle=lambda *a:checks.append(a))
                result=b.procure(oid,policy,**args);again=b.procure(oid,policy,**args)
                self.assertEqual(result,again);self.assertEqual(result['code'],code)
                self.assertEqual(result['amount_minor'],27600);self.assertEqual(result['usdt_minor'],4140)
                self.assertEqual(result['activationSiteUrl'],'https://aiee.fun');self.assertEqual(len(checks),1)
                self.assertEqual(calls,['prepare','buy'] if failure.endswith('not_ready') else ['prepare'])
                v=b.Vault(b.STATE/'journal.sqlite',key)
                self.assertEqual(v.db.execute('SELECT state FROM buys WHERE order_id=?',(oid,)).fetchone()[0],'cancelled_no_charge')
                self.assertEqual(v.db.execute('SELECT order_id FROM prepaid_aiee_reserves').fetchone()[0],oid);v.db.close()

    def test_ambiguous_primary_claim_never_consumes_reserve(self):
        for state in ('sending','received','verified','cancelled_no_charge'):
            with self.subTest(state=state):
                oid,key,intent,receipt,code,policy=self.reserve_fixture()
                v=b.Vault(b.STATE/'journal.sqlite',key);v.claim(oid,1000,27600,[])
                v.db.execute('UPDATE buys SET state=? WHERE order_id=?',(state,oid))
                def forbidden(*args):raise AssertionError('reserve oracle must not run')
                self.assertIsNone(b.prepaid_fallback(v,oid,1000,policy,'supplier_login_required',lambda *a:intent,forbidden))
                self.assertEqual(v.db.execute('SELECT state FROM prepaid_aiee_reserves').fetchone()[0],'available');v.db.close()

    def test_post_click_timeout_and_captcha_never_use_reserve(self):
        for failure in ('supplier_human_check','supplier_requires_review','supplier_browser_unconfirmed','timeout_after_click'):
            with self.subTest(failure=failure):
                oid,key,intent,receipt,code,policy=self.reserve_fixture()
                def browser(data):
                    if failure=='timeout_after_click':
                        if data['mode']=='prepare':return {'amount_minor':27600,'balance_minor':100000,'history':[]}
                        raise TimeoutError('ambiguous dispatch')
                    raise ValueError(failure)
                def forbidden(*args):raise AssertionError('reserve must stay untouched')
                with self.assertRaises(ValueError):b.procure(oid,policy,browser=browser,order_validator=lambda *a:intent,fallback_oracle=forbidden)
                v=b.Vault(b.STATE/'journal.sqlite',key)
                self.assertEqual(v.db.execute('SELECT state FROM prepaid_aiee_reserves').fetchone()[0],'available');v.db.close()

    def test_old_unpaid_wrong_product_and_disabled_fallback_stay_held(self):
        for changes in ('old_created','old_paid','missing_paid','wrong_product','disabled','future_cutoff'):
            with self.subTest(changes=changes):
                oid,key,intent,receipt,code,policy=self.reserve_fixture()
                if changes=='old_created':intent['created_at']='2026-10-23T00:00:00Z'
                if changes=='old_paid':intent['payment_at']='2026-10-23T00:00:00Z'
                if changes=='missing_paid':intent.pop('payment_at')
                if changes=='wrong_product':intent['credits']=500
                if changes=='disabled':policy['prepaidAieeFallback']['enabled']=False
                if changes=='future_cutoff':policy['prepaidAieeFallback']['enabledAfter']='2099-01-01T00:00:00Z'
                def browser(data):raise ValueError('supplier_login_required')
                def forbidden(*args):raise AssertionError('reserve check must not run')
                with self.assertRaisesRegex(ValueError,'supplier_login_required'):
                    b.procure(oid,policy,browser=browser,order_validator=lambda *a:intent,fallback_oracle=forbidden)

    def test_bad_reserve_or_unprofitable_order_cannot_claim_key(self):
        for failure in ('supplier_fallback_key_unverified','supplier_margin_below_minimum'):
            with self.subTest(failure=failure):
                oid,key,intent,receipt,code,policy=self.reserve_fixture()
                def browser(data):raise ValueError('supplier_login_required')
                def validator(*args):
                    if len(args)>1 and failure=='supplier_margin_below_minimum':raise ValueError(failure)
                    return intent
                def oracle(*args):raise ValueError(failure)
                with self.assertRaisesRegex(ValueError,failure):
                    b.procure(oid,policy,browser=browser,order_validator=validator,fallback_oracle=oracle)
                v=b.Vault(b.STATE/'journal.sqlite',key)
                self.assertEqual(v.db.execute('SELECT COUNT(*) FROM buys').fetchone()[0],0)
                self.assertEqual(v.db.execute('SELECT state FROM prepaid_aiee_reserves').fetchone()[0],'available');v.db.close()

    def test_reserve_claim_is_exclusive_and_seals_primary_atomically(self):
        oid,key,intent,receipt,code,policy=self.reserve_fixture()
        v=b.Vault(b.STATE/'journal.sqlite',key);other=b.Vault(b.STATE/'journal.sqlite',key)
        def oracle(*args):
            self.assertIsNotNone(b.prepaid_fallback(other,'c'+'b'*24,1000,policy,'supplier_login_required',lambda *a:intent,lambda *a:True))
        with self.assertRaisesRegex(ValueError,'stock_changed'):
            b.prepaid_fallback(v,oid,1000,policy,'supplier_login_required',lambda *a:intent,oracle)
        self.assertIsNone(v.db.execute('SELECT * FROM buys WHERE order_id=?',(oid,)).fetchone())
        self.assertEqual(v.db.execute('SELECT order_id FROM prepaid_aiee_reserves').fetchone()[0],'c'+'b'*24)
        v.db.close();other.db.close()

    def test_reserve_verification_is_read_only_and_checks_canonical_product_not_prefix(self):
        from unittest.mock import patch
        class Response:
            def __init__(self,payload):self.payload=payload
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return json.dumps(self.payload).encode()
        class Opener:
            def __init__(self,query,verify):self.query=query;self.verify=verify;self.actions=[]
            def open(self,request,**kwargs):
                self.assert_url=request.full_url=='https://aiee.fun/api/auth.php'
                if not self.assert_url:raise AssertionError('wrong provider')
                action=json.loads(request.data)['action'];self.actions.append(action)
                if action not in ('query_code','verify_code'):raise AssertionError('not a read-only key check')
                return Response(self.query if action=='query_code' else self.verify)
        q={'success':True,'status':'active'};v={'success':True,'plan_type':'codex1000','sid':'isolated','require_cookie':0}
        for query,verified,success in ((q,v,True),({**q,'order_id':'existing'},v,False),(q,{**v,'plan_type':'codex500'},False),(q,{**v,'can_submit':False},False)):
            opener=Opener(query,verified)
            with patch.object(b,'build_opener',lambda *args:opener):
                if success:self.assertTrue(b.verify_aiee_key('ISOLATED-TEST-KEY',1000))
                else:
                    with self.assertRaisesRegex(ValueError,'fallback_key_unverified'):b.verify_aiee_key('ISOLATED-TEST-KEY',1000)
            self.assertEqual(opener.actions,['query_code','verify_code'])


if __name__=='__main__':unittest.main()
