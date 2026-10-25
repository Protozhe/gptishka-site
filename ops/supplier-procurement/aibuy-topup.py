"""Owner SSH helper: create ONE unpaid invoice in the existing server session.

Usage: python aibuy-topup.py --id owner-unique-reference --amount 200 --network BEP20
No login, password, funds transfer, customer activation or automatic retry.
"""
import argparse,importlib.util,json,os,re,sys
from pathlib import Path


def invoice_request(v,reference,amount,network,send):
    v.db.execute('CREATE TABLE IF NOT EXISTS topups(id TEXT PRIMARY KEY,amount_minor INTEGER NOT NULL,network TEXT NOT NULL,state TEXT NOT NULL,receipt BLOB)')
    row=v.db.execute('SELECT * FROM topups WHERE id=?',(reference,)).fetchone()
    if row:
        if row['amount_minor']!=amount or row['network']!=network:raise ValueError('supplier_topup_contract_changed')
        if row['receipt']:
            result=v.open(row['receipt'],reference+'|topup')
            if row['state']!='not_sent':
                if result.get('error'):raise ValueError(result['error'])
                return result
        else:raise ValueError('supplier_topup_unconfirmed')
        # Only an explicit pre-click failure allows a new attempt. Unknown
        # dispatches and provider rejections always retain their first result.
        v.db.execute("UPDATE topups SET state='creating',receipt=NULL WHERE id=?",(reference,))
    else:v.db.execute("INSERT INTO topups VALUES(?,?,?,'creating',NULL)",(reference,amount,network))
    result=send()
    state=('not_sent' if result.get('dispatch_state')=='not_sent' else 'review') if result.get('error') else 'created'
    v.db.execute("UPDATE topups SET state=?,receipt=? WHERE id=?",(state,v.seal(result,reference+'|topup'),reference))
    if result.get('error'):raise ValueError(result['error'])
    return result


def create_invoice(reference,amount,network):
    import fcntl
    if os.geteuid()!=0:raise ValueError('supplier_owner_required')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}',reference):raise ValueError('supplier_topup_reference')
    if network not in ('BEP20','POLYGON','TRC20'):raise ValueError('supplier_topup_network')
    spec=importlib.util.spec_from_file_location('aibuy_broker',Path(__file__).with_name('aibuy-broker.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
    if type(amount) is not int or not 100<=amount<=1000000:raise ValueError('supplier_topup_amount')
    b.STATE.mkdir(mode=0o700,exist_ok=True)
    # Same account lock as purchases: no top-up invoice races a debit.
    lock=open(b.STATE/'account.lock','a');os.chmod(lock.name,0o600);fcntl.flock(lock,fcntl.LOCK_EX)
    saved,key,cookies=b.session();v=b.Vault(b.STATE/'journal.sqlite',key)
    try:
        return invoice_request(v,reference,amount,network,lambda:b.child({'mode':'topup','cookies':cookies,'merchantId':saved['merchantId'],'credits':250,'amount_minor':amount,'network':network}))
    finally:v.db.close();lock.close()


def main():
    args=argparse.ArgumentParser();args.add_argument('--id',required=True);args.add_argument('--amount',required=True);args.add_argument('--network',choices=['BEP20','POLYGON','TRC20'],required=True);a=args.parse_args()
    from decimal import Decimal
    n=Decimal(a.amount)*100
    if not n.is_finite() or n!=n.to_integral_value():raise ValueError('supplier_topup_amount')
    return create_invoice(a.id,int(n),a.network)


if __name__=='__main__':
    try:result=main()
    except Exception as e:
        text=str(e);result={'error':text if re.fullmatch(r'supplier_[a-z_]{1,70}',text) else 'supplier_topup_unconfirmed'}
    print(json.dumps(result));sys.exit(1 if result.get('error') else 0)
