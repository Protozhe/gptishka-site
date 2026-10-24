"""Claude Max only: US/USD, exact registry key, shared journal and limits.
No caller may choose an arbitrary product, card type, URL or spending limit.
"""
import hashlib,json,re,time
from datetime import datetime
from zovocard_direct_worker import Worker,Refused,epoch
from zovocard_direct_transport import DirectHTTPS
from zovocard_card_pool import PoolError

TIERS={'claude-5x-max':('max_5x',12000,800,13800),'claude-20x-max':('max_20x',24000,1000,26650)}
def session(raw):
    try:s=json.loads(raw)
    except Exception:raise Refused('claude_session_required') from None
    if not isinstance(s,dict) or s.get('riskAccepted') is not True or not re.fullmatch(r'sk-ant-sid[0-9]+-[A-Za-z0-9_-]{30,1500}',str(s.get('sessionKey') or '')):raise Refused('claude_session_required')
    return s

class ClaudeHTTPS(DirectHTTPS):
    def __init__(self,key,plan,**kw):super().__init__(key,**kw);self.plan=plan
    def probe(self):
        self._ready=False;status,body=self._owner('GET',self.PREFIX+'/plans?product=claude');data=body.get('data')
        if status!=200 or body.get('code')!=0 or not isinstance(data,dict):raise Refused('probe_not_ready')
        rows=[x for x in data.get('registry',[]) if x.get('product')=='claude' and x.get('key')==self.plan]
        if len(rows)!=1 or rows[0].get('purchasable') is not True:raise Refused('claude_plan_unavailable')
        original=data.get('plans',{}).get(rows[0].get('acc_plan_key'))
        if not isinstance(original,dict) or original.get('enabled') is not True:raise Refused('claude_plan_unavailable')
        # Base submit compares PLAN to plans[PLAN]; retain original keys too.
        self._ready=True;return {**data,'plans':{**data['plans'],self.plan:original}}
    def _validate_session(self,raw):session(raw)
    def preflight(self,raw):
        if not self._ready:raise Refused('probe_not_ready')
        return self._owner('POST',self.PREFIX+'/preflight',{'product':'claude','plan':self.plan,'payment_country':'US','payment_currency':'USD','credential':{'mode':'session','session':session(raw)['sessionKey']}})
    def create_order(self,*,full_session,preflight_token,request_id,card_id):
        if not self.writes_enabled or not self._ready or type(card_id) is not int or card_id<=0 or not re.fullmatch(r'pulse-[a-f0-9]{48}',request_id):raise Refused('invalid_direct_order')
        return self._request('POST',self.PREFIX+'/orders',{'product':'claude','plan':self.plan,'payment_country':'US','payment_currency':'USD','credential':{'mode':'session','session':session(full_session)['sessionKey']},'card_id':card_id,'client_request_id':request_id,'no_auto_card_switch':True},owner=True,idempotency_key=request_id)
    def card_usage(self,card_id):
        if type(card_id) is not int or card_id<=0:raise Refused('invalid_card_id')
        return self._owner('GET',self.PREFIX+'/cards/'+str(card_id)+'/usage?product=claude')
    def recharge(self,card_id,amount_minor,request_id):
        if not self.writes_enabled or not self._ready or type(card_id) is not int or card_id<=0 or type(amount_minor) is not int or not 0<amount_minor<=25500:raise Refused('invalid_funding')
        return self._request('POST','/openapi/v1/cards/recharge',{'card_id':card_id,'amount':amount_minor/100},owner=True,idempotency_key=request_id)
    def open_card(self,product,initial_minor,request_id,remark):
        if not self.writes_enabled or not self._ready or product!='XL537872' or type(initial_minor) is not int or not 1000<=initial_minor<=25500:raise Refused('invalid_card_open')
        st,b=self._request('POST','/openapi/v1/cards/open',{'product_code':product,'first_name':'GPTishka','last_name':'Operations','init_amount':initial_minor/100,'remark':remark},owner=True,idempotency_key=request_id)
        d=b.get('data') or {};return st,{'code':b.get('code'),'data':{k:d.get(k) for k in ('id','status','product_code','issuer','remark')}}
    def return_balance(self,card_id,amount_minor,request_id):
        if not self.writes_enabled or not self._ready or type(card_id) is not int or card_id<=0 or type(amount_minor) is not int or not 0<amount_minor<=25500:raise Refused('invalid_card_refund')
        return self._request('POST','/openapi/v1/cards/refund',{'card_id':card_id,'amount':amount_minor/100},owner=True,idempotency_key=request_id)

