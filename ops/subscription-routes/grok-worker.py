"""Exact monthly Grok products, shared card journal and unchanged wallet cap."""
import base64,hashlib,json,re,time
from zovocard_claude import ClaudeHTTPS,ClaudeWorker
from zovocard_direct_worker import Worker,Refused,epoch

# Registry keys, maximum checkout cents, maximum fee cents, wallet ceiling.
TIERS={
 'grok-plus-1':('plus_monthly',960,15,1325),
 'grok-premium-1':('premium_monthly',3600,15,3965),
 'grok-super-1':('super_monthly',12000,15,12765),
 'grok-ultra-1':('ultra_monthly',24000,15,25365),
}

def session(raw):
    try:
        value=str(raw or '').strip()
        if value.startswith('{'):value=json.loads(value).get('sso','')
        if not isinstance(value,str) or not 80<=len(value)<=4096 or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',value):raise ValueError()
        header,payload,_=value.split('.')
        h=json.loads(base64.urlsafe_b64decode(header+'='*(-len(header)%4)))
        p=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))
        if h.get('alg')!='HS256' or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',str(p.get('session_id') or ''),re.I):raise ValueError()
        if 'exp' in p and (type(p['exp']) not in (int,float) or p['exp']<=time.time()+60):raise ValueError()
        return value
    except Exception:raise Refused('grok_sso_required') from None

def identity(raw):
    token=session(raw);part=token.split('.')[1]
    sid=json.loads(base64.urlsafe_b64decode(part+'='*(-len(part)%4)))['session_id']
    return 'grok-'+hashlib.sha256(sid.lower().encode()).hexdigest()+'@session.invalid'

class GrokHTTPS(ClaudeHTTPS):
    def __init__(self,key,plan,**kw):
        if plan not in {x[0] for x in TIERS.values()}:raise Refused('grok_plan_unavailable')
        super().__init__(key,plan,**kw)
    def probe(self):
        self._ready=False;st,b=self._owner('GET',self.PREFIX+'/plans?product=grok');d=b.get('data')
        if st!=200 or b.get('code')!=0 or not isinstance(d,dict):raise Refused('probe_not_ready')
        rows=[r for r in d.get('registry',[]) if r.get('product')=='grok' and r.get('key')==self.plan]
        if len(rows)!=1 or rows[0].get('purchasable') is not True or rows[0].get('flow')!='direct' or rows[0].get('is_credit') is not False:raise Refused('grok_plan_unavailable')
        plan=d.get('plans',{}).get(rows[0].get('acc_plan_key'))
        if not isinstance(plan,dict) or plan.get('enabled') is not True or plan.get('flow')!='direct' or plan.get('currency')!='USD':raise Refused('grok_plan_unavailable')
        self._ready=True;return {**d,'plans':{**d['plans'],self.plan:plan}}
    def _validate_session(self,raw):session(raw)
    def preflight(self,raw):
        if not self._ready:raise Refused('probe_not_ready')
        return self._owner('POST',self.PREFIX+'/preflight',{'product':'grok','plan':self.plan,'payment_country':'US','payment_currency':'USD','credential':{'mode':'session','session':session(raw)}})
    def create_order(self,*,full_session,preflight_token,request_id,card_id):
        if not self.writes_enabled or not self._ready or type(card_id) is not int or card_id<=0 or not re.fullmatch(r'pulse-[a-f0-9]{48}',request_id) or not isinstance(preflight_token,str) or not preflight_token:raise Refused('invalid_direct_order')
        token=session(full_session)
        body={'product':'grok','plan':self.plan,'payment_country':'US','payment_currency':'USD','credential':{'mode':'session','session':token},'card_id':card_id,'client_request_id':request_id,'no_auto_card_switch':True}
        if preflight_token.startswith('grok-local-'):
            if preflight_token!='grok-local-'+hashlib.sha256(token.encode()).hexdigest():raise Refused('session_identity_mismatch')
        else:body['preflight_token']=preflight_token
        return self._request('POST',self.PREFIX+'/orders',body,owner=True,idempotency_key=request_id)
    def card_usage(self,card_id):
        if type(card_id) is not int or card_id<=0:raise Refused('invalid_card_id')
        return self._owner('GET',self.PREFIX+'/cards/'+str(card_id)+'/usage?product=grok')

