import importlib.util,json,os,tempfile,unittest
from pathlib import Path

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('broker',HERE/'aibuy-broker.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
spec=importlib.util.spec_from_file_location('browser',HERE/'aibuy-browser.py');ui=importlib.util.module_from_spec(spec);spec.loader.exec_module(ui)


class Tests(unittest.TestCase):
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
            with self.assertRaises(ValueError):c.claim('another-fixture',250,7500,['old'])
            with self.assertRaises(ValueError):c.claim('website-fixture',1000,27600,['old'])
            a.receive('website-fixture',{'receipt':{'json':{'data':{'tradeNo':'12345678901234'}}}})
            self.assertNotIn(b'tradeNo',Path(file).read_bytes())
            a.db.close();c.db.close();a=b.Vault(file,key)
            self.assertFalse(a.claim('website-fixture',500,14500,['old'])[0]);a.db.close()

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


if __name__=='__main__':unittest.main()
