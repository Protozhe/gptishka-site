"""Both marketplaces/providers and exact Codex sizes; no live transports."""
import importlib.util,json,hashlib,unittest,sqlite3
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('fixtures',Path(__file__).with_name('test-aibuy-market.py'))
fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
import market_shared_stock as stock
adapter=fixtures.adapter

class Tests(unittest.TestCase):
    fixture=fixtures.Tests.fixture
    def test_empty_claude_stock_waits_and_deduplicates_without_purchase(self):
        a,path,_,calls,_=self.fixture(0)
        cfg=path/'shared.json';cfg.write_text(json.dumps({'enabled':True,'enabledAfter':fixtures.iso(-60)}))
        actions=[]
        def rpc(jid,action='procure'):
            actions.append(action)
            if action!='stock':raise AssertionError('Claude must use prepaid stock')
            return {'state':'empty'}
        with patch.object(stock,'CONFIG',cfg),patch.object(adapter,'rpc',side_effect=rpc):
            adapter.handle(a,1)
            with a.connect() as c:c.execute('UPDATE market_aibuy_attempts SET next_at=0')
            adapter.drive(a,1)
        self.assertEqual(actions,['stock','stock']);self.assertEqual(calls,[])
        with a.connect() as c:
            self.assertEqual(tuple(c.execute('SELECT state,reason,dispatched FROM market_aibuy_attempts').fetchone()),('procurement','supplier_claude_stock_empty',0))
            self.assertEqual(c.execute("SELECT COUNT(*) FROM market_aibuy_notices WHERE event='1:claude_stock_empty'").fetchone()[0],1)

    def test_reviewed_claude_purchase_can_only_switch_to_stock_not_rebuy(self):
        a,path,policy,_,_=self.fixture(0)
        scope='m'+'c'*31
        with sqlite3.connect(path/'journal.sqlite') as c:
            c.execute('CREATE TABLE buys(order_id TEXT,state TEXT)');c.execute('INSERT INTO buys VALUES(?,?)',(scope,'owner_stock_switch'))
        c.close()
        root=fixtures.root
        reply={'state':'shared_stock'}
        with patch.object(root.b,'STATE',path),patch.object(root,'web_stock',return_value=reply) as web:
            with patch.object(root,'validate_job',return_value={'order_id':scope,'credits':0,'platform':'funpay'}):
                self.assertEqual(root.handle({'action':'stock','job_id':1},policy),reply)
            self.assertEqual(web.call_count,1)
            with patch.object(root,'validate_job',return_value={'order_id':scope,'credits':500,'platform':'funpay'}):
                with self.assertRaisesRegex(ValueError,'supplier_prior_purchase_requires_review'):root.handle({'action':'stock','job_id':1},policy)
        broker=root.b
        vault=type('VaultFixture',(),{'db':sqlite3.connect(path/'journal.sqlite')})()
        vault.db.row_factory=sqlite3.Row
        with patch.object(broker,'session',return_value=({},b'fixture',[])),patch.object(broker,'Vault',return_value=vault):
            with self.assertRaisesRegex(ValueError,'supplier_owner_completed'):
                broker.procure(scope,{'enabled':True},order_validator=lambda _: {'credits':0},browser=lambda _: self.fail('no supplier request allowed'))

    def test_empty_aisou_stock_waits_without_aibuy_purchase(self):
        a,path,_,calls,_=self.fixture(500)
        cfg=path/'shared.json';cfg.write_text(json.dumps({'enabled':True,'enabledAfter':fixtures.iso(-60)}))
        actions=[]
        def rpc(jid,action='procure'):
            actions.append(action)
            if action!='stock':raise AssertionError('must not fall back to AI-BUY')
            return {'state':'empty'}
        with patch.object(stock,'CONFIG',cfg),patch.object(adapter,'rpc',side_effect=rpc):
            adapter.handle(a,1)
            with a.connect() as c:c.execute('UPDATE market_aibuy_attempts SET next_at=0')
            adapter.drive(a,1)
        self.assertEqual(actions,['stock','stock']);self.assertEqual(calls,[])
        with a.connect() as c:
            row=c.execute('SELECT state,reason,dispatched FROM market_aibuy_attempts').fetchone()
            self.assertEqual(tuple(row),('procurement','supplier_aisou_stock_empty',0))
            self.assertEqual(c.execute("SELECT COUNT(*) FROM market_aibuy_notices WHERE event='1:aisou_stock_empty'").fetchone()[0],1)

    def test_lost_stock_reply_holds_then_recovers_without_purchase(self):
        a,path,_,calls,_=self.fixture(250)
        cfg=path/'shared.json';cfg.write_text(json.dumps({'enabled':True,'enabledAfter':fixtures.iso(-60)}))
        value='ISOLATED-LOST-CLAIM';operations=[]
        result={'state':'shared_stock','credits':250,'product_key':'codex-250','activationSiteUrl':stock.AIBUY,'native_key_id':'fixture-recovered','code':value,'fingerprint':hashlib.sha256(value.encode()).hexdigest()}
        def rpc(jid,action='procure'):
            operations.append(action)
            if action=='stock' and operations.count('stock')==1:raise TimeoutError('Claim accepted but reply lost')
            if action=='stock':return result
            if action=='stock_attest':return {'state':'attested'}
            raise AssertionError('must not purchase')
        with patch.object(stock,'CONFIG',cfg),patch.object(adapter,'rpc',side_effect=rpc):
            adapter.handle(a,1)
            self.assertEqual(calls,[])
            with a.connect() as c:c.execute('UPDATE market_aibuy_attempts SET next_at=0')
            adapter.drive(a,1)
        self.assertEqual(operations,['stock','stock','stock_attest']);self.assertEqual(calls.count('activate'),1)

    def test_root_stock_rejects_uncertain_purchases_and_mismatched_attestation(self):
        a,path,policy,_,_=self.fixture(500)
        scope='m'+'a'*31
        c=sqlite3.connect(path/'journal.sqlite')
        try:
            c.execute('CREATE TABLE buys(order_id TEXT,state TEXT)');c.execute('INSERT INTO buys VALUES(?,?)',(scope,'received'));c.commit()
        finally:c.close()
        root=fixtures.root
        with patch.object(root.b,'STATE',path),patch.object(root,'validate_job',return_value={'order_id':scope,'credits':500,'platform':'funpay'}),patch.object(root,'web_stock',side_effect=AssertionError('must not claim')):
            with self.assertRaisesRegex(ValueError,'supplier_prior_purchase_requires_review'):root.handle({'action':'stock','job_id':1},policy)
        intent={'order_id':scope,'credits':500,'platform':'funpay','native_key_id':'one','activationSiteUrl':stock.AIBUY,'fingerprint':'fixture'}
        with patch.object(root,'validate_job',return_value=intent),patch.object(root,'web_stock',return_value={'state':'shared_stock','native_key_id':'one','activationSiteUrl':stock.AISOU,'fingerprint':'fixture'}):
            with self.assertRaisesRegex(ValueError,'supplier_stock_binding_invalid'):root.handle({'action':'stock_attest','job_id':1},policy)

    def test_shared_routes_without_purchase_or_replay(self):
        for platform in ('funpay','playerok'):
            for code in (0,250,500,1000):
                for site in ((stock.AIBUY,) if code==0 else (stock.AIBUY,stock.AISOU)):
                    with self.subTest(platform=platform,code=code,site=site):
                        a,path,p,calls,unused=self.fixture(code,platform)
                        cfg=path/'shared.json';cfg.write_text(json.dumps({'enabled':True,'enabledAfter':fixtures.iso(-60)}))
                        operations=[];posts=[];value='ISOLATED-SHARED-'+str(code)
                        reply={'state':'shared_stock','credits':code,'product_key':fixtures.common.product(code),'activationSiteUrl':site,'native_key_id':'native-fixture-'+str(code),'code':value,'fingerprint':hashlib.sha256(value.encode()).hexdigest()}
                        def rpc(jid,action='procure'):
                            operations.append(action)
                            if action=='stock':return reply
                            if action=='stock_attest':return {'state':'attested'}
                            raise AssertionError('No purchase or foreign activation')
                        def post(url,payload,**kwargs):
                            posts.append((url,payload));action=payload.get('action') or url.split('=')[-1]
                            if action=='verifyCdk':return {'ok':True,'workflow':fixtures.common.workflow(code),'status':'unused'}
                            if action=='verify_code':return {'success':True,'plan_type':'codex'+str(code),'sid':'fixture-sid','require_cookie':0}
                            if action=='validate_token':return {'success':True}
                            if action in ('activate','submit_recharge'):raise TimeoutError('Fixture accepted response lost')
                            if site==stock.AIBUY:return {'ok':True,'workflow':fixtures.common.workflow(code),'final':True,'status':'done'}
                            if sum(1 for _,body in posts if body.get('action')=='submit_recharge'):
                                return {'success':True,'status':'used','recharge_status':'success','plan_type':'codex'+str(code)}
                            return {'success':True,'status':'unused','recharge_status':None}
                        a._post_json=post
                        with patch.object(stock,'CONFIG',cfg),patch.object(adapter,'rpc',side_effect=rpc):
                            self.assertTrue(adapter.handle(a,1))
                            with a.connect() as c:c.execute('UPDATE market_aibuy_attempts SET next_at=0')
                            adapter.drive(a,1);adapter.drive(a,1)
                        actions=[body.get('action') or url.split('=')[-1] for url,body in posts]
                        self.assertEqual(actions.count('activate')+actions.count('submit_recharge'),1)
                        self.assertEqual(operations,['stock','stock_attest'])
                        self.assertTrue(all(url.startswith(site+'/') for url,_ in posts))
                        if code==0:self.assertTrue(all(body.get('product')=='claude' for _,body in posts))
                        with a.connect() as c:
                            self.assertEqual(c.execute('SELECT status FROM codex_jobs').fetchone()[0],'success')
                            self.assertEqual(c.execute('SELECT COUNT(*) FROM codex_keys').fetchone()[0],1)
    def test_wrong_nominal_provider_and_used_key_do_not_submit(self):
        a,_,_,_,_=self.fixture(500)
        for site in (stock.AIBUY,stock.AISOU):
            def wrong(url,payload,**kwargs):
                if site==stock.AIBUY:return {'ok':True,'workflow':'codex_250','status':'unused'}
                if payload['action']=='query_code':return {'success':True,'status':'unused'}
                return {'success':True,'plan_type':'codex250','sid':'fixture'}
            a._post_json=wrong
            with self.assertRaises(ValueError):stock.verify(a,'ISOLATED',500,site,'{}')
        with self.assertRaises(ValueError):stock.verify(a,'ISOLATED',500,'https://foreign.example','{}')
        self.assertFalse(stock.normalize_aiee({'success':True,'status':'used'},500)['final'])
        with self.assertRaises(ValueError):stock.normalize_aiee({'success':True,'recharge_status':'success','plan_type':'codex250'},500)
        for operation in (lambda:stock.verify(a,'ISOLATED',0,stock.AISOU,'uuid'),lambda:stock.submit(a,'ISOLATED',0,stock.AISOU,'uuid',''),lambda:stock.poll(a,'ISOLATED',0,stock.AISOU)):
            with self.assertRaises(ValueError):operation()

if __name__=='__main__':unittest.main()
