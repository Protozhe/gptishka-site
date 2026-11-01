"""Actual Grok queues and root paid-source guards; isolated transports only."""
import base64,contextlib,hashlib,importlib.util,json,sqlite3,sys,time,types,unittest
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).parent))
import market_grok as grok
spec=importlib.util.spec_from_file_location('grok_fixtures',Path(__file__).with_name('test-aibuy-market.py'))
fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
root=fixtures.root

def sso(exp=None):
 data={'session_id':'00000000-0000-4000-8000-000000000001'}
 if exp is not None:data['exp']=exp
 return '.'.join(base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=') for v in ({'alg':'HS256','typ':'JWT'},data))+'.Zml4dHVyZQ'

class Tests(unittest.TestCase):
 fixture=fixtures.Tests.fixture

 def setup_grok(self,platform='funpay',tier='super'):
  a,path,policy,_,_=self.fixture(500,platform)
  with a.connect() as c:
   c.execute('ALTER TABLE codex_jobs ADD COLUMN submit_attempts INTEGER NOT NULL DEFAULT 0')
   c.execute('ALTER TABLE codex_jobs ADD COLUMN last_message_id INTEGER NOT NULL DEFAULT 0')
   c.execute("ALTER TABLE codex_jobs ADD COLUMN data_after TEXT NOT NULL DEFAULT ''")
   c.execute("UPDATE codex_jobs SET package=0,product_type='grok_aisou',title=?,key_pool=?,anchor_message_id=20",('Grok '+tier+' на ваш аккаунт 30 дней',grok.pool('grok-'+tier+'-1')))
  a._fetch_note=lambda _: {'sso':sso()}
  a._message_id=lambda m:int(m.get('id') or 0)
  a._worker_post_json=Mock(side_effect=AssertionError('No live customer message'))
  a.playerok_source=types.SimpleNamespace(send=Mock(side_effect=AssertionError('No live customer message')))
  grok.init(a)
  state={'stock':False,'mode':'normal','sent':0,'actions':[],'claims':0}
  value='FIXTURE-GROK-'+tier
  reply={'state':'shared_stock','product_key':'grok-'+tier+'-1','activationSiteUrl':grok.SITE,'native_key_id':'fixture-native-key','code':value,'fingerprint':hashlib.sha256(value.encode()).hexdigest()}
  def rpc(jid,attest=False):
   self.assertEqual(jid,1)
   if not attest:
    if not state['stock']:return {'state':'empty'}
    state['claims']+=1;return reply
   return {k:v for k,v in reply.items() if k!='code'}
  def post(url,payload,**kwargs):
   self.assertEqual(url,grok.URL);action=payload['action'];state['actions'].append(action)
   if action=='query_code':
    if not state['sent']:return {'success':True,'status':'available'}
    return {'success':True,'status':'used','recharge_status':'success','order_id':'other-order' if state['mode']=='mismatch' else 'fixture-order'}
   if action=='verify_code':return {'success':True,'sid':'fixture-sid','plan_type':'grok_'+('premium' if state['mode']=='wrong' else tier),'plan_name':'Grok '+tier+(' annual' if state['mode']=='annual' else ' 1 month'),'require_cookie':1}
   if action=='validate_token':
    self.assertEqual(json.loads(payload['json_token']),{'sso':sso()});return {'success':state['mode']!='bad-session'}
   if action=='submit_recharge':
    with a.connect() as c:self.assertEqual(c.execute('SELECT dispatched FROM market_grok_attempts').fetchone()[0],1)
    state['sent']+=1
    if state['mode']=='timeout':raise TimeoutError('isolated uncertain response')
    return {'success':True,'order_id':'fixture-order','recharge_status':'pending'}
   self.fail('Unexpected provider request')
  a._post_json=post
  return a,path,policy,state,rpc

 def finish(self):
  deadline=time.monotonic()+3
  while time.monotonic()<deadline:
   with grok._lock:
    if not grok._active:return
   time.sleep(.01)
  self.fail('fixture worker did not finish')

 def test_both_platforms_all_four_tiers_empty_stock_refill_restart_and_once_only_result(self):
  for platform in ('funpay','playerok'):
   for tier in grok.KINDS:
    with self.subTest(platform=platform,tier=tier):
     a,_,_,state,rpc=self.setup_grok(platform,tier)
     with patch.object(grok,'rpc',side_effect=rpc):
      grok.handle(a,1);grok.drive(a,1);grok.drive(a,1)
      self.assertEqual(state['actions'],[])
      with a.connect() as c:
       self.assertEqual(c.execute('SELECT status,error FROM codex_jobs').fetchone()[:],('waiting_data',grok.WAIT))
       notices=c.execute('SELECT message FROM market_aibuy_notices').fetchall();self.assertEqual(len(notices),1)
       self.assertIn('grok-'+tier+'-1',notices[0][0]);self.assertIn(platform.lower(),notices[0][0].lower())
       self.assertNotIn('fixture@example.invalid',notices[0][0])
       self.assertIsNotNone(c.execute('SELECT encrypted_session FROM market_grok_attempts').fetchone()[0])
       c.execute('UPDATE market_grok_attempts SET next_at=0')
      # No customer message/chat signature update occurs before this tick.
      state['stock']=True;grok.tick(a);self.finish()
      self.assertEqual(state['sent'],1);self.assertEqual(state['claims'],1)
      grok.drive(a,1);grok.drive(a,1);grok.handle(a,1)
     self.assertEqual(state['sent'],1)
     with a.connect() as c:
      self.assertEqual(c.execute('SELECT status,submit_attempts FROM codex_jobs').fetchone()[:],('success',1))
      self.assertIsNone(c.execute('SELECT encrypted_session FROM market_grok_attempts').fetchone()[0])
     self.assertFalse(a._worker_post_json.called);self.assertFalse(a.playerok_source.send.called)

 def test_failed_preflight_holds_same_key_without_second_activation(self):
  for mode in ('wrong','annual','bad-session'):
   a,_,_,state,rpc=self.setup_grok();state.update(stock=True,mode=mode)
   with patch.object(grok,'rpc',side_effect=rpc):
    grok.handle(a,1);grok.drive(a,1);grok.handle(a,1)
   self.assertEqual(state['sent'],0);self.assertEqual(state['claims'],1)
   with a.connect() as c:self.assertEqual(c.execute('SELECT state FROM market_grok_attempts').fetchone()[0],'review')

 def test_wrong_order_and_unknown_submit_are_held_and_never_resubmitted(self):
  for mode in ('mismatch','timeout'):
   a,_,_,state,rpc=self.setup_grok();state.update(stock=True,mode=mode)
   with patch.object(grok,'rpc',side_effect=rpc):grok.handle(a,1);grok.drive(a,1);grok.drive(a,1)
   self.assertEqual(state['sent'],1)
   with a.connect() as c:
    self.assertEqual(c.execute('SELECT status FROM codex_jobs').fetchone()[0],'manual_action')
    self.assertEqual(c.execute('SELECT state FROM market_grok_attempts').fetchone()[0],'review')

 def test_paused_manual_archived_refund_and_global_pause_cannot_resume(self):
  for case in ('paused','manual_completed','cancelled','success','archive','refund','disabled','permission'):
   a,_,_,state,rpc=self.setup_grok()
   with patch.object(grok,'rpc',side_effect=rpc):
    grok.handle(a,1)
    with a.connect() as c:
     if case in ('paused','manual_completed','cancelled','success'):c.execute('UPDATE codex_jobs SET status=?',(case,))
     elif case=='archive':c.execute("UPDATE codex_jobs SET archived_at='fixture'")
     elif case=='refund':c.execute('INSERT INTO marketplace_refund_holds SELECT platform,account_id,order_id FROM codex_jobs')
     elif case=='disabled':c.execute('UPDATE codex_settings SET auto_submit=0')
     else:c.execute('UPDATE codex_jobs SET auto_submit_allowed=0')
    state['stock']=True;grok.drive(a,1)
   self.assertEqual(state['claims'],0);self.assertEqual(state['sent'],0)

 def test_direct_sso_capture_is_encrypted_and_scoped_after_payment_anchor(self):
  for platform in ('funpay','playerok'):
   a,_,_,_,_=self.setup_grok(platform)
   with a.connect() as c:
    j=c.execute('SELECT * FROM codex_jobs').fetchone();current=fixtures.iso(5)
    own={'id':21,'timestamp_iso':current,'is_own':True,'text':sso()}
    old={'id':19,'timestamp_iso':fixtures.iso(-3600),'text':sso()}
    self.assertFalse(grok.capture_messages(a,c,j,[own,old],20))
    self.assertTrue(grok.capture_messages(a,c,j,[{'id':22,'timestamp_iso':current,'text':sso()}],20))
    raw=c.execute('SELECT encrypted_session FROM market_grok_inputs').fetchone()[0]
    self.assertNotIn(sso(),raw);self.assertEqual(json.loads(a._fernet().decrypt(raw.encode())),{'sso':sso()})

 def test_root_rechecks_paid_identity_stock_binding_refunds_and_prior_dispatch(self):
  a,path,policy,state,_=self.setup_grok();state['stock']=False
  with patch.object(grok,'rpc',return_value={'state':'empty'}):grok.handle(a,1)
  @contextlib.contextmanager
  def db(_):
   with a.connect() as c:yield c
  paid=Mock(return_value={'payment_verified':True});web=Mock(return_value={'state':'empty'})
  with patch.object(grok,'KEY',path/'key'):
   self.assertEqual(grok.root_stock({'action':'grok_stock','job_id':1},policy,db,paid,web),{'state':'empty'})
   self.assertIs(paid.call_args.kwargs['classifier'],grok.classify)
   self.assertEqual(web.call_args.args[0]['product_key'],'grok-super-1')
   for sql in ["UPDATE codex_jobs SET status='paused'","UPDATE codex_jobs SET auto_submit_allowed=0","UPDATE market_grok_attempts SET dispatched=1"]:
    with a.connect() as c:c.execute(sql)
    with self.assertRaises(ValueError):grok.root_stock({'action':'grok_stock','job_id':1},policy,db,paid,web)
    with a.connect() as c:c.execute("UPDATE codex_jobs SET status='waiting_data',auto_submit_allowed=1");c.execute('UPDATE market_grok_attempts SET dispatched=0')
   with a.connect() as c:c.execute('INSERT INTO marketplace_refund_holds SELECT platform,account_id,order_id FROM codex_jobs')
   with self.assertRaisesRegex(ValueError,'supplier_refund_hold'):grok.root_stock({'action':'grok_stock','job_id':1},policy,db,paid,web)
  self.assertEqual(web.call_count,1)

 def test_queue_uses_independent_root_validation_for_claim_and_attestation(self):
  for platform in ('funpay','playerok'):
   a,path,policy,state,stub=self.setup_grok(platform,'plus');state['stock']=True
   @contextlib.contextmanager
   def db(_):
    with a.connect() as c:yield c
   paid=Mock(return_value={'payment_verified':True})
   def web(payload):
    self.assertEqual(payload['product_key'],'grok-plus-1');self.assertEqual(payload['platform'],platform)
    self.assertNotIn('sso',json.dumps(payload));return stub(1,payload['action']=='attest')
   def rpc(jid,attest=False):return grok.root_stock({'action':'grok_stock_attest' if attest else 'grok_stock','job_id':jid},policy,db,paid,web)
   with patch.object(grok,'KEY',path/'key'),patch.object(grok,'rpc',side_effect=rpc):grok.handle(a,1);grok.drive(a,1)
   self.assertEqual(paid.call_count,2);self.assertEqual(state['sent'],1)
   with a.connect() as c:self.assertEqual(c.execute('SELECT status FROM codex_jobs').fetchone()[0],'success')

 def test_live_paid_reader_uses_exact_grok_tier_and_quantity_for_both_sources(self):
  a,path,policy,_,_=self.setup_grok()
  with a.connect() as c:job={**dict(c.execute('SELECT * FROM codex_jobs').fetchone()),'contract_code':'grok-super-1'}
  worker=path/'worker.db'
  with sqlite3.connect(worker) as c:
   c.executescript('CREATE TABLE account(id TEXT,status TEXT,currency TEXT);CREATE TABLE broker_order_cache(account_id TEXT,order_id TEXT,status TEXT,occurred_at TEXT,quantity REAL);CREATE TABLE auto_delivery_reservation(order_id TEXT);')
   c.execute("INSERT INTO account VALUES(?,'active','RUB')",(job['account_id'],))
   c.execute("INSERT INTO broker_order_cache VALUES(?,?,'paid',?,1)",(job['account_id'],job['order_id'],fixtures.iso()))
  c.close()
  live={'id':job['order_id'],'status':'paid','title':job['title'],'price':1000,'quantity':1}
  with patch.object(root,'WORKER',worker):
   self.assertTrue(root.paid(job,policy,worker_read=lambda _: [live],classifier=grok.classify)['payment_verified'])
   for change in ({'title':'Grok Plus 30 дней'},{'quantity':2},{'status':'completed'}):
    with self.assertRaises(ValueError):root.paid(job,policy,worker_read=lambda _: [{**live,**change}],classifier=grok.classify)
  profit=path/'paid-player.db'
  with sqlite3.connect(profit) as c:
   c.execute('CREATE TABLE external_orders(platform TEXT,order_id TEXT,status TEXT,occurred_at TEXT,title TEXT,payload_json TEXT,gross_revenue_rub REAL,commission_rub REAL)')
   c.execute("INSERT INTO external_orders VALUES('playerok',?,'paid',?,?,?,1000,50)",(job['order_id'],fixtures.iso(),job['title'],'{"quantity":1}'))
  c.close()
  job['platform']='playerok'
  deal={'id':job['order_id'],'status':'PAID','direction':'OUT'}
  with patch.object(root,'PROFIT',profit):
   self.assertTrue(root.paid(job,policy,player_read=lambda _:deal,classifier=grok.classify)['payment_verified'])
   with self.assertRaises(ValueError):root.paid(job,policy,player_read=lambda _:{**deal,'status':'CANCELED'},classifier=grok.classify)
   with sqlite3.connect(profit) as c:c.execute("UPDATE external_orders SET title='Grok Plus 30 дней'")
   c.close()
   with self.assertRaises(ValueError):root.paid(job,policy,player_read=lambda _:deal,classifier=grok.classify)

 def test_source_titles_provider_aliases_and_sessions_are_exact(self):
  for tier in grok.KINDS:
   self.assertEqual(grok.classify('Grok '+tier+' на ваш аккаунт 1 месяц'),'grok-'+tier+'-1')
  for title in ('Grok 30 дней','Grok Plus Premium 30 дней','Grok Plus 3 месяца','Grok Plus annual 1 month','Готовый аккаунт Grok Plus 30 дней'):
   self.assertIsNone(grok.classify(title))
  self.assertEqual(grok.provider_product({'plan_type':'grok_plus','plan_name':'Grok Super 1 month'}),'grok-super-1')
  self.assertIsNone(grok.provider_product({'plan_type':'grok_plus'}))
  self.assertEqual(grok.provider_product({'plan_type':'grok_premium_halfprice','plan_name':'Grok Premium 半价优惠'}),'grok-premium-1')
  for tier in grok.KINDS:
   self.assertEqual(grok.provider_product({'plan_type':'grok_'+tier+'_halfprice','plan_name':'Grok '+tier+' 1 month'}),'grok-'+tier+'-1')
  self.assertIsNone(grok.provider_product({'plan_type':'grok_premium_halfprice','plan_name':'Grok Premium annual'}))
  for raw in (sso(1),{'accessToken':sso()},{'sso':sso(),'other':'cookie'},'not a session'):
   with self.assertRaisesRegex(ValueError,'supplier_grok_session_required'):grok.normalize(raw)

 def test_customer_data_cannot_cross_the_next_order_in_the_same_chat(self):
  for platform in ('funpay','playerok'):
   a,_,_,_,_=self.setup_grok(platform)
   current={'id':22,'timestamp_iso':fixtures.iso(5),'text':sso()}
   next_paid={'id':30,'timestamp_iso':fixtures.iso(20),'text':'Покупатель оплатил заказ OTHER-ORDER'}
   future={'id':31,'timestamp_iso':fixtures.iso(30),'text':'https://notebrio.com/n/other-order '+sso()}
   with a.connect() as c:
    j=c.execute('SELECT * FROM codex_jobs').fetchone()
    if platform=='playerok':c.execute("INSERT INTO codex_jobs(id,account_id,chat_id,source_created_at) VALUES(2,?,?,?)",(j['account_id'],j['chat_id'],next_paid['timestamp_iso']))
    scoped=grok.scoped_messages(a,c,j,[current,next_paid,future])
    self.assertEqual([m['id'] for m in scoped],[22])

if __name__=='__main__':unittest.main()
