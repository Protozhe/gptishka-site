import importlib.util,os,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).parent
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
b=load('broker_topup_test','aibuy-broker.py');t=load('topup_test','aibuy-topup.py');server=load('topup_server_test','aibuy-topup-server.py');installer=load('ui_installer_test','install-aibuy-telegram.py')

class Tests(unittest.TestCase):
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
