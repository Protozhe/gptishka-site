"""Persistent card rotation, payment limits and journaled funding."""
import hashlib
from zovocard_card_lifecycle import Lifecycle
from datetime import datetime
from decimal import Decimal, ROUND_CEILING
from zoneinfo import ZoneInfo
class PoolError(RuntimeError):
    pass
def cents(value):
    try:
        n = Decimal(str(value))*100
        if not n.is_finite() or n < 0:
            raise ValueError()
        return int(n.to_integral_value(rounding=ROUND_CEILING))
    except Exception:
        raise PoolError('card_balance_unverified') from None
class CardPool(Lifecycle):
    def init_pool(self):
        with self.connect() as con:
            columns={r[1] for r in con.execute('PRAGMA table_info(zovo_direct_jobs)')}
            for name,kind in {'plan':"TEXT DEFAULT 'plus'",'client_hash':'TEXT','reserved_day':'TEXT','dispatched_at':'REAL',
                'funding_state':'TEXT','funding_minor':'INTEGER','card_last_four':'TEXT',
                'remark_synced':'INTEGER DEFAULT 0','final_amount_minor':'INTEGER','currency':'TEXT','buyer_label':'TEXT'}.items():
                if name not in columns:
                    con.execute(f'ALTER TABLE zovo_direct_jobs ADD COLUMN {name} {kind}')
            con.execute('''CREATE TABLE IF NOT EXISTS zovo_card_history(
                provider_order_id TEXT PRIMARY KEY,card_id INTEGER NOT NULL,
                client_key TEXT NOT NULL,paid_at REAL NOT NULL)''')
            con.execute('CREATE TABLE IF NOT EXISTS zovo_pool_cursor(id INTEGER PRIMARY KEY,position INTEGER NOT NULL)')
            con.execute('INSERT OR IGNORE INTO zovo_pool_cursor VALUES(1,0)')
            con.execute('CREATE TABLE IF NOT EXISTS zovo_card_activity(auth_id TEXT PRIMARY KEY,card_id INTEGER NOT NULL,paid_at REAL NOT NULL)')
        self.init_lifecycle()
    def _day(self, timestamp=None):
        return datetime.fromtimestamp(self.clock() if timestamp is None else timestamp,
            ZoneInfo(self.policy.get('day_timezone','Europe/Moscow'))).date().isoformat()
    def refresh_history(self):
        if not self.policy.get('card_ids'):
            return
        cursor=''; found=[]; seen=set()
        for _ in range(100):
            data=self._data(self.api.account_orders(cursor))
            rows=data.get('list')
            if not isinstance(rows,list):
                raise PoolError('history_unverified')
            found.extend(x for x in rows if x.get('status')=='completed' and x.get('product','gpt')=='gpt')
            if data.get('has_more') is False:
                break
            cursor=data.get('next_cursor')
            if not isinstance(cursor,str) or not cursor or cursor in seen:
                raise PoolError('history_unverified')
            seen.add(cursor)
        else:
            raise PoolError('history_unverified')
        with self.connect() as con:
            for item in found:
                card=item.get('card_id'); oid=str(item.get('order_id',''))
                if card not in self.policy['card_ids'] or not oid.isdigit():
                    continue
                try:
                    stamp=datetime.fromisoformat((item.get('completed_at') or item['created_at']).replace('Z','+00:00'))
                    if stamp.tzinfo is None: raise ValueError()
                except Exception:
                    raise PoolError('history_unverified') from None
                local=con.execute('SELECT client_hash FROM zovo_direct_jobs WHERE provider_order_id=?',(oid,)).fetchone()
                client=local[0] if local and local[0] else 'historical:'+oid
                con.execute('''INSERT INTO zovo_card_history VALUES(?,?,?,?)
                    ON CONFLICT(provider_order_id) DO UPDATE SET card_id=excluded.card_id,
                    client_key=excluded.client_key,paid_at=excluded.paid_at''',(oid,card,client,stamp.timestamp()))
        self._retired_card_ids=set()
        if self.policy.get('sync_card_balances') is True:
            synced=self._data(self.api.sync_card_balances(self.policy['card_sync_bin']))
            missing=set(self.policy['card_ids'])-set(synced.get('synced_card_ids',[]))
            for card_id in missing:
                if not self._verified_retired(card_id):raise PoolError('card_activity_unverified')
                self._retired_card_ids.add(card_id)
        if self.policy.get('sync_card_transactions') is True:
            self.refresh_card_activity()
    def _verified_retired(self, card_id):
        # The balance-sync API omits deleted cards. Preserve their financial
        # history while excluding only proven zero-balance, reconciled retirees.
        card=self._data(self.api.card_balance(card_id))
        if card.get('id')!=card_id or card.get('status')!='DELETED' or cents(card.get('available_amount'))!=0:
            return False
        with self.connect() as c:
            if c.execute("SELECT 1 FROM zovo_direct_jobs WHERE card_id=? AND state NOT IN ('completed','terminal_failure','failed_before_dispatch')",(card_id,)).fetchone():return False
            if c.execute("SELECT 1 FROM zovo_direct_jobs WHERE card_id=? AND funding_state IN ('sending','uncertain')",(card_id,)).fetchone():return False
            if c.execute("SELECT 1 FROM zovo_card_returns WHERE card_id=? AND state IN ('sending','pending','uncertain')",(card_id,)).fetchone():return False
            if c.execute("SELECT 1 FROM zovo_card_open_intents WHERE card_id=? AND state<>'confirmed'",(card_id,)).fetchone():return False
        return True

    def refresh_card_activity(self):
        found=[]
        for card in self.policy['card_ids']:
            if card in getattr(self,'_retired_card_ids',set()):continue
            for page in range(1,101):
                status,body=self.api.card_transactions(card,page)
                rows=body.get('data')
                if status!=200 or body.get('code')!=0 or not isinstance(rows,list):
                    raise PoolError('card_activity_unverified')
                for item in rows:
                    if item.get('status')!='COMPLETE' or item.get('type')!='Authorization':continue
                    if cents(item.get('auth_amount'))<=0:continue
                    auth=item.get('auth_id')
                    if not isinstance(auth,str) or not auth or len(auth)>120:raise PoolError('card_activity_unverified')
                    try:
                        paid=datetime.fromisoformat(str(item['auth_time']).replace('Z','+00:00'))
                        if paid.tzinfo is None:paid=paid.replace(tzinfo=ZoneInfo(self.policy['transaction_timezone']))
                    except Exception:raise PoolError('card_activity_unverified') from None
                    found.append((str(card)+':'+auth,card,paid.timestamp()))
                if len(rows)<100:break
            else:raise PoolError('card_activity_unverified')
        with self.connect() as con:
            con.executemany('INSERT OR IGNORE INTO zovo_card_activity VALUES(?,?,?)',found)
    def _select_card(self, con, source, email):
        ids=self.policy.get('card_ids')
        if not ids:
            return self.policy['card_id']
        if len(ids)!=len(set(ids)) or not 1<=len(ids)<=1000 or any(type(x) is not int or x<=0 for x in ids):
            raise PoolError('invalid_card_pool')
        client=hashlib.sha256(email.strip().casefold().encode()).hexdigest()
        day=self._day()
        # Unsent expired reservations can be released. Dispatch/funding uncertainty stays locked.
        con.execute("""UPDATE zovo_direct_jobs SET state='failed_before_dispatch',reason='reservation_expired'
            WHERE dispatched=0 AND state='prepared' AND expires<?
            AND COALESCE(funding_state,'') NOT IN ('sending','uncertain')""",(self.clock(),))
        self._selection_uncertain=False
        start=con.execute('SELECT position FROM zovo_pool_cursor WHERE id=1').fetchone()[0]%len(ids)
        for offset in range(len(ids)):
            index=(start+offset)%len(ids); card=ids[index]
            if card in getattr(self,'_retired_card_ids',set()):continue
            # A Claude card with unconfirmed renewal cancellation must never be
            # funded for a different customer, even after its payment settled.
            if con.execute("SELECT 1 FROM zovo_direct_jobs WHERE card_id=? AND plan IN ('max_5x','max_20x') AND dispatched=1 AND state NOT IN ('terminal_failure','failed_before_dispatch') AND coalesce(renewal_status,'')<>'success' LIMIT 1",(card,)).fetchone():continue
            if con.execute("SELECT 1 FROM zovo_card_returns WHERE card_id=? AND state IN ('sending','pending','uncertain')",(card,)).fetchone():continue
            jobs=con.execute("""SELECT * FROM zovo_direct_jobs WHERE card_id=? AND source_id<>?
                AND (dispatched=1 OR state NOT IN ('failed_before_dispatch','terminal_failure'))""",(card,source)).fetchall()
            if any(x['state'] not in ('completed','terminal_failure','failed_before_dispatch') for x in jobs):
                continue
            history=con.execute('SELECT * FROM zovo_card_history WHERE card_id=?',(card,)).fetchall()
            activity=con.execute('SELECT paid_at FROM zovo_card_activity WHERE card_id=?',(card,)).fetchall()
            clients={x['client_key'] for x in history}|{x['client_hash'] or 'unknown:'+x['source_id'] for x in jobs}
            floor=int(self.policy.get('historical_client_floor',{}).get(str(card),0))
            if self._payment_count(history,jobs,activity,floor)>=self.policy.get('max_clients_per_card',3):
                continue
            # Stricter than requested: at most one dispatch per card per local day, even for same client.
            if any(self._day(x['paid_at'])==day for x in history) or any(
                self._day(x['dispatched_at'] or x['created_at'])==day for x in jobs) or any(self._day(x['paid_at'])==day for x in activity):
                continue
            try:
                self._check_card(card)
            except PoolError as error:
                if error.args[0] not in ('card_capacity_unavailable','card_product_not_allowed','card_not_payable','remark_full'):
                    self._selection_uncertain=True
                continue
            con.execute('UPDATE zovo_pool_cursor SET position=? WHERE id=1',((index+1)%len(ids),))
            return card
        raise PoolError('pool_waiting_for_card')
    @staticmethod
    def _payment_count(history,jobs,activity,floor):
        ids={'provider:'+str(x['provider_order_id']) for x in history}
        for x in jobs:
            ids.add('provider:'+str(x['provider_order_id']) if x['provider_order_id'] else 'source:'+x['source_id'])
        return max(len(ids),len(activity),floor)
    def _check_card(self, card_id, require_funds=False):
        usage=self._data(self.api.card_usage(card_id))
        remaining=usage.get('light',{}).get('remaining')
        if usage.get('card_id')!=card_id or type(usage.get('busy')) is not bool or type(usage.get('cooling')) is not bool or type(remaining) is not int or remaining < -1:
            raise PoolError('card_activity_unverified')
        if usage['busy'] or usage['cooling'] or remaining==0:
            raise PoolError('card_capacity_unavailable')
        card=self._data(self.api.card_balance(card_id))
        if card.get('id')!=card_id or not isinstance(card.get('status'),str) or not isinstance(card.get('product_code'),str):
            raise PoolError('card_activity_unverified')
        blocked=card.get('restricted_merchants')
        allowed_products=self.policy.get('allowed_product_codes')
        if (card.get('google_chatgpt_blocked') is True
                or (allowed_products is not None and card.get('product_code') not in allowed_products)):
            raise PoolError('card_product_not_allowed')
        if (card.get('id')!=card_id or card.get('status')!='ACTIVE' or card.get('channel_payable') is not True
                or card.get('delete_pending_at') or card.get('balance_stale') is True
                or not isinstance(blocked,list) or any('CHATGPT' in str(x).upper() or 'OPENAI' in str(x).upper() for x in blocked)):
            raise PoolError('card_not_payable')
        balance=cents(card.get('available_amount'))
        if require_funds and balance<self.policy['min_card_balance_usd_minor']:
            raise PoolError('card_needs_manual_funding')
        return card,balance
    def _ensure_funding(self, row):
        card_id=row['card_id']; card,balance=self._check_card(card_id)
        target=row['target_balance_minor'] or self.policy['min_card_balance_usd_minor']
        cap=self.policy.get('temporary_balance_caps',{}).get(self.PLAN,self.policy['max_card_balance_usd_minor'])
        if row['funding_state'] in ('sending','uncertain'):
            raise PoolError('funding_requires_reconciliation')
        if balance>cap:
            raise PoolError('funding_over_limit')
        if balance>=target:
            return
        if self.policy.get('auto_funding') is not True:
            raise PoolError('card_needs_manual_funding')
        if row['funding_state']:
            raise PoolError('funding_requires_reconciliation')
        amount=max(target-balance,cents(card.get('min_recharge')))
        if (amount>cap or balance+amount>cap
                or (row['estimated_charge_minor'] or target)+row['fee_usd']>self.policy.get('max_wallet_debit_usd_minor',0)):
            raise PoolError('funding_over_limit')
        # Only products with an explicit zero funding fee are eligible.
        status,body=self.api.products()
        products=body.get('data')
        if status!=200 or body.get('code')!=0 or not isinstance(products,list):
            raise PoolError('funding_fee_unverified')
        product=next((x for x in products if x.get('product_code')==card.get('product_code')),None)
        if not product or product.get('enabled') is not True or cents(product.get('recharge_fee'))!=0:
            raise PoolError('funding_fee_unverified')
        if (product.get('google_chatgpt_blocked') is True or any(
                'CHATGPT' in str(x).upper() or 'OPENAI' in str(x).upper()
                for x in product.get('restricted_merchants',[]))):
            raise PoolError('card_product_not_allowed')
        wallet=self._data(self.api.balance())
        if cents(wallet.get('spendable_balance'))<amount+row['fee_usd']:
            raise PoolError('wallet_insufficient')
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            committed=self.committed_debit(con)
            if committed+amount+row['fee_usd']>self.policy.get('max_cumulative_wallet_debit_usd_minor',2000):
                raise PoolError('key_budget_exhausted')
            changed=con.execute("UPDATE zovo_direct_jobs SET funding_state='sending',funding_minor=? WHERE source_id=? AND funding_state IS NULL AND dispatched=0",(amount,row['source_id']))
            if changed.rowcount!=1:
                raise PoolError('funding_requires_reconciliation')
        try:
            self.api.writes_enabled=True
            status,body=self.api.recharge(card_id,amount,row['request_id']+'-fund')
            if status!=200 or type(body.get('code')) is not int or body['code']!=0:
                raise PoolError('funding_requires_reconciliation')
            if self._check_card(card_id)[1]<target:raise PoolError('funding_requires_reconciliation')
            with self.connect() as con:
                con.execute("UPDATE zovo_direct_jobs SET funding_state='confirmed' WHERE source_id=?",(row['source_id'],))
        except Exception:
            with self.connect() as con:
                con.execute("UPDATE zovo_direct_jobs SET funding_state='uncertain',state='funding_uncertain',reason='funding_requires_reconciliation' WHERE source_id=?",(row['source_id'],))
            raise PoolError('funding_requires_reconciliation') from None
        finally:
            self.api.writes_enabled=False
    def sync_remark(self, source):
        if not self.policy.get('card_ids'):
            return
        with self.connect() as con:
            row=con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
        if not row or row['remark_synced'] or not row['dispatched']:
            return
        try:
            card=self._data(self.api.card_balance(row['card_id']))
            from zovocard_note_text import payment_note,append_note
            old=str(card.get('remark') or '')
            with self.connect() as con:
                con.execute("CREATE TABLE IF NOT EXISTS zovo_order_note_emails(source_id TEXT PRIMARY KEY,email TEXT NOT NULL)")
                emailrow=con.execute('SELECT email FROM zovo_order_note_emails WHERE source_id=?',(source,)).fetchone()
            noted=dict(row);noted['email_label']=emailrow[0] if emailrow else ''
            line=payment_note(noted,source,self._day(row['dispatched_at']))
            try:new=append_note(old,line)
            except ValueError:raise PoolError('remark_full') from None
            if new!=old:
                if len(new)>1200:
                    raise PoolError('remark_full')
                status,body=self.api.remark(row['card_id'],new)
                if status!=200 or body.get('code')!=0:
                    raise PoolError('remark_write_failed')
            with self.connect() as con:
                con.execute('UPDATE zovo_direct_jobs SET remark_synced=1 WHERE source_id=?',(source,))
        except Exception:
            # Reporting failure never triggers another funding or payment request.
            pass
