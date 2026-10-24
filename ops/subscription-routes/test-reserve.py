import importlib.util,sys,unittest,types,datetime,sqlite3,tempfile
from contextlib import contextmanager
from pathlib import Path
if sys.platform=='win32':sys.modules['fcntl']=types.SimpleNamespace()
s=importlib.util.spec_from_file_location('reserve',Path(__file__).with_name('reserve-auto.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class Routing(unittest.TestCase):
 def test_funds_grace_is_durable_and_notices_route_to_the_correct_bot(self):
  stamp=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
  sys.modules['zovocard_pulse_bridge']=types.SimpleNamespace(_time=stamp)
  with tempfile.TemporaryDirectory() as tmp:
   class A:
    @contextmanager
    def connect(self):
     c=sqlite3.connect(str(Path(tmp)/'fixture.db'));c.row_factory=sqlite3.Row
     try:
      with c:yield c
     finally:c.close()
   a=A()
   with a.connect() as c:c.execute('CREATE TABLE codex_jobs(id INTEGER PRIMARY KEY,key_pool TEXT)')
   r.init(a);now=stamp('2026-10-24T13:00:00Z');cfg={'funds_wait_enabled_after':'2026-10-24T12:00:00Z'}
   j={'id':1,'platform':'gptishka','order_id':'fixture-order','status':'manual_action','key_id':None,'aiee_order_id':None,'error':'ZovoCard: Недостаточно доступных средств ZovoCard.','source_created_at':'2026-10-24T12:50:00Z','created_at':'2026-10-24T12:50:00Z'}
   self.assertTrue(r.funds_wait(a,j,cfg,now));self.assertTrue(r.funds_wait(a,j,cfg,now+899))
   self.assertFalse(r.funds_wait(a,j,cfg,now+900));self.assertFalse(r.funds_wait(a,j,cfg,now+1000))
   with a.connect() as c:
    rows=c.execute('SELECT * FROM subscription_reserve_notices').fetchall()
    self.assertEqual(len(rows),2);self.assertTrue(all(x['destination']=='myadminiibot' for x in rows))
    card=r.reserve_notice_card(rows[0]['message']);self.assertIn('<b>ZovoCard · Ожидает средств</b>',card);self.assertNotIn('Активация · резервный канал',card)
    self.assertEqual(c.execute('SELECT deadline_at FROM subscription_funds_wait').fetchone()[0],now+900)
   for platform in ('funpay','playerok'):
    self.assertTrue(r.funds_wait(a,{**j,'id':2 if platform=='funpay' else 3,'platform':platform},cfg,now))
   with a.connect() as c:self.assertEqual(c.execute("SELECT COUNT(*) FROM subscription_reserve_notices WHERE destination='funpaypulseaibot'").fetchone()[0],2)
   for patch in [{'id':4,'created_at':'2026-10-24T11:00:00Z'},{'id':4,'status':'processing'},{'id':4,'key_id':'bound'},{'id':4,'error':'funding_requires_reconciliation'}]:
    self.assertFalse(r.funds_wait(a,{**j,**patch},cfg,now))
   with a.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM subscription_funds_wait').fetchone()[0],3)
 def test_exact_plan_pool_matrix(self):
  for kind,base in [('chatgpt_plus','plus'),('chatgpt_go','go'),('chatgpt_pro_5x','pro5x'),('chatgpt_pro_20x','pro20x'),('chatgpt_pro_25x','pro25x')]:
   self.assertEqual(r.select_pool(kind,'free'),base+'_free')
   for plan in ['plus','go','pro','prolite','prolight']:
    if kind.endswith('25x'):
     with self.assertRaises(ValueError):r.select_pool(kind,plan)
    else:self.assertEqual(r.select_pool(kind,plan),base+'_active')
   with self.assertRaises(ValueError):r.select_pool(kind,'unknown')
 def test_tier_verification_does_not_trust_ios_prefix(self):
  v={'success':True,'sid':'fixture'}
  self.assertEqual(r.verify({**v,'type':'pro_5x_month'},'IOS-fixture','chatgpt_pro_5x','vip'),'fixture')
  for data in [v,{**v,'type':'plus_month'},{**v,'type':'pro_20x_month'}]:
   with self.assertRaises(ValueError):r.verify(data,'IOS-fixture','chatgpt_pro_5x','vip')
  with self.assertRaises(ValueError):r.verify({**v,'plan_type':'pro_5x','require_cookie':1},'fixture','chatgpt_pro_5x','aiee')
 def test_adding_pro_fallback_does_not_replay_old_paid_jobs(self):
  stamp=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
  sys.modules['zovocard_pulse_bridge']=types.SimpleNamespace(_time=stamp)
  cfg={'enabled':True,'enabled_after':'2026-10-23T00:00:00Z','minimum_wait_seconds':300,'product_enabled_after':{'chatgpt_pro_5x':'2026-10-24T12:00:00Z'}}
  j={'product_type':'chatgpt_pro_5x','platform':'gptishka','key_pool':'zovocard_pro5x_direct','status':'manual_action','key_id':None,'aiee_order_id':None,'source_created_at':'2026-10-24T10:00:00Z','created_at':'2026-10-24T10:00:00Z'}
  self.assertFalse(r.eligible(j,cfg,stamp('2026-10-24T14:00:00Z')))
  self.assertTrue(r.eligible({**j,'source_created_at':'2026-10-24T13:00:00Z','created_at':'2026-10-24T13:00:00Z'},cfg,stamp('2026-10-24T14:00:00Z')))
 def test_inflight_and_success_jobs_never_fall_back(self):
  stamp=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
  sys.modules['zovocard_pulse_bridge']=types.SimpleNamespace(_time=stamp)
  cfg={'enabled':True,'enabled_after':'2026-10-23T00:00:00Z','minimum_wait_seconds':300}
  j={'product_type':'chatgpt_plus','platform':'gptishka','key_pool':'zovocard_siteplus_direct','status':'processing','key_id':None,'aiee_order_id':None,'source_created_at':'2026-10-24T10:00:00Z','created_at':'2026-10-24T10:00:00Z'}
  for patch in [{},{'status':'success'},{'status':'manual_action','key_id':'used'},{'status':'manual_action','aiee_order_id':'prior'}]:self.assertFalse(r.eligible({**j,**patch},cfg,stamp('2026-10-24T14:00:00Z')))
if __name__=='__main__':unittest.main()
