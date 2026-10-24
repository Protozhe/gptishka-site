import unittest,sys,types,importlib.util,tempfile,hashlib,datetime
from pathlib import Path
HERE=Path(__file__).parent
sys.path.insert(0,str(HERE/'test-runtime'))
def load(name,path):
 s=importlib.util.spec_from_file_location(name,HERE/path);m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m);return m
load('zovocard_settled_cost','settled-cost.py');load('zovocard_card_pool','card-pool.py')
direct=load('zovocard_direct_worker','direct-worker.py')
worker=load('zovocard_claude','claude-worker.py')
sys.modules['zovocard_fallback_guard']=types.SimpleNamespace(assert_unclaimed=lambda *a:None)
class Cipher:
 def encrypt(self,x):return b'fixture-encrypted:'+x
 def decrypt(self,x):return x.removeprefix(b'fixture-encrypted:')
class API:
 def __init__(self,plan='max_5x'):
  self.plan=plan;self.creates=0;self.funds=0;self.opens=0;self.writes_enabled=False;self._ready=True;self.lost=False
 def probe(self):return {'registry':[{'product':'claude','key':self.plan,'acc_plan_key':'claude_'+self.plan,'purchasable':True,'checkout_currency':'USD','checkout_amount_minor':10000}], 'plans':{self.plan:{'enabled':True,'flow':'direct','serviceFeeUsdMinor':500},'claude_'+self.plan:{'enabled':True,'flow':'direct','serviceFeeUsdMinor':500}}}
 def preflight(self,raw):return 200,{'code':0,'data':{'currentPlan':'free','email':'fixture@example.invalid'}}
 def card_balance(self,cid):return 200,{'code':0,'data':{'id':cid,'status':'ACTIVE','channel_payable':True,'product_code':'XL537872','available_amount':'110.00','balance_stale':False,'restricted_merchants':[],'last_four':'0000','remark':''}}
 def card_usage(self,cid):return 200,{'code':0,'data':{'card_id':cid,'busy':False,'cooling':False,'light':{'remaining':5}}}
 def account_orders(self,*a):return 200,{'code':0,'data':{'list':[],'has_more':False}}
 def remark(self,*a):return 200,{'code':0}
 def create_order(self,**kw):
  self.creates+=1
  if self.lost:raise TimeoutError('fixture lost reply')
  return 202,{'code':0,'data':{'id':7,'product':'claude','plan':self.plan,'card_id':101,'status':'queued'}}
 def recharge(self,*a):self.funds+=1;raise AssertionError('funding not expected')
 def open_card(self,*a):self.opens+=1;raise AssertionError('opening not expected')
