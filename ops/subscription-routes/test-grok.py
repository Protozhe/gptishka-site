"""Isolated Grok fixtures; no owner API, card, customer or bot requests."""
import base64,hashlib,importlib.util,json,os,sys,tempfile,time,types,unittest
from pathlib import Path
HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('grok_shared_fixtures',HERE/'test-claude.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
g=f.load('zovocard_grok','grok-worker.py')

def raw(sid='00000000-0000-4000-8000-000000000001',**extra):
    enc=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
    return enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'session_id':sid,**extra})+'.fixtureSignature'

class API(f.API):
    def __init__(self,plan,amount,now):super().__init__(plan);self.amount=amount;self.now=now
    def probe(self):
        p={'enabled':True,'flow':'direct','currency':'USD','serviceFeeUsdMinor':15}
        return {'registry':[{'product':'grok','key':self.plan,'acc_plan_key':'grok_'+self.plan,'purchasable':True,'flow':'direct','is_credit':False,'checkout_currency':'USD','checkout_amount_minor':self.amount}], 'plans':{self.plan:p,'grok_'+self.plan:p}}
    def preflight(self,token):
        return 200,{'code':0,'data':{'currentPlan':'','credentialMode':'session','email':'fixture@example.invalid','subscription_has_active':False,'subscription_recovery_required':False,'preflight_token':'fixture-ticket','preflight_expires_at':self.now+300,'quotes':{self.plan:{'country':'US','currency':'USD','minorUnitExponent':2,'plan':self.plan,'amountMinor':self.amount}}}}
    def card_balance(self,cid):
        _,b=super().card_balance(cid);b['data']['available_amount']=str((self.amount+max(300,self.amount//10))/100);return 200,b
    def create_order(self,**kw):
        self.creates+=1
        if self.lost:raise TimeoutError('isolated response lost')
        return 202,{'code':0,'data':{'id':7,'product':'grok','plan':self.plan,'card_id':101,'status':'queued'}}

class Grok(unittest.TestCase):
    def fixture(self,slug='grok-plus-1',source='telegram',budget=50000):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);now=1792843200
        plan=g.TIERS[slug][0];amount={'plus_monthly':800,'premium_monthly':3000,'super_monthly':10000,'ultra_monthly':20000}[plan]
        api=API(plan,amount,now);policy={'enabled':True,'auto_card_open':True,'card_ids':[101],'auto_funding':True,'max_cumulative_wallet_debit_usd_minor':400000,'max_clients_per_card':3,'allowed_product_codes':['XL537872'],'day_timezone':'UTC','grok_site':{'enabled':True,'enabled_after':'2026-10-24T00:00:00Z','product_ids':{slug:'fixture-product'},'existing_order_ids':[]}}
        w=g.GrokWorker(str(Path(tmp.name)/'db'),f.Cipher(),api,policy,slug,budget);w.clock=lambda:now;w._day=lambda t=None:str(int((now if t is None else t)//86400))
        token=raw();order={'platform':'gptishka','account_id':'site','order_source':source,'order_id':'fixtureorder0000000000001','product_slug':slug,'product_id':'fixture-product','quantity':1,'payment_status':'paid','job_status':'ready','job_id':91,'created_at':'2026-10-24T10:00:00Z','paid_at':'2026-10-24T10:01:00Z','email':g.identity(token),'has_prior_dispatch':False,'has_external_fulfillment':False}
        return w,api,order,token
    def test_four_exact_monthly_products_and_both_paid_sources(self):
        for slug in g.TIERS:
            for source in ('site','telegram'):
                w,api,o,t=self.fixture(slug,source);self.assertEqual(w.prepare(o,t)['state'],'prepared');self.assertEqual(w.policy['max_clients_per_card'],3);self.assertEqual(w.policy['max_cumulative_wallet_debit_usd_minor'],400000)
                self.assertEqual(w.submit(o,t)['state'],'processing');self.assertEqual(api.creates,1);self.assertEqual((api.opens,api.funds),(0,0))
    def test_wrong_source_product_payment_quantity_or_prior_dispatch_cannot_spend(self):
        w,a,o,t=self.fixture()
        for patch in ({'order_source':'funpay'},{'payment_status':'pending'},{'job_status':'cancelled'},{'quantity':2},{'product_slug':'grok-plus-yearly'},{'product_id':'wrong'},{'has_prior_dispatch':True},{'has_external_fulfillment':True},{'created_at':'2026-01-01T00:00:00Z'}):
            with self.assertRaises(g.Refused):w.prepare({**o,**patch},t)
        self.assertEqual((a.opens,a.funds,a.creates),(0,0,0))
    def test_owner_exception_is_one_order_only_and_never_a_future_payment(self):
        w,a,o,t=self.fixture();w.policy['grok_site']['existing_order_ids']=[o['order_id']]
        self.assertEqual(w._eligible({**o,'created_at':'2026-01-01T00:00:00Z'}),'gptishka:site:'+o['order_id'])
        with self.assertRaises(g.Refused):w._eligible({**o,'order_id':'differentorder00000000001','created_at':'2026-01-01T00:00:00Z'})
        with self.assertRaises(g.Refused):w._eligible({**o,'paid_at':'2099-01-01T00:00:00Z'})
    def test_sso_shape_expiry_identity_and_json_customer_form(self):
        w,a,o,t=self.fixture();self.assertEqual(g.session(json.dumps({'sso':t})),t)
        for bad in ('uuid-only',json.dumps({'accessToken':t}),raw(exp=1),'sk-ant-sid02-fixture'):
            with self.assertRaises(g.Refused):w.prepare(o,bad)
        with self.assertRaises(g.Refused):w.prepare({**o,'email':'other@fixture.invalid'},t)
        self.assertEqual(a.creates,0)
    def test_lost_submit_reply_never_replays_or_changes_key(self):
        w,a,o,t=self.fixture();w.prepare(o,t);a.lost=True;self.assertEqual(w.submit(o,t)['state'],'uncertain')
        with self.assertRaises(g.Refused):w.submit(o,t)
        w.resume(o,t);self.assertEqual(a.creates,1)
        with w.connect() as c:self.assertEqual(c.execute('SELECT dispatched FROM zovo_direct_jobs').fetchone()[0],1)
    def test_active_account_price_currency_and_fee_changes_hold_before_funding(self):
        for mode in ('active','currency','plan','fee','ticket'):
            w,a,o,t=self.fixture();original=a.preflight
            def preflight(raw):
                status,b=original(raw);d=b['data']
                if mode=='active':d['subscription_has_active']=True
                if mode=='currency':d['quotes'][a.plan]['currency']='EUR'
                if mode=='plan':d['quotes'][a.plan]['plan']='plus_yearly'
                if mode=='ticket':d['preflight_expires_at']=w.clock()-1
                return status,b
            a.preflight=preflight
            if mode=='fee':
                probe=a.probe
                def changed():
                    d=probe();d['plans']['grok_'+a.plan]['serviceFeeUsdMinor']=16;return d
                a.probe=changed
            with self.assertRaises(g.Refused):w.prepare(o,t)
            self.assertEqual((a.opens,a.funds,a.creates),(0,0,0))
    def test_too_small_order_budget_cannot_open_or_fund(self):
        w,a,o,t=self.fixture(budget=500)
        with self.assertRaises(g.Refused):w.prepare(o,t)
        self.assertEqual((a.opens,a.funds,a.creates),(0,0,0))
    def test_ordinary_plus_budget_keeps_real_fee_and_shared_limits(self):
        w,a,o,t=self.fixture(budget=1147)
        self.assertEqual(w.policy['max_wallet_debit_usd_minor'],1147)
        self.assertEqual(w.prepare(o,t)['state'],'prepared');self.assertEqual(w.submit(o,t)['state'],'processing')
        self.assertEqual(w.policy['max_cumulative_wallet_debit_usd_minor'],400000)
    def test_live_grok_no_ticket_and_nullable_flags_have_short_session_bound_intent(self):
        w,a,o,t=self.fixture(budget=1147);original=a.preflight
        def observed(raw):
            status,b=original(raw);b['data'].update(subscription_has_active=None,preflight_token='',preflight_expires_at='0001-01-01T00:00:00Z');return status,b
        a.preflight=observed
        self.assertEqual(w.prepare(o,t)['state'],'prepared')
        with w.connect() as c:r=c.execute('SELECT proof,expires FROM zovo_direct_jobs').fetchone()
        self.assertEqual(w.cipher.decrypt(r['proof']).decode(),'grok-local-'+hashlib.sha256(t.encode()).hexdigest());self.assertEqual(r['expires'],w.clock()+180)
        self.assertEqual(w.submit(o,t)['state'],'processing');self.assertEqual(a.creates,1)
    def test_provider_product_plan_and_card_must_match_before_completion(self):
        w,a,o,t=self.fixture();w.prepare(o,t);w.submit(o,t);source='gptishka:site:'+o['order_id']
        good={'id':7,'product':'grok','plan':'plus_monthly','card_id':101,'status':'completed','stage':'done','final_amount_minor':800,'currency':'USD','renewal_status':'success'}
        for patch in ({'product':'gpt'},{'plan':'plus_yearly'},{'card_id':102},{'stage':'waiting'},{'currency':'PHP'},{'final_amount_minor':961}):
            with self.assertRaises(g.Refused):w._record(source,{**good,**patch},final=True)
        w._record(source,good,final=True);self.assertEqual(w.inspect(source)['state'],'completed')
    def test_unconfirmed_grok_renewal_blocks_card_reuse_for_all_products(self):
        w,a,o,t=self.fixture();w.prepare(o,t);w.submit(o,t)
        with w.connect() as c:
            c.execute("UPDATE zovo_direct_jobs SET state='completed',renewal_status='not_requested',dispatched_at=?",(w.clock()-86400,))
            with self.assertRaises(g.Refused):w._select_card(c,'gptishka:site:another','another@fixture.invalid')
    def test_transport_pins_monthly_grok_usd_session_and_one_request_id(self):
        class T(g.GrokHTTPS):
            def __init__(self):self.plan='plus_monthly';self._ready=True;self.writes_enabled=True;self.calls=[]
            def _request(self,*args,**kw):self.calls.append((args,kw));return 202,{'code':0,'data':{}}
        t=T();rid='pulse-'+'a'*48;t.create_order(full_session=raw(),preflight_token='fixture-ticket',request_id=rid,card_id=101)
        args,kw=t.calls[0];body=args[2]
        self.assertEqual((body['product'],body['plan'],body['payment_country'],body['payment_currency']),('grok','plus_monthly','US','USD'));self.assertEqual(body['preflight_token'],'fixture-ticket');self.assertEqual(kw['idempotency_key'],rid);self.assertTrue(body['no_auto_card_switch'])
        with self.assertRaises(g.Refused):g.GrokHTTPS('unused','plus_yearly')
        local='grok-local-'+hashlib.sha256(raw().encode()).hexdigest();t.create_order(full_session=raw(),preflight_token=local,request_id=rid,card_id=101)
        self.assertNotIn('preflight_token',t.calls[-1][0][2])
        with self.assertRaises(g.Refused):t.create_order(full_session=raw(),preflight_token='grok-local-wrong',request_id=rid,card_id=101)
    def test_grok_settlement_cannot_match_an_openai_or_anthropic_charge(self):
        from zovocard_settled_cost import match_charge
        import datetime
        now=1792843200;stamp=datetime.datetime.fromtimestamp(now,datetime.timezone.utc).isoformat();job={'plan':'plus_monthly','final_amount_minor':800,'currency':'USD','dispatched_at':now}
        tx={'auth_id':'fixture-auth','status':'COMPLETE','type':'Authorization','merchant_name':'X.AI GROK','auth_currency':'USD','settle_currency':'USD','auth_amount':'8.00','settle_amount':'8.00','auth_time':stamp}
        self.assertEqual(match_charge([tx],job,'UTC'),('fixture-auth',800))
        for merchant in ('OPENAI','ANTHROPIC'):
            with self.assertRaises(ValueError):match_charge([{**tx,'merchant_name':merchant}],job,'UTC')
    def test_gateway_patch_preserves_other_routes_and_rejects_source_drift(self):
        if os.name!='posix':sys.modules['fcntl']=types.SimpleNamespace()
        spec=importlib.util.spec_from_file_location('grok_installer',HERE/'install-grok-worker.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        source="def main():\n    try:\n"+m.ANCHOR+"\n            pass\n"
        digest=hashlib.sha256(source.encode()).hexdigest();patched=m.patch_gateway(source,digest)
        self.assertEqual(m.patch_gateway(patched,digest),patched);self.assertEqual(patched.replace(m.HOOK,''),source)
        with self.assertRaises(ValueError):m.patch_gateway(source+'# drift',digest)

if __name__=='__main__':unittest.main()
