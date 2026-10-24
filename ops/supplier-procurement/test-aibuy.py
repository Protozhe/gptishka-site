import importlib.util,json,os,tempfile,unittest
from pathlib import Path

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('broker',HERE/'aibuy-broker.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)


class Tests(unittest.TestCase):
    def fixture(self):
        from unittest.mock import patch
        directory=tempfile.TemporaryDirectory();self.addCleanup(directory.cleanup)
        key=os.urandom(32)
        for p in (patch.object(b,'STATE',Path(directory.name)),patch.object(b,'session',lambda:({'merchantId':1},key,[]))):
            p.start();self.addCleanup(p.stop)
        oid='c'+'a'*24
        intent={'credits':250,'stock_available':False}
        receipt={'trade_no':'20000000000000','commodity_id':75,'race':'250点数额度','card_num':1,'pay_id':1,'status':1,'amount':'75','contact':b.request_no(oid),'secret':'ISOLATED-TEST-FIXTURE-250'}
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
            return {'history':[receipt]}
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
        r={'trade_no':'20000000000000','commodity_id':75,'race':'500点数额度','card_num':1,'pay_id':1,'status':1,'amount':'145.00','contact':b.request_no('order-fixture')}
        self.assertEqual(b.matching_receipt(row,[r],v)['trade_no'],r['trade_no'])
        for changes in ({'race':'250点数额度'},{'card_num':2},{'pay_id':14},{'commodity_id':64},{'status':0},{'amount':'146.00'},{'trade_no':'10000000000000'},{'contact':'unrelated-owner-purchase'}):
            with self.assertRaises(ValueError):b.matching_receipt(row,[{**r,**changes}],v)
        with self.assertRaises(ValueError):b.matching_receipt(row,[r,{**r,'trade_no':'30000000000000'}],v)
        with self.assertRaises(ValueError):b.matching_receipt(row,[],v)
        v.db.close()

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