class Claude(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.api=API();self.now=1792843200
  self.policy={'enabled':True,'auto_card_open':True,'card_ids':[101],'auto_funding':True,'max_cumulative_wallet_debit_usd_minor':400000,'allowed_product_codes':['XL537872'],'day_timezone':'UTC','claude_site':{'enabled':True,'enabled_after':'2026-10-24T00:00:00Z','product_ids':{'claude-5x-max':'fixture-product'}}}
  self.w=worker.ClaudeWorker(str(Path(self.tmp.name)/'db'),Cipher(),self.api,self.policy,'claude-5x-max',13800);self.w.clock=lambda:self.now;self.w._day=lambda t=None:str(int((self.now if t is None else t)//86400))
  self.order={'platform':'gptishka','account_id':'site','order_id':'fixtureorder0000000000001','product_slug':'claude-5x-max','product_id':'fixture-product','quantity':1,'payment_status':'paid','job_id':91,'created_at':'2026-10-24T10:00:00Z','paid_at':'2026-10-24T10:01:00Z','email':'fixture@example.invalid','has_prior_dispatch':False,'has_external_fulfillment':False}
  import json
  self.raw=json.dumps({'sessionKey':'sk-ant-sid02-'+'x'*50,'riskAccepted':True})
  self.source='gptishka:site:'+self.order['order_id']
 def test_paid_exact_new_website_scope_before_any_card_operation(self):
  self.assertEqual(self.w._eligible(self.order),self.source)
  for patch in [{'platform':'funpay'},{'payment_status':'pending'},{'quantity':2},{'product_id':'wrong'},{'product_slug':'claude-20x-max'},{'created_at':'2026-10-23T10:00:00Z'},{'has_prior_dispatch':True}]:
   with self.assertRaises(worker.Refused):self.w.prepare({**self.order,**patch},self.raw)
  self.assertEqual((self.api.creates,self.api.funds,self.api.opens),(0,0,0))
 def test_only_session_cookie_and_explicit_ack(self):
  import json
  for s in [{'sessionKey':'sk-ant-api03-'+'x'*50,'riskAccepted':True},{'sessionKey':'sk-ant-sid02-'+'x'*50},{'accessToken':'fixture','riskAccepted':True}]:
   with self.assertRaises(worker.Refused):worker.session(json.dumps(s))
 def test_prepare_then_one_submit_and_no_replay_after_lost_reply(self):
  self.assertEqual(self.w.prepare(self.order,self.raw)['state'],'prepared')
  self.api.lost=True
  self.assertEqual(self.w.submit(self.order,self.raw)['state'],'uncertain')
  with self.assertRaises(worker.Refused):self.w.submit(self.order,self.raw)
  self.assertEqual(self.api.creates,1)
  with self.w.connect() as c:self.assertEqual(c.execute('SELECT dispatched FROM zovo_direct_jobs').fetchone()[0],1)
 def test_wrong_product_and_tier_cannot_complete(self):
  self.w.prepare(self.order,self.raw);self.w.submit(self.order,self.raw)
  for patch in [{'product':'gpt'},{'plan':'max_20x'},{'card_id':102},{'stage':'waiting'}]:
   d={'id':7,'product':'claude','plan':'max_5x','card_id':101,'status':'completed','stage':'done','final_amount_minor':10000,'currency':'USD',**patch}
   with self.assertRaises(worker.Refused):self.w._record(self.source,d,final=True)
  self.assertNotEqual(self.w.inspect(self.source)['state'],'completed')
 def test_fee_or_usd_quote_changes_block_before_card_open(self):
  original=self.api.probe
  def changed():
   d=original();d['plans']['claude_max_5x']['serviceFeeUsdMinor']=801;return d
  self.api.probe=changed
  with self.assertRaises(worker.Refused):self.w.prepare(self.order,self.raw)
  self.assertEqual((self.api.funds,self.api.opens,self.api.creates),(0,0,0))
 def test_shared_card_limits_and_claude_renewal_hold(self):
  self.w.prepare(self.order,self.raw);self.w.submit(self.order,self.raw)
  with self.w.connect() as c:
   c.execute("UPDATE zovo_direct_jobs SET state='completed',renewal_status='not_requested',dispatched_at=?",(self.now-86400,))
   with self.assertRaises(worker.Refused):self.w._select_card(c,'gptishka:site:different','different@example.invalid')
  self.assertEqual(self.api.funds,0)
 def test_anthropic_settlement_is_exact_and_not_an_openai_charge(self):
  from zovocard_settled_cost import match_charge
  stamp=datetime.datetime.fromtimestamp(self.now,datetime.timezone.utc).isoformat()
  job={'plan':'max_5x','final_amount_minor':10000,'currency':'USD','dispatched_at':self.now}
  tx={'auth_id':'fixture-auth','status':'COMPLETE','type':'Authorization','merchant_name':'ANTHROPIC','auth_currency':'USD','settle_currency':'USD','auth_amount':'100.00','settle_amount':'100.00','auth_time':stamp}
  self.assertEqual(match_charge([tx],job,'UTC'),('fixture-auth',10000))
  with self.assertRaises(ValueError):match_charge([{**tx,'merchant_name':'OPENAI'}],job,'UTC')
  with self.assertRaises(ValueError):match_charge([tx,{**tx,'auth_id':'other'}],job,'UTC')
 def test_transport_uses_claude_usd_and_a_stable_idempotency_key(self):
  class T(worker.ClaudeHTTPS):
   def __init__(self):self.plan='max_5x';self._ready=True;self.writes_enabled=True;self.calls=[]
   def _request(self,*args,**kw):self.calls.append((args,kw));return 202,{'code':0,'data':{}}
  t=T();rid='pulse-'+'a'*48;t.create_order(full_session=self.raw,preflight_token='local',request_id=rid,card_id=101)
  args,kw=t.calls[0];body=args[2]
  self.assertEqual((body['product'],body['plan'],body['payment_country'],body['payment_currency']),('claude','max_5x','US','USD'));self.assertEqual(kw['idempotency_key'],rid);self.assertTrue(body['no_auto_card_switch']);self.assertNotIn('preflight_token',body)
 def test_wallet_shortage_can_resume_only_an_unfunded_undispatched_attempt(self):
  self.w.prepare(self.order,self.raw)
  with self.w.connect() as c:c.execute("UPDATE zovo_direct_jobs SET state='failed_before_dispatch',reason='wallet_insufficient',funding_state=NULL")
  self.assertEqual(self.w.resume(self.order,self.raw)['state'],'processing')
  self.assertEqual(self.api.creates,1)
  # The existing provider job is inspected, never submitted again.
  self.w.poll=lambda source:{'state':'processing'}
  self.w.resume(self.order,self.raw);self.assertEqual(self.api.creates,1)
  with self.w.connect() as c:c.execute("UPDATE zovo_direct_jobs SET state='failed_before_dispatch',reason='wallet_insufficient',dispatched=0,provider_order_id=NULL,funding_state='uncertain'")
  with self.assertRaises(worker.Refused):self.w.resume(self.order,self.raw)
  self.assertEqual(self.api.creates,1)
if __name__=='__main__':unittest.main()
