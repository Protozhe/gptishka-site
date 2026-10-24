"""Called under the existing gateway lock through the restricted SSH identity."""
import re,json
from zovocard_claude import ClaudeHTTPS,ClaudeWorker,TIERS
from zovocard_direct_worker import Refused

def handle(req,root,config,cipher):
    action=req.get('action','').removeprefix('claude_');slug=req.get('product_slug')
    if slug not in TIERS or action not in ('status','prepare','submit','poll','receipt'):raise Refused('action_not_allowed')
    if config.get('enabled') is not True or (config.get('claude_site') or {}).get('enabled') is not True:raise Refused('disabled')
    budget=req.get('cost_budget_usd_minor')
    if type(budget) is not int or not 0<budget<=50000:raise Refused('finance_data_unverified')
    api=ClaudeHTTPS(cipher.decrypt((root/'data/api.enc').read_bytes()).decode(),TIERS[slug][0])
    try:
        worker=ClaudeWorker(str(root/'data/direct.db'),cipher,api,config,slug,budget)
        source=req.get('source_id') or ('gptishka:site:'+str((req.get('order') or {}).get('order_id') or ''))
        if not re.fullmatch(r'gptishka:site:[a-z0-9]{20,40}',source):raise Refused('invalid_order_identity')
        current=worker.inspect(source)
        if current:
            with worker.connect() as c:r=c.execute('SELECT plan,created_at FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
            from zovocard_direct_worker import epoch
            if r['plan']!=worker.PLAN or r['created_at']<epoch(config['claude_site']['enabled_after']):raise Refused('order_ineligible')
        if action in ('prepare','submit'):
            if req.get('order',{}).get('product_slug')!=slug or worker._eligible(req['order'])!=source:raise Refused('order_ineligible')
            result=(worker.resume_prepared if action=='submit' else worker.prepare)(req['order'],req['session'])
        elif action=='status':
            with worker.connect() as c:opening=c.execute('SELECT state FROM zovo_card_open_intents WHERE source_id=?',(source,)).fetchone()
            result=current or {'state':'absent','attempt_absent':True,'opening_absent':opening is None}
        else:
            if current and current['state'] in ('uncertain','dispatching') and not current.get('provider_order_id'):
                # Recover a lost POST reply using its existing request id. Never POST again.
                with worker.connect() as c:r=c.execute('SELECT request_id FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
                matches=[]
                for page in range(1,6):
                    d=worker._data(api._owner('GET',api.PREFIX+'/orders?page_size=100&page='+str(page)));rows=d.get('list')
                    if not isinstance(rows,list):raise Refused('history_unverified')
                    matches.extend(x for x in rows if x.get('client_request_id')==r['request_id'])
                    if len(rows)<100:break
                if len(matches)==1:worker._record(source,matches[0],final=False)
                elif len(matches)>1:raise Refused('order_identity_changed')
            result=worker.poll(source)
        if result and result.get('state')=='failed_before_dispatch':
            with worker.connect() as c:
                row=c.execute('SELECT * FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
                opening=c.execute('SELECT state FROM zovo_card_open_intents WHERE source_id=?',(source,)).fetchone()
            # Only an authoritative, unfunded and undispatched local attempt can prepare again.
            result['can_resume_prepare']=bool(row and not row['dispatched'] and not row['provider_order_id'] and row['funding_state'] is None and (not opening or opening['state']=='confirmed') and row['reason'] in ('preparation_expired','pool_waiting_for_card','history_unverified','card_activity_unverified','provider_preparation_error','wallet_balance_insufficient','insufficient_wallet_balance'))
        if result and result.get('state')=='completed':
            cost=worker.frozen_cost(source)
            if cost:result.update(total_cost_usd_minor=cost['total_cost_minor'],card_charge_usd_minor=cost['card_charge_minor'],open_fee_usd_minor=cost['open_fee_minor'])
            with worker.connect() as c:ret=c.execute('SELECT state,amount_minor,keep_minor FROM zovo_card_returns WHERE source_id=?',(source,)).fetchone()
            if ret:result.update(return_state=ret['state'],returned_usd_minor=ret['amount_minor'] if ret['state']=='confirmed' else 0,card_remaining_usd_minor=ret['keep_minor'] if ret['state']=='confirmed' else None)
            if cost and not ret:
                from zovocard_card_pool import cents
                card=worker._data(api.card_balance(result['card_id']))
                if card.get('balance_stale') is False and 0<=cents(card.get('available_amount'))<=11:
                    result.update(return_state='not_required',returned_usd_minor=0,card_remaining_usd_minor=cents(card['available_amount']))
            if action=='receipt' and (not cost or result.get('return_state') not in ('confirmed','not_required')):raise Refused('settlement_requires_reconciliation')
        return {'ok':True,'result':result}
    finally:api.close()
