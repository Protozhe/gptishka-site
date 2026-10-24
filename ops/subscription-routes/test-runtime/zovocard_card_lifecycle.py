"""Journaled issuance and surplus returns for the approved XL537872 pool."""
import hashlib
from decimal import Decimal, ROUND_CEILING
from datetime import datetime

class Lifecycle:
    def init_lifecycle(self):
        with self.connect() as c:
            c.execute("CREATE TABLE IF NOT EXISTS zovo_card_open_intents(source_id TEXT PRIMARY KEY,request_id TEXT UNIQUE,state TEXT,card_id INTEGER,init_minor INTEGER,fee_minor INTEGER,remark TEXT,created_at REAL)")
            c.execute("CREATE TABLE IF NOT EXISTS zovo_managed_cards(card_id INTEGER PRIMARY KEY,source_id TEXT UNIQUE,open_fee_minor INTEGER,init_minor INTEGER,created_at REAL)")
            c.execute("CREATE TABLE IF NOT EXISTS zovo_card_returns(source_id TEXT PRIMARY KEY,card_id INTEGER,request_id TEXT UNIQUE,state TEXT,before_minor INTEGER,keep_minor INTEGER,amount_minor INTEGER,ledger_after INTEGER,created_at REAL)")
            c.execute("CREATE TABLE IF NOT EXISTS zovo_cost_snapshots(source_id TEXT PRIMARY KEY,card_charge_minor INTEGER,service_fee_minor INTEGER,open_fee_minor INTEGER,total_cost_minor INTEGER,remaining_before_return INTEGER,created_at REAL)")
            cols={r[1] for r in c.execute('PRAGMA table_info(zovo_direct_jobs)')}
            for name in ['target_balance_minor','estimated_charge_minor','baseline_balance_minor']:
                if name not in cols:c.execute('ALTER TABLE zovo_direct_jobs ADD COLUMN '+name+' INTEGER')
            if c.execute("SELECT 1 FROM sqlite_master WHERE name='zovo_credit250_cost_baseline'").fetchone():
                c.execute("UPDATE zovo_direct_jobs SET baseline_balance_minor=(SELECT balance_minor FROM zovo_credit250_cost_baseline b WHERE b.source_id=zovo_direct_jobs.source_id) WHERE baseline_balance_minor IS NULL")
            registered=[r[0] for r in c.execute('SELECT card_id FROM zovo_managed_cards')]
        ids=list(dict.fromkeys([*(self.policy.get('card_ids') or []),*registered]))
        if ids:self.policy['card_ids']=ids

    def committed_debit(self,c):
        jobs=c.execute("SELECT COALESCE(SUM(CASE WHEN funding_state IS NOT NULL THEN COALESCE(funding_minor,0) ELSE 0 END + CASE WHEN dispatched=1 THEN COALESCE(fee_usd,0) ELSE 0 END),0) FROM zovo_direct_jobs").fetchone()[0]
        opened=c.execute("SELECT COALESCE(SUM(init_minor+fee_minor),0) FROM zovo_card_open_intents WHERE state<>'rejected'").fetchone()[0]
        return jobs+opened

    def funding_quote(self,quote,plan):
        from zovocard_card_pool import PoolError
        amount=quote['amountMinor'];currency=quote['currency']
        if currency=='USD':rate=Decimal(1)
        else:
            data=self._data(self.api.bin_rates('537872',currency));rows=data.get('rates',[])
            rows=[x for x in rows if x.get('bin')=='537872' and x.get('currency')==currency and 'XL537872' in x.get('product_codes',[])]
            if len(rows)!=1:raise PoolError('fx_stale')
            r=rows[0];stamp=datetime.fromisoformat(r['observed_at'].replace('Z','+00:00')).timestamp()
            if not -60<=self.clock()-stamp<=3600:raise PoolError('fx_stale')
            rate=Decimal(str(r['units_per_usd']))
            if not rate.is_finite() or rate<=0:raise PoolError('fx_stale')
        estimate=int((Decimal(amount)/rate).to_integral_value(rounding=ROUND_CEILING))
        if self.policy.get('learn_settled_costs') is True:
            from zovocard_cost_learning import estimate_from_history
            with self.connect() as con:
                exists=con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='zovo_cost_transaction_proofs'").fetchone()
                samples=con.execute('''SELECT j.final_amount_minor,p.charge_minor
                    FROM zovo_cost_transaction_proofs p JOIN zovo_direct_jobs j USING(source_id)
                    WHERE j.plan=? AND j.currency=? AND j.state='completed' AND j.dispatched_at>?
                    ORDER BY j.dispatched_at DESC LIMIT 20''',(self.PLAN,currency,self.clock()-30*86400)).fetchall() if exists else []
            estimate=estimate_from_history(amount,estimate,samples)
        bps=plan.get('balanceBufferBps',500);minimum=plan.get('minBalanceBufferUsdMinor',200)
        if type(bps) is not int or not 0<=bps<=2000 or type(minimum) is not int or not 0<=minimum<=1000:raise PoolError('pricing_unverified')
        buffer=max(minimum,int((Decimal(estimate)*bps/10000).to_integral_value(rounding=ROUND_CEILING)))
        target=estimate+buffer
        cap=self.policy.get('temporary_balance_caps',{}).get(self.PLAN,self.policy['max_card_balance_usd_minor'])
        if target>cap:raise PoolError('funding_over_limit')
        return estimate,target

    def _register_open_card(self,intent,card):
        from zovocard_card_pool import PoolError,cents
        cid=card.get('id')
        if type(cid) is not int or cid<=0 or card.get('product_code')!='XL537872' or card.get('issuer')!='four' or card.get('status')!='ACTIVE':raise PoolError('card_open_requires_reconciliation')
        with self.connect() as c:
            c.execute('INSERT OR IGNORE INTO zovo_managed_cards VALUES(?,?,?,?,?)',(cid,intent['source_id'],intent['fee_minor'],intent['init_minor'],self.clock()))
            c.execute("UPDATE zovo_card_open_intents SET state='confirmed',card_id=? WHERE source_id=?",(cid,intent['source_id']))
        if cid not in self.policy['card_ids']:self.policy['card_ids'].append(cid)
        return cid

    def _open_for_order(self,source,target,fee,estimate):
        from zovocard_card_pool import PoolError,cents
        if self.policy.get('auto_card_open') is not True:raise PoolError('pool_waiting_for_card')
        with self.connect() as c:
            old=c.execute('SELECT * FROM zovo_card_open_intents WHERE source_id=?',(source,)).fetchone()
            unresolved=c.execute("SELECT 1 FROM zovo_card_open_intents WHERE state IN ('sending','pending','uncertain') AND source_id<>?",(source,)).fetchone()
        if unresolved:raise PoolError('card_open_requires_reconciliation')
        if old:
            if old['state']=='confirmed':return old['card_id']
            matches=self._data(self.api.find_cards(old['remark'])).get('list',[])
            matches=[x for x in matches if str(x.get('remark','')).startswith(old['remark']) and x.get('product_code')=='XL537872']
            if len(matches)==1:return self._register_open_card(old,matches[0])
            raise PoolError('card_open_requires_reconciliation')
        status,b=self.api.products();products=b.get('data')
        if status!=200 or b.get('code')!=0 or not isinstance(products,list):raise PoolError('card_product_not_allowed')
        products=[x for x in products if x.get('product_code')=='XL537872']
        if len(products)!=1:raise PoolError('card_product_not_allowed')
        p=products[0];opening=cents(p.get('open_fee'));minimum=cents(p.get('min_amount'))
        if p.get('enabled') is not True or p.get('issuer')!='four' or p.get('google_chatgpt_blocked') or p.get('restricted_merchants') or cents(p.get('recharge_fee'))!=0 or opening>self.policy.get('max_open_fee_usd_minor',100):raise PoolError('card_product_not_allowed')
        if estimate+fee+opening>self.policy['max_wallet_debit_usd_minor']:raise PoolError('funding_over_limit')
        initial=max(target,minimum);cap=self.policy.get('temporary_balance_caps',{}).get(self.PLAN,self.policy['max_card_balance_usd_minor'])
        if initial>cap or initial>cents(p.get('max_amount')):raise PoolError('funding_over_limit')
        wallet=self._data(self.api.balance())
        if cents(wallet.get('spendable_balance'))<initial+opening+fee:raise PoolError('wallet_insufficient')
        request='pulse-open-'+hashlib.sha256(source.encode()).hexdigest()[:44];remark='GPTishka auto '+request
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if self.committed_debit(c)+initial+opening+fee>self.policy['max_cumulative_wallet_debit_usd_minor']:raise PoolError('key_budget_exhausted')
            c.execute("INSERT INTO zovo_card_open_intents VALUES(?,?,'sending',NULL,?,?,?,?)",(source,request,initial,opening,remark,self.clock()))
        try:
            self.api.writes_enabled=True
            status,b=self.api.open_card('XL537872',initial,request,remark)
            if status!=200 or b.get('code')!=0 or not isinstance(b.get('data'),dict):raise PoolError('card_open_requires_reconciliation')
            with self.connect() as c:intent=c.execute('SELECT * FROM zovo_card_open_intents WHERE source_id=?',(source,)).fetchone()
            return self._register_open_card(intent,b['data'])
        except Exception:
            with self.connect() as c:c.execute("UPDATE zovo_card_open_intents SET state='uncertain' WHERE source_id=? AND state<>'confirmed'",(source,))
            raise PoolError('card_open_requires_reconciliation') from None
        finally:self.api.writes_enabled=False

    def ensure_surplus_return(self,source):
        from zovocard_card_pool import PoolError,cents
        if self.policy.get('auto_return_surplus') is not True:return
        with self.connect() as c:
            row=c.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
            previous=c.execute('SELECT * FROM zovo_card_returns WHERE source_id=?',(source,)).fetchone()
            other=c.execute("SELECT 1 FROM zovo_direct_jobs WHERE card_id=? AND source_id<>? AND (state NOT IN ('completed','terminal_failure','failed_before_dispatch') OR (dispatched=1 AND created_at>?))",(row['card_id'],source,row['created_at'])).fetchone() if row else True
        if not row or row['state']!='completed' or other:return
        since=self.policy.get('auto_return_enabled_after')
        if since and row['created_at']<datetime.fromisoformat(since.replace('Z','+00:00')).timestamp() and source not in self.policy.get('return_legacy_sources',[]):return
        if row['plan'] in ('go','plus','pro_5x','pro_20x','pro_50x') and row['renewal_status']!='success':return
        if getattr(self.api,'_ready',True) is False:self.api.probe()
        usage=self._data(self.api.card_usage(row['card_id']))
        if usage.get('busy') is not False:raise PoolError('card_capacity_unavailable')
        card=self._data(self.api.card_balance(row['card_id']));balance=cents(card.get('available_amount'))
        if card.get('id')!=row['card_id'] or card.get('product_code')!='XL537872' or card.get('status')!='ACTIVE' or card.get('balance_stale') is not False:raise PoolError('card_balance_unverified')
        if previous:
            if previous['state'] in ('sending','pending','uncertain'):
                data=self._data(self.api.refund_ledger(row['card_id']));items=data.get('list',[])
                match=[x for x in items if x.get('type')=='refund' and x.get('ref_id')==row['card_id'] and type(x.get('id')) is int and x['id']>previous['ledger_after'] and cents(x.get('amount'))==previous['amount_minor']]
                if len(match)==1 and balance<=previous['keep_minor']+10:
                    with self.connect() as c:c.execute("UPDATE zovo_card_returns SET state='confirmed' WHERE source_id=?",(source,))
            return
        keep=max(1,cents(card.get('refund_keep_min') or 0))
        if keep>11:raise PoolError('refund_floor_over_limit')
        if row['baseline_balance_minor'] is None:raise PoolError('cost_baseline_missing')
        from zovocard_settled_cost import match_charge
        status, body = self.api.card_transactions(row['card_id'], 1)
        if status != 200 or body.get('code') != 0 or not isinstance(body.get('data'), list):
            raise PoolError('settlement_requires_reconciliation')
        transaction, charge = match_charge(body['data'], row, self.policy['transaction_timezone'])
        if not 0<charge<=self.policy['max_wallet_debit_usd_minor']:raise PoolError('actual_cost_unverified')
        with self.connect() as c:
            issue=c.execute('SELECT open_fee_minor FROM zovo_managed_cards WHERE source_id=?',(source,)).fetchone();opening=issue[0] if issue else 0
            total=charge+int(row['fee_usd'] or 0)+opening
            if total>self.policy['max_wallet_debit_usd_minor']:raise PoolError('actual_cost_unverified')
            c.execute('CREATE TABLE IF NOT EXISTS zovo_cost_transaction_proofs(source_id TEXT PRIMARY KEY,transaction_id TEXT UNIQUE NOT NULL,charge_minor INTEGER NOT NULL)')
            prior = c.execute('SELECT transaction_id FROM zovo_cost_transaction_proofs WHERE source_id=?', (source,)).fetchone()
            if prior and prior[0] != transaction:raise PoolError('settlement_identity_mismatch')
            c.execute('INSERT INTO zovo_cost_transaction_proofs VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET charge_minor=excluded.charge_minor', (source,transaction,charge))
            c.execute('INSERT INTO zovo_cost_snapshots VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET card_charge_minor=excluded.card_charge_minor,total_cost_minor=excluded.total_cost_minor', (source,charge,row['fee_usd'],opening,total,balance,self.clock()))
        # Do not return a temporarily overstated available balance.
        balance = min(balance, max(0, row['baseline_balance_minor'] + int(row['funding_minor'] or 0) - charge))
        if balance<=keep+10:return
        ledger=self._data(self.api.refund_ledger(row['card_id']));items=ledger.get('list',[])
        if not isinstance(items,list):raise PoolError('refund_ledger_unverified')
        latest=max([x.get('id',0) for x in items],default=0);request='pulse-return-'+hashlib.sha256(source.encode()).hexdigest()[:42]
        with self.connect() as c:c.execute("INSERT INTO zovo_card_returns VALUES(?,?,?,'sending',?,?,?,?,?)",(source,row['card_id'],request,balance,keep,balance-keep,latest,self.clock()))
        try:
            self.api.writes_enabled=True;status,b=self.api.return_balance(row['card_id'],balance-keep,request)
            state='pending' if status in (200,202) and b.get('code')==0 else 'uncertain'
            with self.connect() as c:c.execute('UPDATE zovo_card_returns SET state=? WHERE source_id=?',(state,source))
        except Exception:
            with self.connect() as c:c.execute("UPDATE zovo_card_returns SET state='uncertain' WHERE source_id=?",(source,))
        finally:self.api.writes_enabled=False

    def frozen_cost(self,source):
        with self.connect() as c:
            r=c.execute('SELECT * FROM zovo_cost_snapshots WHERE source_id=?',(source,)).fetchone()
        return dict(r) if r else None
