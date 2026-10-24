import importlib.util,sys,unittest,types,datetime
from pathlib import Path
if sys.platform=='win32':sys.modules['fcntl']=types.SimpleNamespace()
s=importlib.util.spec_from_file_location('reserve',Path(__file__).with_name('reserve-auto.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class Routing(unittest.TestCase):
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