class ClaudeWorker(Worker):
    FLOW='direct'
    def __init__(self,db,cipher,api,policy,slug,budget):
        plan,limit,fee,cap=TIERS[slug];self.PLAN=plan;self.slug=slug
        p={**policy,'max_clients_per_card':5,'max_quote_php_minor':limit,'max_fee_usd_minor':fee,'min_card_balance_usd_minor':limit,'max_card_balance_usd_minor':25500,'max_funding_usd_minor':25500,'max_wallet_debit_usd_minor':min(cap,budget)}
        super().__init__(db,cipher,api,p)
    def _eligible(self,o):
        cfg=self.policy.get('claude_site') or {};oid=o.get('order_id')
        if (self.policy.get('enabled') is not True or cfg.get('enabled') is not True or o.get('platform')!='gptishka' or o.get('account_id')!='site' or o.get('product_slug')!=self.slug or o.get('product_id')!=(cfg.get('product_ids') or {}).get(self.slug) or o.get('quantity')!=1 or o.get('payment_status')!='paid' or o.get('has_prior_dispatch') is not False or o.get('has_external_fulfillment') is not False or type(o.get('job_id')) is not int or not re.fullmatch(r'[a-z0-9]{20,40}',str(oid))):raise Refused('order_ineligible')
        for k in ('created_at','paid_at'):
            if not epoch(cfg.get('enabled_after'))<=epoch(o.get(k))<=self.clock()+60:raise Refused('old_or_future_order')
        return 'gptishka:site:'+oid
    @staticmethod
    def _session(raw,email):
        session(raw);return hashlib.sha256(raw.encode()).hexdigest()
    def _account_allowed(self,d):
        return bool(d) and not d.get('blocking_reason') and d.get('can_purchase') is not False and d.get('eligible') is not False and d.get('kyc_required') is not True
    def _quote(self,d,e,p):
        if e.get('checkout_currency')!='USD' or type(e.get('checkout_amount_minor')) is not int:raise Refused('quote_missing_or_over_limit')
        q=(d.get('quotes') or {}).get(self.PLAN)
        if q is not None and (not isinstance(q,dict) or q.get('currency')!='USD' or q.get('available') is False or q.get('purchasable') is False):raise Refused('quote_missing_or_over_limit')
        return q if isinstance(q,dict) else {'currency':'USD','minorUnitExponent':2,'amountMinor':e['checkout_amount_minor']}
    def _check_card(self,card_id,require_funds=False):
        card,balance=super()._check_card(card_id,require_funds)
        if any(any(x in str(v).upper() for x in ('CLAUDE','ANTHROPIC')) for v in card.get('restricted_merchants',[])):raise Refused('card_product_not_allowed')
        return card,balance
    def _record(self,source,order,*,final):
        if order.get('product')!='claude' or order.get('plan') not in (self.PLAN,'claude_'+self.PLAN):raise Refused('completion_unverified')
        return super()._record(source,{**order,'plan':self.PLAN},final=final)
    def submit(self,order,raw):
        source=self._eligible(order)
        with self.connect() as c:r=c.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
        if not r or r['plan']!=self.PLAN or (r['target_balance_minor'] or 0)+(r['fee_usd'] or 0)+150>self.policy['max_wallet_debit_usd_minor']:raise Refused('funding_over_limit')
        return super().submit(order,raw)

    def refresh_history(self):
        if not self.policy.get('card_ids'):
            return
        cursor=''; found=[]; seen=set()
        for _ in range(100):
            data=self._data(self.api.account_orders(cursor))
            rows=data.get('list')
            if not isinstance(rows,list):
                raise PoolError('history_unverified')
            found.extend(x for x in rows if x.get('status')=='completed' and x.get('product','gpt') in ('gpt','claude','grok'))
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
    def _prepare_managed(self, order, full_session):
        source=self._eligible(order);self._assert_no_fallback(source);digest=self._session(full_session,order.get('email'))
        plans=self.api.probe();self.refresh_history()
        with self.connect() as con:
            previous=con.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=? OR job_id=?',(source,order['job_id'])).fetchone()
        if previous and (previous['source_id']!=source or previous['job_id']!=order['job_id'] or previous['dispatched'] or previous['state']!='failed_before_dispatch' or previous['funding_state'] is not None):
            raise Refused('existing_attempt_inspect_only')
        entries=[x for x in plans.get('registry',[]) if x.get('product')=='claude' and x.get('key')==self.PLAN]
        if len(entries)!=1 or entries[0].get('purchasable') is not True:raise Refused('plus_unavailable')
        plan=plans.get('plans',{}).get(entries[0].get('acc_plan_key'))
        if not isinstance(plan,dict) or plan.get('enabled') is not True or plan.get('flow')!=self.FLOW:raise Refused('plus_unavailable')
        fee=plan.get('serviceFeeUsdMinor')
        if type(fee) is not int or not 0<=fee<=self.policy['max_fee_usd_minor']:raise Refused('service_fee_limit')
        data=self._preflight_data(self.api.preflight(full_session))
        if not self._account_allowed(data):raise Refused('account_not_free')
        quote=self._quote(data,entries[0],plan);amount=quote.get('amountMinor')
        if quote.get('currency')!='USD' or quote.get('minorUnitExponent')!=2 or type(amount) is not int or not 0<amount<=self.policy['max_quote_php_minor']:raise Refused('quote_missing_or_over_limit')
        # Claude has no provider ticket. This encrypted local preparation binds the verified session.
        proof='claude-local-'+digest;expiry=self.clock()+180
        if not isinstance(proof,str) or not proof or expiry<=self.clock()+30:raise Refused('preflight_expired')
        estimate,target=self.funding_quote(quote,plan)
        if target+fee+150>self.policy['max_wallet_debit_usd_minor']:raise Refused('funding_over_limit')
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
