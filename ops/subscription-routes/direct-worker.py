"""Persistent direct Plus worker. No CDKs, funding, new cards or automatic retry.

Only the authenticated Pulse bridge may supply payment evidence. This worker
checks its exact account/lot/order scope again. Defaults require an explicit
enable time and a funded approved card. Sessions are never stored or returned.
"""
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zovocard_card_pool import CardPool, PoolError


Refused = PoolError


def epoch(value):
    if not isinstance(value, str):
        raise Refused('invalid_time')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed.timestamp()
    except (ValueError, OverflowError):
        raise Refused('invalid_time') from None


class Worker(CardPool):
    PLAN = "plus"
    FLOW = "direct"

    def __init__(self, db_path, cipher, transport, policy, clock=time.time):
        self.db_path, self.cipher, self.api = db_path, cipher, transport
        self.policy, self.clock = policy, clock
        with self.connect() as con:
            con.execute('''CREATE TABLE IF NOT EXISTS zovo_direct_jobs(
                source_id TEXT PRIMARY KEY, job_id INTEGER NOT NULL UNIQUE,
                card_id INTEGER NOT NULL, state TEXT NOT NULL,
                request_id TEXT NOT NULL UNIQUE, session_hash TEXT NOT NULL,
                proof BLOB, expires REAL, quote_php INTEGER, fee_usd INTEGER,
                provider_order_id TEXT UNIQUE, provider_status TEXT,
                renewal_status TEXT, poll_after REAL NOT NULL DEFAULT 0,
                dispatched INTEGER NOT NULL DEFAULT 0, reason TEXT,
                created_at REAL NOT NULL)''')
        self.init_pool()

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.db_path, timeout=20)
        con.row_factory = sqlite3.Row
        try:
            with con:
                yield con
        finally:
            con.close()

    def _assert_no_fallback(self, source):
        from zovocard_fallback_guard import assert_unclaimed
        assert_unclaimed(self,source)

    def inspect(self, source_id):
        with self.connect() as con:
            row = con.execute('''SELECT source_id,job_id,card_id,state,
                provider_order_id,provider_status,renewal_status,reason,
                quote_php,fee_usd,card_last_four,funding_state,funding_minor,
                final_amount_minor,currency,remark_synced FROM zovo_direct_jobs WHERE source_id=?''',
                (source_id,)).fetchone()
        return dict(row) if row else None

    def _set(self, source_id, state, reason=None):
        with self.connect() as con:
            con.execute("UPDATE zovo_direct_jobs SET state=?,reason=? WHERE source_id=? AND state<>'completed'",
                        (state, reason, source_id))

    def _eligible(self, order):
        p = self.policy
        if p.get('enabled') is not True or not p.get('enabled_after'):
            raise Refused('disabled')
        if order.get('primary_route') is True:
            from zovocard_plus_scope import primary_source
            if (order.get('payment_status')!='paid' or order.get('job_status') not in ('waiting_data','ready')
                or order.get('has_prior_dispatch') is not False or order.get('has_external_fulfillment') is not False
                or type(order.get('job_id')) is not int):raise Refused('order_ineligible')
            try:return primary_source(order,p,self.clock())
            except (ValueError,KeyError,TypeError):raise Refused('order_ineligible') from None
        if (str(order.get('account_id')) != '2' or str(order.get('lot_id')) != '78808058'
                or order.get('platform') != 'funpay' or order.get('payment_status') != 'paid'
                or order.get('job_status') not in ('waiting_data', 'ready')
                or order.get('has_prior_dispatch') is not False
                or order.get('has_external_fulfillment') is not False):
            raise Refused('order_ineligible')
        oid = order.get('order_id')
        if (not isinstance(oid, str) or not oid.isascii() or not oid.isalnum()
                or not 4 <= len(oid) <= 40 or type(order.get('job_id')) is not int):
            raise Refused('invalid_order_identity')
        created = epoch(order.get('paid_at'))
        if not epoch(p['enabled_after']) <= created <= self.clock() + 60:
            raise Refused('old_or_future_order')
        if not p.get('card_ids') and (type(p.get('card_id')) is not int or p['card_id'] <= 0):
            raise Refused('card_not_configured')
        return 'funpay:2:' + oid

    @staticmethod
    def _session(raw, email):
        try:
            data = json.loads(raw)
            token = data.get('sessionToken')
            actual_email = data.get('user', {}).get('email', '')
        except (ValueError, TypeError, AttributeError):
            raise Refused('full_session_required') from None
        if not isinstance(token, str) or not token.strip():
            raise Refused('full_session_required')
        if not isinstance(email, str) or not email or actual_email.casefold() != email.casefold():
            raise Refused('session_email_mismatch')
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def _data(response):
        status, body = response
        if status not in (200, 202) or type(body.get('code')) is not int or body['code'] != 0 or not isinstance(body.get('data'), dict):
            raise Refused('provider_rejected')
        return body['data']

    @classmethod
    def _preflight_data(cls, response):
        status, body = response
        if (status in (400, 401, 403, 422) and isinstance(body, dict)
                and body.get('error_code') == 'GPT_SESSION_EXPIRED'):
            raise Refused('gpt_session_expired')
        return cls._data(response)

    def prepare(self, order, full_session):
        if self.policy.get("auto_card_open") is True:
            return self._prepare_managed(order, full_session)
        source = self._eligible(order)
        self._assert_no_fallback(source)
        digest = self._session(full_session, order.get('email'))
        plans = self.api.probe()
        self.refresh_history()
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            previous = con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=? OR job_id=?',
                                   (source, order['job_id'])).fetchone()
            if previous and (previous['source_id'] != source or previous['job_id'] != order['job_id']
                             or previous['dispatched'] or previous['state'] != 'failed_before_dispatch'
                             or previous['funding_state'] in ('sending','uncertain')):
                raise Refused('existing_attempt_inspect_only')
            card_id = self._select_card(con, source, order['email'])
            if con.execute("SELECT 1 FROM zovo_direct_jobs WHERE card_id=? AND state NOT IN ('completed','failed_before_dispatch','terminal_failure')",
                           (card_id,)).fetchone():
                raise Refused('card_has_unresolved_attempt')
            if previous:
                con.execute("UPDATE zovo_direct_jobs SET state='preparing',reason=NULL,proof=NULL,expires=NULL,session_hash=?,card_id=? WHERE source_id=? AND dispatched=0",
                            (digest,card_id,source))
            else:
                con.execute('''INSERT INTO zovo_direct_jobs(source_id,job_id,card_id,
                    state,request_id,session_hash,created_at) VALUES(?,?,?,'preparing',?,?,?)''',
                    (source, order['job_id'], card_id, 'pulse-' + hashlib.sha256(source.encode()).hexdigest()[:48], digest, self.clock()))
            buyer=' '.join(str(order.get('buyer_username') or '').split())[:80]
            con.execute('UPDATE zovo_direct_jobs SET plan=?,client_hash=?,reserved_day=?,buyer_label=? WHERE source_id=?',
                (self.PLAN,hashlib.sha256(order['email'].strip().casefold().encode()).hexdigest(), self._day(),buyer,source))
        try:
            entries = [x for x in plans.get('registry', [])
                       if x.get('product') == 'gpt' and x.get('key') == self.PLAN]
            if len(entries) != 1 or entries[0].get('purchasable') is not True:
                raise Refused('plus_unavailable')
            plan = plans.get('plans', {}).get(entries[0].get('acc_plan_key'))
            if not isinstance(plan, dict) or plan.get('enabled') is not True or plan.get('flow') != self.FLOW:
                raise Refused('plus_unavailable')
            fee = plan.get('serviceFeeUsdMinor')
            if type(fee) is not int or not 0 <= fee <= self.policy['max_fee_usd_minor']:
                raise Refused('service_fee_limit')
            if self.policy.get('card_ids'):
                card,_=self._check_card(card_id,require_funds=self.policy.get('auto_funding') is not True)
                with self.connect() as con:
                    con.execute('UPDATE zovo_direct_jobs SET card_last_four=? WHERE source_id=?',(card['last_four'],source))
            else:
                self._funded(card_id)
            data = self._preflight_data(self.api.preflight(full_session))
            if not self._account_allowed(data):
                raise Refused('account_not_free')
            quote = self._quote(data, entries[0], plan)
            amount = quote.get('amountMinor')
            if (quote.get('currency') != 'PHP' or quote.get('minorUnitExponent') != 2
                    or type(amount) is not int or not 0 < amount <= self.policy['max_quote_php_minor']):
                raise Refused('quote_missing_or_over_limit')
            proof = data.get('preflight_token')
            expiry = epoch(data.get('preflight_expires_at'))
            if not isinstance(proof, str) or not proof or expiry <= self.clock() + 30:
                raise Refused('preflight_expired')
            with self.connect() as con:
                con.execute("UPDATE zovo_direct_jobs SET state='prepared',proof=?,expires=?,quote_php=?,fee_usd=? WHERE source_id=?",
                            (self.cipher.encrypt(proof.encode()), expiry, amount, fee, source))
        except Exception as e:
            self._set(source, 'failed_before_dispatch', e.args[0] if isinstance(e, Refused) else 'provider_preparation_error')
        return self.inspect(source)

    def _prepare_managed(self, order, full_session):
        source=self._eligible(order);self._assert_no_fallback(source);digest=self._session(full_session,order.get('email'))
        plans=self.api.probe();self.refresh_history()
        with self.connect() as con:
            previous=con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=? OR job_id=?',(source,order['job_id'])).fetchone()
        if previous and (previous['source_id']!=source or previous['job_id']!=order['job_id'] or previous['dispatched'] or previous['state']!='failed_before_dispatch' or previous['funding_state'] is not None):
            raise Refused('existing_attempt_inspect_only')
        entries=[x for x in plans.get('registry',[]) if x.get('product')=='gpt' and x.get('key')==self.PLAN]
        if len(entries)!=1 or entries[0].get('purchasable') is not True:raise Refused('plus_unavailable')
        plan=plans.get('plans',{}).get(entries[0].get('acc_plan_key'))
        if not isinstance(plan,dict) or plan.get('enabled') is not True or plan.get('flow')!=self.FLOW:raise Refused('plus_unavailable')
        fee=plan.get('serviceFeeUsdMinor')
        if type(fee) is not int or not 0<=fee<=self.policy['max_fee_usd_minor']:raise Refused('service_fee_limit')
        data=self._preflight_data(self.api.preflight(full_session))
        if not self._account_allowed(data):raise Refused('account_not_free')
        quote=self._quote(data,entries[0],plan);amount=quote.get('amountMinor')
        if quote.get('currency')!='PHP' or quote.get('minorUnitExponent')!=2 or type(amount) is not int or not 0<amount<=self.policy['max_quote_php_minor']:raise Refused('quote_missing_or_over_limit')
        proof=data.get('preflight_token');expiry=epoch(data.get('preflight_expires_at'))
        if not isinstance(proof,str) or not proof or expiry<=self.clock()+30:raise Refused('preflight_expired')
        estimate,target=self.funding_quote(quote,plan)
        if estimate+fee>self.policy['max_wallet_debit_usd_minor']:raise Refused('funding_over_limit')
        with self.connect() as con:
            opening=con.execute('SELECT state FROM zovo_card_open_intents WHERE source_id=?',(source,)).fetchone()
        if opening and opening['state']!='confirmed':
            self._open_for_order(source,target,fee,estimate)
        try:
            with self.connect() as con:
                con.execute('BEGIN IMMEDIATE');card_id=self._select_card(con,source,order['email'])
        except Refused as error:
            if error.args[0]!='pool_waiting_for_card':raise
            if getattr(self,'_selection_uncertain',False):raise Refused('card_activity_unverified')
            card_id=self._open_for_order(source,target,fee,estimate)
        card,balance=self._check_card(card_id)
        if balance<target:
            from zovocard_card_pool import cents
            needed=max(target-balance,cents(card.get('min_recharge')))
            cap=self.policy.get('temporary_balance_caps',{}).get(self.PLAN,self.policy['max_card_balance_usd_minor'])
            if balance+needed>cap:raise Refused('funding_over_limit')
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            if con.execute("SELECT 1 FROM zovo_direct_jobs WHERE card_id=? AND source_id<>? AND state NOT IN ('completed','failed_before_dispatch','terminal_failure')",(card_id,source)).fetchone():raise Refused('card_has_unresolved_attempt')
            if previous:
                con.execute("UPDATE zovo_direct_jobs SET state='prepared',reason=NULL,session_hash=?,card_id=?,proof=?,expires=?,quote_php=?,fee_usd=?,target_balance_minor=?,estimated_charge_minor=?,baseline_balance_minor=?,funding_state=NULL,funding_minor=NULL WHERE source_id=? AND dispatched=0",(digest,card_id,self.cipher.encrypt(proof.encode()),expiry,amount,fee,target,estimate,balance,source))
            else:
                con.execute("INSERT INTO zovo_direct_jobs(source_id,job_id,card_id,state,request_id,session_hash,proof,expires,quote_php,fee_usd,target_balance_minor,estimated_charge_minor,baseline_balance_minor,created_at) VALUES(?,?,?,'prepared',?,?,?,?,?,?,?,?,?,?)",(source,order['job_id'],card_id,'pulse-'+hashlib.sha256(source.encode()).hexdigest()[:48],digest,self.cipher.encrypt(proof.encode()),expiry,amount,fee,target,estimate,balance,self.clock()))
            con.execute('UPDATE zovo_direct_jobs SET plan=?,client_hash=?,reserved_day=?,buyer_label=?,card_last_four=? WHERE source_id=?',(self.PLAN,hashlib.sha256(order['email'].strip().casefold().encode()).hexdigest(),self._day(),' '.join(str(order.get('buyer_username') or '').split())[:80],card['last_four'],source))
        return self.inspect(source)

    def _try_return(self,source):
        try:self.ensure_surplus_return(source)
        except Exception as error:
            reason=error.args[0] if isinstance(error,Refused) else 'return_requires_reconciliation'
            with self.connect() as c:
                c.execute('CREATE TABLE IF NOT EXISTS zovo_lifecycle_events(source_id TEXT PRIMARY KEY,reason TEXT,updated_at REAL)')
                c.execute('INSERT INTO zovo_lifecycle_events VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET reason=excluded.reason,updated_at=excluded.updated_at',(source,reason,self.clock()))

    def _account_allowed(self, data):
        return data.get('currentPlan') == 'free' and data.get('subscription_recovery_required') is not True

    def _quote(self, data, entry, plan):
        return data.get('quotes', {}).get(self.PLAN, {})

    def _funded(self, card_id):
        usage = self._data(self.api.card_usage(card_id))
        remaining = usage.get('light', {}).get('remaining')
        if (usage.get('card_id') != card_id or usage.get('busy') is not False
                or usage.get('cooling') is not False or type(remaining) is not int
                or remaining == 0 or remaining < -1):
            raise Refused('card_capacity_unavailable')
        card = self._data(self.api.card_balance(card_id))
        if card.get('id') != card_id or card.get('status') != 'ACTIVE' or card.get('channel_payable') is not True:
            raise Refused('card_not_payable')
        if card.get('delete_pending_at'):
            raise Refused('card_not_payable')
        try:
            balance = Decimal(str(card.get('available_amount'))) * 100
            if not balance.is_finite() or balance < self.policy['min_card_balance_usd_minor']:
                raise Refused('card_needs_manual_funding')
        except (InvalidOperation, TypeError, ValueError):
            raise Refused('card_balance_unverified') from None

    def resume(self,order,full_session):
        # Called only inside gateway.lock. A local dispatch claim is not proof
        # of a provider dispatch: the gateway may have rejected it as busy.
        source=self._eligible(order)
        self._assert_no_fallback(source)
        digest=self._session(full_session,order.get('email'))
        with self.connect() as con:
            row=con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
        if not row or row['job_id']!=order['job_id'] or row['plan']!=self.PLAN:
            raise Refused('existing_attempt_inspect_only')
        if row['dispatched'] or row['provider_order_id']:
            return self.poll(source)
        retryable=row['state']=='failed_before_dispatch' and row['reason'] in (
            'preparation_expired','pool_waiting_for_card','history_unverified',
            'card_activity_unverified','provider_preparation_error','wallet_insufficient')
        if (row['state']!='prepared' and not retryable) or row['funding_state'] is not None:
            raise Refused('existing_attempt_inspect_only')
        changed_session=row['session_hash']!=digest
        if changed_session and row['client_hash']!=hashlib.sha256(str(order.get('email') or '').strip().casefold().encode()).hexdigest():
            raise Refused('session_email_mismatch')
        if changed_session or retryable or row['expires']<=self.clock()+30:
            # Rebuild expired preflight evidence through the existing managed
            # preparation journal, also after a same-client credential refresh.
            # Fresh authenticated preflight/account/price checks are mandatory;
            # preserve source, job and client_request_id throughout.
            if not retryable:
                with self.connect() as con:
                    changed=con.execute("UPDATE zovo_direct_jobs SET state='failed_before_dispatch',reason='preparation_expired' WHERE source_id=? AND state='prepared' AND dispatched=0 AND funding_state IS NULL AND provider_order_id IS NULL",(source,))
                    if changed.rowcount!=1:raise Refused('existing_attempt_inspect_only')
            prepared=self.prepare(order,full_session)
            if prepared.get('state')!='prepared':return prepared
        return self.submit(order,full_session)

    def submit(self, order, full_session):
        source = self._eligible(order)
        self._assert_no_fallback(source)
        digest = self._session(full_session, order.get('email'))
        with self.connect() as con:
            row = con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?', (source,)).fetchone()
        if not row or row['state'] != 'prepared' or row['session_hash'] != digest:
            raise Refused('attempt_not_prepared')
        if row['expires'] <= self.clock() + 10 or row['card_id'] not in self.policy.get('card_ids',[self.policy.get('card_id')]):
            raise Refused('preparation_expired_or_card_changed')
        plans = self.api.probe()
        current = plans.get('plans', {}).get(self.PLAN, {})
        if current.get('enabled') is not True or current.get('serviceFeeUsdMinor') != row['fee_usd']:
            raise Refused('pricing_changed_prepare_again_manually')
        if self.policy.get('card_ids'):
            self.refresh_history()
            with self.connect() as con:
                historical=con.execute('SELECT * FROM zovo_card_history WHERE card_id=?',(row['card_id'],)).fetchall()
                activity=con.execute('SELECT paid_at FROM zovo_card_activity WHERE card_id=?',(row['card_id'],)).fetchall()
            with self.connect() as con:
                local_jobs=con.execute("SELECT * FROM zovo_direct_jobs WHERE card_id=? AND source_id<>? AND (dispatched=1 OR state NOT IN ('failed_before_dispatch','terminal_failure'))",(row['card_id'],source)).fetchall()
            keys={x['client_key'] for x in historical}
            floor=int(self.policy.get('historical_client_floor',{}).get(str(row['card_id']),0))
            if (self._payment_count(historical,local_jobs,activity,floor)>=self.policy.get('max_clients_per_card',3)
                    or any(self._day(x['paid_at'])==self._day() for x in historical)
                    or any(self._day(x['paid_at'])==self._day() for x in activity)
                    or any(self._day(x['dispatched_at'] or x['created_at'])==self._day() for x in local_jobs)):
                self._set(source,'failed_before_dispatch','pool_waiting_for_card')
                return self.inspect(source)
            try:
                self._ensure_funding(row)
            except Refused as error:
                if self.inspect(source)['funding_state'] not in ('sending','uncertain'):
                    self._set(source,'failed_before_dispatch',error.args[0])
                return self.inspect(source)
        else:
            self._funded(row['card_id'])
        budget_blocked=False
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            if self.policy.get('card_ids'):
                committed=self.committed_debit(con)
                if committed+row['fee_usd']>self.policy.get('max_cumulative_wallet_debit_usd_minor',2000):
                    con.execute("UPDATE zovo_direct_jobs SET state='failed_before_dispatch',reason='key_budget_exhausted' WHERE source_id=?",(source,))
                    budget_blocked=True
            if not budget_blocked:
                claimed = con.execute("UPDATE zovo_direct_jobs SET state='dispatching',dispatched=1,dispatched_at=? WHERE source_id=? AND state='prepared' AND dispatched=0", (self.clock(),source))
                if claimed.rowcount != 1:
                    raise Refused('already_dispatched')
        if budget_blocked:
            return self.inspect(source)
        try:
            # No automatic retry, including after process restart or timeout.
            self.api.writes_enabled = True
            data = self._data(self.api.create_order(full_session=full_session,
                preflight_token=self.cipher.decrypt(row['proof']).decode(),
                request_id=row['request_id'], card_id=row['card_id']))
            self._record(source, data.get('order', data), final=False)
        except Exception:
            self._set(source, 'uncertain', 'dispatch_requires_reconciliation')
        finally:
            self.api.writes_enabled = False
        self.sync_remark(source)
        return self.inspect(source)

    def poll(self, source):
        self._try_return(source)
        self.sync_remark(source)
        with self.connect() as con:
            row = con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?', (source,)).fetchone()
            if not row or not row['dispatched'] or row['state'] in ('completed', 'terminal_failure'):
                return self.inspect(source)
            if not row['provider_order_id']:
                self._set(source, 'uncertain', 'order_id_unknown_manual_reconciliation')
                return self.inspect(source)
            if row['poll_after'] > self.clock():
                return self.inspect(source)
            claimed = con.execute('UPDATE zovo_direct_jobs SET poll_after=? WHERE source_id=? AND poll_after<=?',
                                  (self.clock()+30, source, self.clock()))
            if claimed.rowcount != 1:
                return self.inspect(source)
        try:
            data = self._data(self.api.order(row['provider_order_id']))
            self._record(source, data.get('order', data), final=True)
        except Exception:
            pass
        self._try_return(source)
        self.sync_remark(source)
        return self.inspect(source)

    def _record(self, source, order, *, final):
        oid = order.get('id') or order.get('order_id')
        if type(oid) not in (int, str) or not str(oid).isdigit() or int(oid) <= 0:
            raise Refused('missing_order_id')
        status = order.get('status')
        pending = ('queued','awaiting_card','funding_pending','dispatching','running',
                   'requires_action','pending','plus_paid','review')
        if status not in (*pending, 'completed', 'declined', 'failed_precharge', 'cancelled'):
            raise Refused('unknown_order_status')
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?', (source,)).fetchone()
            if row['state'] == 'completed':
                return
            if row['provider_order_id'] and row['provider_order_id'] != str(oid):
                raise Refused('order_identity_changed')
            if order.get('card_id') not in (None, 0, row['card_id']):
                raise Refused('card_identity_changed')
            state = 'processing'
            renewal = order.get('renewal_status')
            if renewal not in ('success','pending','retrying','warning','manual_required','not_requested'):
                renewal = None
            if final and status == 'completed':
                if (order.get('plan') != self.PLAN or order.get('stage') not in ('completed','done')
                        or order.get('card_id') != row['card_id']):
                    raise Refused('completion_unverified')
                state = 'completed' if self.PLAN != 'plus' or renewal == 'success' else 'activation_done_renewal_unverified'
            elif status in ('declined','failed_precharge','cancelled'):
                state = 'terminal_failure'
            elif status == 'review':
                state = 'manual_review'
            # Preserve only a known, non-sensitive provider error code.
            reason = order.get('last_error_code') if status == 'failed_precharge' and order.get('last_error_code') in ('checkout_pricing_unavailable','checkout_session_required','funding_authorization_exceeded') else None
            con.execute('''UPDATE zovo_direct_jobs SET state=?,provider_order_id=?,
                provider_status=?,renewal_status=?,reason=?,remark_synced=0 WHERE source_id=?''',
                (state, str(oid), status, renewal, reason, source))
            amount=order.get('final_amount_minor')
            if type(amount) is int and amount>0 and order.get('currency') in ('PHP','USD'):
                con.execute('UPDATE zovo_direct_jobs SET final_amount_minor=?,currency=? WHERE source_id=?',(amount,order['currency'],source))