class GrokWorker(ClaudeWorker):
    PRODUCT='grok'
    def __init__(self,db,cipher,api,policy,slug,budget):
        plan,limit,fee,cap=TIERS[slug];self.PLAN=plan;self.slug=slug
        p={**policy,'max_quote_php_minor':limit,'max_fee_usd_minor':fee,'min_card_balance_usd_minor':1000,'max_card_balance_usd_minor':25500,'max_funding_usd_minor':25500,'max_wallet_debit_usd_minor':min(cap,budget)}
        Worker.__init__(self,db,cipher,api,p)
    def _eligible(self,o):
        cfg=self.policy.get('grok_site') or {};oid=o.get('order_id')
        if (self.policy.get('enabled') is not True or cfg.get('enabled') is not True or o.get('platform')!='gptishka' or o.get('account_id')!='site' or o.get('order_source') not in ('site','telegram') or o.get('job_status') not in ('waiting_data','ready') or o.get('product_slug')!=self.slug or o.get('product_id')!=(cfg.get('product_ids') or {}).get(self.slug) or o.get('quantity')!=1 or o.get('payment_status')!='paid' or o.get('has_prior_dispatch') is not False or o.get('has_external_fulfillment') is not False or type(o.get('job_id')) is not int or not re.fullmatch(r'[a-z0-9]{20,40}',str(oid))):raise Refused('order_ineligible')
        for key in ('created_at','paid_at'):
            stamp=epoch(o.get(key))
            if stamp>self.clock()+60 or (stamp<epoch(cfg.get('enabled_after')) and oid not in cfg.get('existing_order_ids',[])):raise Refused('old_or_future_order')
        return 'gptishka:site:'+oid
    @staticmethod
    def _session(raw,email):
        token=session(raw)
        if email!=identity(token):raise Refused('session_identity_mismatch')
        return hashlib.sha256(token.encode()).hexdigest()
    def _account_allowed(self,d):
        # Grok returns an empty currentPlan and nullable subscription flags for
        # a free account. Require its authenticated profile and usable quote.
        return (bool(d) and d.get('credentialMode')=='session' and isinstance(d.get('email'),str) and '@' in d['email'] and not d.get('blocking_reason') and not d.get('quote_error') and d.get('subscription_has_active') is not True and d.get('subscription_recovery_required') is not True and d.get('subscription_is_delinquent') is not True and str(d.get('currentPlan') or '').lower() in ('','free','none'))
    def _preparation_proof(self,d,digest):
        proof=d.get('preflight_token');expires=d.get('preflight_expires_at')
        # Current Grok preflight has no provider ticket (empty token / zero
        # time). Bind the verified session to a short encrypted local intent.
        if not proof:return 'grok-local-'+digest,self.clock()+180
        if isinstance(expires,str):expires=epoch(expires)
        if type(expires) in (int,float) and expires>self.clock()*100:expires/=1000
        if type(expires) not in (int,float) or not isinstance(proof,str) or not proof:raise Refused('preflight_expired')
        if expires>self.clock()+3600:raise Refused('preflight_expired')
        return proof,expires
    def _wallet_overhead(self):
        # The common lifecycle independently checks the actual opening fee and
        # the actual estimated charge against this order's finance budget.
        return self.policy.get('max_open_fee_usd_minor',100)
    def _quote(self,d,e,p):
        q=(d.get('quotes') or {}).get(self.PLAN)
        if not isinstance(q,dict) or q.get('plan')!=self.PLAN or q.get('country')!='US' or q.get('currency')!='USD' or q.get('minorUnitExponent')!=2:raise Refused('quote_missing_or_over_limit')
        return q
    def _check_card(self,card_id,require_funds=False):
        card,balance=Worker._check_card(self,card_id,require_funds)
        if any(any(x in str(v).upper() for x in ('XAI','X.AI','GROK')) for v in card.get('restricted_merchants',[])):raise Refused('card_product_not_allowed')
        return card,balance
    def _record(self,source,order,*,final):
        if order.get('product')!='grok' or order.get('plan') not in (self.PLAN,'grok_'+self.PLAN):raise Refused('completion_unverified')
        if final and order.get('status')=='completed' and (type(order.get('final_amount_minor')) is not int or not 0<order['final_amount_minor']<=self.policy['max_quote_php_minor'] or order.get('currency')!='USD'):raise Refused('completion_unverified')
        return Worker._record(self,source,{**order,'plan':self.PLAN},final=final)
    def submit(self,order,raw):
        # Reuse the common funding/fee/cumulative guards, including the real
        # opening ledger. Never reserve a fictitious Claude opening surcharge.
        return Worker.submit(self,order,raw)
