"""Read-only deployed server UI preflight. Never creates an order or invoice."""
import fcntl,importlib.util,json,os
from pathlib import Path


def main():
    if os.geteuid()!=0:raise ValueError('supplier_owner_required')
    spec=importlib.util.spec_from_file_location('broker',Path(__file__).with_name('aibuy-broker.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
    with open(b.STATE/'account.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        quotes=[]
        for n in (250,500,1000):
            r=b.child({'mode':'prepare','credits':n})
            quotes.append({k:r[k] for k in ('owner_verified','amount_minor','balance_minor','stock')})
            quotes[-1]['credits']=n
        return {'state':'verified','quotes':quotes,'purchases_started':0,'activations_started':0}


if __name__=='__main__':
    try:result=main()
    except Exception as e:
        import re
        code=str(e);result={'error':code if re.fullmatch(r'supplier_[a-z_]{1,70}',code) else 'supplier_preflight_failed','purchases_started':0}
    print(json.dumps(result));raise SystemExit(1 if result.get('error') else 0)
