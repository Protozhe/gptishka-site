"""Owner SSH helper: create ONE unpaid invoice in the existing server session.

Usage: python aibuy-topup.py --id owner-unique-reference --amount 200 --network BEP20
No login, password, funds transfer, customer activation or automatic retry.
"""
import argparse,fcntl,importlib.util,json,os,re,sys
from pathlib import Path


def main():
    if os.geteuid()!=0:raise ValueError('supplier_owner_required')
    args=argparse.ArgumentParser();args.add_argument('--id',required=True);args.add_argument('--amount',required=True);args.add_argument('--network',choices=['BEP20','POLYGON','TRC20'],required=True);a=args.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}',a.id):raise ValueError('supplier_topup_reference')
    spec=importlib.util.spec_from_file_location('aibuy_broker',Path(__file__).with_name('aibuy-broker.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
    amount=b.minor(a.amount)
    if not 100<=amount<=1000000:raise ValueError('supplier_topup_amount')
    b.STATE.mkdir(mode=0o700,exist_ok=True)
    # Same account lock as purchases: no top-up invoice races a debit.
    lock=open(b.STATE/'account.lock','a');os.chmod(lock.name,0o600);fcntl.flock(lock,fcntl.LOCK_EX)
    saved,key,cookies=b.session();v=b.Vault(b.STATE/'journal.sqlite',key)
    try:
        v.db.execute('CREATE TABLE IF NOT EXISTS topups(id TEXT PRIMARY KEY,amount_minor INTEGER NOT NULL,network TEXT NOT NULL,state TEXT NOT NULL,receipt BLOB)')
        row=v.db.execute('SELECT * FROM topups WHERE id=?',(a.id,)).fetchone()
        if row:
            if row['amount_minor']!=amount or row['network']!=a.network:raise ValueError('supplier_topup_contract_changed')
            if row['receipt']:return v.open(row['receipt'],a.id+'|topup')
            raise ValueError('supplier_topup_unconfirmed')
        v.db.execute("INSERT INTO topups VALUES(?,?,?,'creating',NULL)",(a.id,amount,a.network))
        result=b.child({'mode':'topup','cookies':cookies,'merchantId':saved['merchantId'],'credits':250,'amount_minor':amount,'network':a.network})
        v.db.execute("UPDATE topups SET state='created',receipt=? WHERE id=?",(v.seal(result,a.id+'|topup'),a.id));return result
    finally:v.db.close()


if __name__=='__main__':
    try:result=main()
    except Exception as e:
        text=str(e);result={'error':text if re.fullmatch(r'supplier_[a-z_]{1,70}',text) else 'supplier_topup_unconfirmed'}
    print(json.dumps(result));sys.exit(1 if result.get('error') else 0)
