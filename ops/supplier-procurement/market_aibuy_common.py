"""Exact marketplace contracts; no I/O at import, no customer messages."""
import hashlib,json,re,time
from datetime import datetime,timezone
from decimal import Decimal,ROUND_CEILING

PRICES={0:13400,250:7500,500:14500,1000:27600}
UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',re.I)

def stamp(v):
    d=datetime.fromisoformat(str(v).replace('Z','+00:00'))
    if d.tzinfo is None:raise ValueError('supplier_order_time_unverified')
    return d.timestamp()

def classify(title):
    s=str(title or '').lower()
    if 'codex' in s:
        if 'claude' in s: return None
        values={int(x) for x in re.findall(r'(?<!\d)(250|500|1000|2500)(?!\d)',s)}
        return next(iter(values)) if len(values)==1 and next(iter(values)) in (250,500,1000) else None
    if not re.search(r'\bclaude\s+(?:ai\s+)?pro\b',s):return None
    if re.search(r'\b(max|5x|20x|annual|year)\b|год|верификац',s):return None
    if ('готов' in s or 'ready account' in s) and not ('ваш' in s or 'your' in s):return None
    durations=set()
    for n,unit in re.findall(r'(?<!\d)(\d+)\s*(месяц\w*|мес\.?|months?\b|дн\w*|день|days?\b)',s):
        durations.add(int(n)/30 if unit.startswith(('дн','день','day')) else int(n))
    return 0 if not durations or durations=={1} else None

def product(code):return 'claude-pro' if code==0 else 'codex-'+str(code)
def workflow(code):return 'claude_pro' if code==0 else 'codex_'+str(code)
def pool(code):return 'aibuy_market_'+('claude_pro' if code==0 else 'codex_'+str(code))
def identity(job):return 'm'+hashlib.sha256((str(job['platform'])+'|'+str(job['account_id'])+'|'+str(job['order_id'])).encode()).hexdigest()[:31]

def eligible(job,policy,now=None):
    now=time.time() if now is None else now
    try:
        c=policy['marketplaces'];start=stamp(c['enabledAfter'])
        return (policy.get('enabled') is True and c.get('enabled') is True and start<=now
            and job['platform'] in ('funpay','playerok') and str(job['account_id']) in c['accounts'][job['platform']]
            and stamp(job['created_at'])>=start and stamp(job['source_created_at'])>=start
            and job['auto_submit_allowed']==1 and not job['archived_at']
            and ((job['product_type']=='codex' and job['package'] in (250,500,1000)) or (job['product_type']=='claude_pro' and job['package']==0)))
    except (ValueError,KeyError,TypeError,IndexError):return False

def session(raw,code):
    if code==0:
        if not UUID.fullmatch(raw.strip()):raise ValueError('supplier_claude_uuid_required')
        return raw.strip()
    try:
        s=json.loads(raw);token=s.get('accessToken') or s.get('sessionToken')
        plan=str(s.get('account',{}).get('planType','')).lower().replace('_','').replace('-','')
        if plan not in ('plus','pro','prolite','prolight','pro5x','pro20x','pro25x','pro50x') or not token:raise ValueError()
        if s.get('expires') and stamp(s['expires'])<=time.time()+60:raise ValueError()
        if s.get('accessToken'):
            import base64
            payload=token.split('.')[1];exp=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4))).get('exp')
            if not isinstance(exp,(int,float)) or exp<=time.time()+60:raise ValueError()
        return json.dumps(s,sort_keys=True,separators=(',',':'),ensure_ascii=False)
    except (ValueError,TypeError,KeyError,IndexError):raise ValueError('supplier_session_required') from None

def money(v):
    if isinstance(v,bool) or v is None:raise ValueError('supplier_cost_unconfirmed')
    n=Decimal(str(v))
    if not n.is_finite() or n<0:raise ValueError('supplier_cost_unconfirmed')
    return n

def quote(amount,code,rate_policy,financial,fee_policy,assessor,now=None):
    now=time.time() if now is None else now
    if type(amount) is not int or not 0<amount<=PRICES[code]:raise ValueError('supplier_price_hold')
    age=now-stamp(rate_policy['costCheckedAt']);rate=money(rate_policy['rubPerCny'])
    if rate_policy.get('enabled') is not True or fee_policy.get('enabled') is not True or rate<=0 or age< -60 or age*1000>rate_policy['costMaxAgeMs']:raise ValueError('supplier_cost_unconfirmed')
    cost=(Decimal(amount)*rate/100).quantize(Decimal('.01'),rounding=ROUND_CEILING)
    r=assessor(financial,fee_policy,lambda _: {'id':'aibuy_actual','cost_rub':str(cost)},now=now)
    if r.get('allowed') is not True or money(r.get('profit_bound_rub'))<money(rate_policy.get('minimumProfitRub',0)):raise ValueError('supplier_margin_hold')
    return str(cost)
