import importlib.util,os,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).parent
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
b=load('broker_topup_test','aibuy-broker.py');t=load('topup_test','aibuy-topup.py');server=load('topup_server_test','aibuy-topup-server.py');installer=load('ui_installer_test','install-aibuy-telegram.py')
ui=load('topup_browser_test','aibuy-browser.py')

class Tests(unittest.TestCase):
 def test_navigation_recovers_invoice_without_a_second_click(self):
  events=[];self_test=self
  class Event:
   def __enter__(self):return self
   def __exit__(self,*args):raise TimeoutError()
  class Locator:
   def __init__(self,page,selector):self.page=page;self.selector=selector
   def fill(self,value):self_test.assertEqual(value,'200.00')
   def wait_for(self,**kw):pass
   def inner_text(self):return 'USDT-BEP20'
   def click(self,**kw):
    if self.selector=='.payButton':events.append('create');self.page.url=self.page.destination
   def is_enabled(self):return True
   def input_value(self):return '200.00'
   def count(self):return 0
  class Page:
   destination='https://pay.ai-buy.vip/pay/checkout-counter/FIXTURE1234'
   url=ui.ORIGIN+'/user/recharge/index'
   def goto(self,*args,**kw):pass
   def locator(self,selector):return Locator(self,selector)
   def wait_for_function(self,*args,**kw):pass
   def on(self,*args):pass
   def expect_response(self,*args,**kw):return Event()
  r=ui.topup(Page(),{'amount_minor':20000,'network':'BEP20'},{'started':False})
  self.assertEqual(r['invoice_url'],Page.destination);self.assertFalse(r['paid']);self.assertEqual(events,['create'])
  for destination in ('https://evil.test/pay/checkout-counter/FIXTURE1234','https://pay.ai-buy.vip/pay/checkout-counter/FIXTURE1234?x=bad'):
   page=Page();page.destination=destination;events.clear()
   r=ui.topup(page,{'amount_minor':20000,'network':'BEP20'},{'started':False})
   self.assertEqual(r['dispatch_state'],'sent_or_uncertain');self.assertNotIn('invoice_url',r);self.assertEqual(events,['create'])
 def test_only_proven_preclick_failure_can_retry_and_rejection_keeps_first_result(self):
  v=b.Vault(':memory:',os.urandom(32));calls=[]
  def not_sent():calls.append('preclick');return {'error':'supplier_checkout_not_ready','dispatch_state':'not_sent'}
  with self.assertRaisesRegex(ValueError,'checkout_not_ready'):t.invoice_request(v,'retry-fixture',20000,'BEP20',not_sent)
  def rejected():calls.append('rejected');return {'error':'supplier_topup_rejected','dispatch_state':'sent_or_uncertain','provider_code':42002}
  with self.assertRaisesRegex(ValueError,'topup_rejected'):t.invoice_request(v,'retry-fixture',20000,'BEP20',rejected)
  with self.assertRaisesRegex(ValueError,'topup_rejected'):t.invoice_request(v,'retry-fixture',20000,'BEP20',lambda:self.fail('must not dispatch again'))
  row=v.db.execute('SELECT * FROM topups').fetchone();self.assertEqual(row['state'],'review')
  self.assertEqual(v.open(row['receipt'],'retry-fixture|topup')['provider_code'],42002);self.assertEqual(calls,['preclick','rejected']);v.db.close()
 def test_preclick_and_uncertain_browser_errors_have_distinct_persistent_evidence(self):
  from unittest.mock import patch
  with patch.object(ui,'_main',side_effect=TimeoutError()):
   self.assertEqual(ui.main({'mode':'topup'})['dispatch_state'],'not_sent')
  def sent(data,dispatch):dispatch.update(started=True,phase='response');raise TimeoutError()
  with patch.object(ui,'_main',side_effect=sent):
   r=ui.main({'mode':'topup'});self.assertEqual(r['dispatch_state'],'sent_or_uncertain');self.assertEqual(r['phase'],'response');self.assertEqual(r['exception'],'TimeoutError')
 def test_balance_uses_storefront_layout_without_payment_or_stock_actions(self):
  events=[]
  class Page:
   def goto(self,url,**kw):events.append(url)
   def locator(self,selector):
    self_test.assertEqual(events,[ui.ORIGIN+'/item/75']);self_test.assertEqual(selector,'#tokyoUserDropdown');return self
   def wait_for(self,**kw):self_test.assertEqual(kw['state'],'attached')
   def inner_text(self):return 'Balance ¥437.00'
  self_test=self;self.assertEqual(ui.balance_snapshot(Page()),{'balance_minor':43700,'owner_verified':True})
  class Ambiguous(Page):
   def inner_text(self):return 'Balance ¥437.00 Other ¥200.00'
  events.clear()
  with self.assertRaisesRegex(ValueError,'balance_unconfirmed'):ui.balance_snapshot(Ambiguous())
 def test_once_only_invoice_survives_restart_and_contract_cannot_change(self):
  with tempfile.TemporaryDirectory() as d:
   file=Path(d)/'invoices.sqlite';key=os.urandom(32);calls=[]
   result={'invoice_url':'https://pay.ai-buy.vip/pay/checkout-counter/FIXTURE1234','paid':False,'amount_minor':20000,'network':'BEP20'}
   def send():calls.append('create-unpaid-invoice');return result
   v=b.Vault(file,key);self.assertEqual(t.invoice_request(v,'owner-fixture',20000,'BEP20',send),result);v.db.close()
   v=b.Vault(file,key);self.assertEqual(t.invoice_request(v,'owner-fixture',20000,'BEP20',send),result)
   with self.assertRaisesRegex(ValueError,'contract_changed'):t.invoice_request(v,'owner-fixture',20000,'TRC20',send)
   with self.assertRaisesRegex(ValueError,'contract_changed'):t.invoice_request(v,'owner-fixture',50000,'BEP20',send)
   self.assertEqual(len(calls),1);v.db.close();self.assertNotIn(b'FIXTURE1234',file.read_bytes())
 def test_lost_creation_reply_is_never_sent_again(self):
  v=b.Vault(':memory:',os.urandom(32));calls=[]
  def lost():calls.append('create');raise TimeoutError()
  with self.assertRaises(TimeoutError):t.invoice_request(v,'fixture',20000,'TRC20',lost)
  with self.assertRaisesRegex(ValueError,'unconfirmed'):t.invoice_request(v,'fixture',20000,'TRC20',lost)
  self.assertEqual(calls,['create']);v.db.close()
 def test_peer_and_live_owner_guards_precede_any_invoice_or_balance_access(self):
  req={'action':'create_invoice','telegram_id':'123','reference':'tg-'+'a'*32,'amount_minor':20000,'network':'TRC20'}
  def forbidden(*a):self.fail('must not access supplier')
  with self.assertRaisesRegex(ValueError,'peer_refused'):server.dispatch(req,11,22,authorize=forbidden,create=forbidden)
  with self.assertRaisesRegex(ValueError,'owner_required'):server.dispatch(req,22,22,authorize=lambda _:False,create=forbidden)
  with self.assertRaisesRegex(ValueError,'request_invalid'):server.dispatch({**req,'action':'procure'},22,22,authorize=lambda _:True,create=forbidden)
  with self.assertRaisesRegex(ValueError,'request_invalid'):server.dispatch({**req,'network':'POLYGON'},22,22,authorize=lambda _:True,create=forbidden)
  with self.assertRaisesRegex(ValueError,'topup_amount'):server.dispatch({**req,'amount_minor':True},22,22,authorize=lambda _:True,create=forbidden)
 def test_exact_invoice_fields_and_https_gateway_are_required(self):
  req={'action':'create_invoice','telegram_id':'123','reference':'tg-'+'a'*32,'amount_minor':20000,'network':'BEP20'}
  good={'invoice_url':'https://pay.ai-buy.vip/pay/checkout-counter/FIXTURE1234','paid':False,'amount_minor':20000,'network':'BEP20'}
  self.assertEqual(server.dispatch(req,22,22,authorize=lambda _:True,create=lambda *a:good),good)
  for change in ({'paid':True},{'network':'TRC20'},{'amount_minor':10000},{'invoice_url':'https://pay.ai-buy.vip.attacker.test/pay/checkout-counter/FIXTURE1234'}):
   with self.assertRaisesRegex(ValueError,'unconfirmed'):server.dispatch(req,22,22,authorize=lambda _:True,create=lambda *a:{**good,**change})
 def test_live_bot_patch_is_additive_idempotent_and_preserves_authorization(self):
  source=(HERE.parent/'legacy-bots/monitor-worker.mjs').read_text(encoding='utf-8');new=installer.transform(source)
  self.assertEqual(installer.transform(new),new);self.assertIn('command: "aibuy"',new)
  self.assertLess(new.index('if (!isAllowed(userId)) return send'),new.index('aibuyTopupUi.handleMessage(message)'))
  self.assertIn('drop_pending_updates: false',new);self.assertIn('parse_mode',new)

if __name__=='__main__':unittest.main()
