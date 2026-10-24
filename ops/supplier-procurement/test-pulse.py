import importlib.util,sys,unittest,tempfile,json,sqlite3,contextlib,types
from pathlib import Path
HERE=Path(__file__).parent
def module(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
supply=module('aisou_stock','pulse-stock.py')
class Fixture(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  supply.CONFIG=Path(self.tmp.name)/'policy.json';supply.CONFIG.write_text(json.dumps({'enabled':True,'enabled_after':'2026-10-24T00:00:00Z'}))
  self.trace=[]
  def remote(req):self.trace.append('seal');return {'ok':True,'result':{'state':'fallback_sealed'}}
  sys.modules['zovocard_pulse_bridge']=types.SimpleNamespace(_time=lambda v:__import__('datetime').datetime.fromisoformat(v.replace('Z','+00:00')).timestamp(),remote=remote)
  sys.modules['codex_primary_route']=types.SimpleNamespace(aiee_primary=lambda n:False)
  sys.modules['site_aiee_costs']=types.SimpleNamespace(init=lambda a:None)
  sys.modules['codex_automation']=types.SimpleNamespace(utc_now=lambda:'2026-10-24T01:00:00Z')
  self.j={'id':1,'order_id':'fixturepaidorder0000000001','platform':'gptishka','account_id':'site','product_type':'codex','package':250,'source_created_at':'2026-10-24T01:00:00Z','created_at':'2026-10-24T01:00:00Z','status':'manual_action','key_id':None,'aiee_order_id':''}
  c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row;self.addCleanup(c.close)
  c.executescript('CREATE TABLE codex_keys(id INTEGER PRIMARY KEY,package INTEGER,pool TEXT,encrypted_key TEXT,fingerprint TEXT UNIQUE,status TEXT,added_at TEXT); CREATE TABLE site_aiee_key_costs(key_id INTEGER PRIMARY KEY,package INTEGER,cny TEXT,rub TEXT,usdt TEXT,source TEXT,recorded_at REAL);')
  @contextlib.contextmanager
  def connect():
   with c:yield c
  self.db=c;self.a=types.SimpleNamespace(connect=connect,_fernet=lambda:types.SimpleNamespace(encrypt=lambda x:b'fixture-encrypted'),_log=lambda *a:None)
  self.mod=types.SimpleNamespace(site=lambda *a:{'financial':{},'order':{}},finance=lambda x:True)
 def test_only_new_website_orders(self):
  self.assertTrue(supply.enabled(self.j))
  for p in [{'platform':'funpay'},{'account_id':'marketplace'},{'source_created_at':'2026-10-23T00:00:00Z'},{'product_type':'unknown'}]:self.assertFalse(supply.enabled({**self.j,**p}))
 def test_stock_replenishment_keeps_website_pool_cost_and_encryption(self):
  def rpc(j,p):self.assertEqual(self.trace,['seal']);self.trace.append('buy');return {'code':'C250-TEST-TEST-TEST','tradeNo':'fixture','amountCny':75,'costRub':990}
  supply.rpc=rpc;supply.codex(self.a,self.j,self.mod)
  row=self.db.execute('SELECT * FROM codex_keys').fetchone();self.assertEqual(row['pool'],'aiee_site_reserve_250');self.assertEqual(row['package'],250);self.assertEqual(row['encrypted_key'],'fixture-encrypted')
  self.assertEqual(self.db.execute('SELECT rub FROM site_aiee_key_costs').fetchone()[0],'990')
  supply.codex(self.a,self.j,self.mod);self.assertEqual(self.trace,['seal','buy'])
 def test_uncertain_reply_never_imports_a_key_or_marks_fulfilment(self):
  supply.rpc=lambda *a:(_ for _ in ()).throw(ValueError('supplier_uncertain'))
  with self.assertRaises(ValueError):supply.codex(self.a,self.j,self.mod)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM codex_keys').fetchone()[0],0)
 def test_wrong_nominal_response_cannot_enter_target_pool(self):
  supply.rpc=lambda *a:{'code':'C500-TEST-TEST-TEST','tradeNo':'fixture','amountCny':145,'costRub':1914}
  with self.assertRaises(ValueError):supply.codex(self.a,self.j,self.mod)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM codex_keys').fetchone()[0],0)
if __name__=='__main__':unittest.main()
