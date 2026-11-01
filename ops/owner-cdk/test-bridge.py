"""Explicit owner imports, no real inventory, bots, provider or payment calls."""
import importlib.util,json,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch,Mock
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('bridge',HERE/'bridge.py');bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
class Tests(unittest.TestCase):
 def fixture(self):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);path=Path(tmp.name);owner=path/'owner.json';owner.write_text(json.dumps({'userId':'fixture-owner','telegramId':'123'}))
  for attr,value in [('OWNER',owner),('STATE',path/'private/receipts.sqlite')]:p=patch.object(bridge,attr,value);p.start();self.addCleanup(p.stop)
  req={'action':'cdk_import','telegram_id':'123','reference':'tgcdk-'+'a'*32,'pool':'gp','codes':['TEST-AAAA-BBBB-CCCC']}
  run=Mock(return_value={'pool':'gp','productKey':'grok-premium-1','activationSiteUrl':'https://aiee.fun','received':1,'inserted':1,'skipped':0,'conflicts':0})
  return req,run
 def test_repeated_reference_reuses_count_receipt_and_never_stores_codes(self):
  req,run=self.fixture();a=bridge.dispatch(req,run);self.assertEqual(bridge.dispatch(req,run),a);run.assert_called_once()
  self.assertNotIn(b'TEST-AAAA',bridge.STATE.read_bytes())
  with self.assertRaisesRegex(ValueError,'reference_conflict'):bridge.dispatch({**req,'codes':['TEST-DDDD-EEEE-FFFF']},run)
 def test_foreign_owner_bad_packet_session_and_oversized_import_cannot_write(self):
  req,run=self.fixture()
  for change in [{'telegram_id':'456'},{'reference':'other'},{'codes':['eyJabc.def.ghi']},{'codes':['TEST-AAAA']*21},{'action':'activate'},{'pool':'../grok'}]:
   with self.assertRaises(ValueError):bridge.dispatch({**req,**change},run)
  run.assert_not_called();self.assertFalse(bridge.STATE.exists())
 def test_unknown_first_result_can_retry_same_reference_without_relabel_or_new_request(self):
  req,run=self.fixture();run.side_effect=TimeoutError('fixture')
  with self.assertRaises(TimeoutError):bridge.dispatch(req,run)
  run.side_effect=None;self.assertEqual(bridge.dispatch(req,run)['inserted'],1)
  self.assertEqual(run.call_args_list[0],run.call_args_list[1])
 def test_existing_socket_peer_and_owner_checks_precede_cdk_dispatch(self):
  req,_=self.fixture();spec=importlib.util.spec_from_file_location('server',HERE.parent/'supplier-procurement/aibuy-topup-server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
  handler=Mock(return_value={'inserted':1});load=Mock(return_value=types.SimpleNamespace(dispatch=handler));authorize=Mock(return_value=True)
  with patch.object(server,'module',load):
   with self.assertRaisesRegex(ValueError,'peer_refused'):server.dispatch(req,12,13,authorize=authorize)
   authorize.assert_not_called();load.assert_not_called()
   with self.assertRaisesRegex(ValueError,'owner_required'):server.dispatch(req,13,13,authorize=lambda _:False)
   load.assert_not_called()
   self.assertEqual(server.dispatch(req,13,13,authorize=authorize,create=Mock(side_effect=AssertionError('No invoice')),browser=Mock(side_effect=AssertionError('No supplier call'))),{'inserted':1})
   handler.assert_called_once_with(req)
if __name__=='__main__':unittest.main()
