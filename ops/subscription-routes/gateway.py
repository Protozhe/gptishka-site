"""Restricted SSH stdin/stdout entry point; no listening socket or shell RPC."""
import json
import sys
import fcntl
from pathlib import Path
from cryptography.fernet import Fernet
from zovocard_direct_transport import DirectHTTPS
from zovocard_direct_worker import Worker, Refused
from zovocard_transport import TransportBlocked

ROOT = Path('/opt/pulse-zovocard')


def main():
    api = None
    try:
        raw = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise Refused('request_too_large')
        request = json.loads(raw)
        if not isinstance(request, dict):
            raise Refused('invalid_request')
        action = request.get('action')
        writes_payment = isinstance(action,str) and (action in ('prepare','submit','resume','retry_declined') or action.endswith(('_prepare','_submit','_resume','_retry_declined')))
        if writes_payment and json.loads((ROOT/'config.json').read_text()).get('enabled') is not True:
            raise Refused('payments_paused')
        route_path=ROOT/'data/codex-primary-route.json'
        if action in {f'credit{size}_{verb}' for size in (250,500,1000) for verb in ('prepare','submit','resume','retry_declined')}:
            if route_path.exists():
                route=json.loads(route_path.read_text())
                if route.get('enabled') is True and route.get('primary')=='aiee' and int(action.split('_')[0][6:]) in route.get('packages',[]):
                    raise Refused('credit_primary_aiee')
        if isinstance(action,str) and action.startswith('claude_'):
            from zovocard_claude_gateway import handle
            config=json.loads((ROOT/'config.json').read_text())
            cipher=Fernet((ROOT/'data/secret.key').read_bytes())
            print(json.dumps(handle(request,ROOT,config,cipher)));return
        if action == 'retry_declined':
            from zovocard_decline_retry import retry_declined
            config = json.loads((ROOT/'config.json').read_text())
            cipher = Fernet((ROOT/'data/secret.key').read_bytes())
            api = DirectHTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker = Worker(str(ROOT/'data/direct.db'), cipher, api, config)
            api.probe()
            result = retry_declined(worker, request['source_id'], request['session'])
            print(json.dumps({'ok': True, 'result': result}));return
        if action not in ('subscription_fallback_claim','credit_usage','credit250_fallback_claim','credit500_fallback_claim','credit1000_fallback_claim','credit1000_receipt','credit1000_prepare','credit1000_submit','credit1000_poll','credit1000_status', 'maintenance', 'health', 'prepare', 'submit', 'poll', 'status','sync_notes','finance_snapshot','credit500_receipt','credit500_resume','credit500_retry_declined','credit500_cdk_poll','credit500_prepare','credit500_submit','credit500_poll','credit500_status','credit250_receipt','credit250_prepare','credit250_submit','credit250_poll','credit250_status','pro5x_prepare','pro5x_submit','pro5x_poll','pro5x_status','pro5x_receipt','pro20x_prepare','pro20x_submit','pro20x_poll','pro20x_status','pro20x_receipt','pro500_prepare','pro500_submit','pro500_poll','pro500_status','pro500_receipt','plus_route','go_prepare','go_submit','go_poll','go_status','go_receipt','siteplus_prepare','siteplus_submit','siteplus_poll','siteplus_status','siteplus_receipt','siteplus_resume','go_resume','credit250_resume','credit1000_resume','pro5x_resume','pro20x_resume','pro500_resume','credit250_retry_declined','credit1000_retry_declined'):
            raise Refused('action_not_allowed')
        config = json.loads((ROOT/'config.json').read_text())
        cipher = Fernet((ROOT/'data/secret.key').read_bytes())
        api = DirectHTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
        worker = Worker(str(ROOT/'data/direct.db'), cipher, api, config)
        if action=='subscription_fallback_claim':
            from zovocard_subscription_fallback_guard import claim
            result=claim(worker,request['source_id'],request['order'],request['session'])
            print(json.dumps({'ok':True,'result':result}));return
        if action=='credit500_cdk_poll':
            if request.get('job_id')!=15111243:raise Refused('order_ineligible')
            from zovocard_transport import HTTPS
            from zovocard_cdk500_provider import Provider
            api.close();api=HTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            api.probe();provider=Provider(str(ROOT/'data/direct.db'),cipher,api)
            data=provider.poll(15111243)
            result=worker.inspect('funpay:2:M1KK28R1') or {}
            result.update(state=data['state'],provider_order_id=data['order_id'],provider_status=data['provider_status'])
            if data.get('order_id'):
                st,body=api._request('GET','/openapi/v1/gpt-direct/cdk-orders/'+data['order_id'],None,owner=True)
                detail=body.get('data') or {};detail=detail.get('order',detail)
                if data['state']=='completed' and (st!=200 or body.get('code')!=0 or detail.get('plan')!='credit500' or detail.get('card_id')!=390131):
                    result.update(state='manual_action',reason='completion_unverified')
                else:
                    result.update(final_amount_minor=detail.get('final_amount_minor'),currency=detail.get('currency'),reason=detail.get('last_error_code'))
            print(json.dumps({'ok':True,'result':result}));return
        if action.startswith('credit500_'):
            from zovocard_credit500 import Credit500HTTPS,Credit500Worker,credit_policy
            api.close()
            api=Credit500HTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=Credit500Worker(str(ROOT/'data/direct.db'),cipher,api,credit_policy(config))
            action=action.removeprefix('credit500_')
        if action.startswith('credit250_'):
            from zovocard_credit250 import Credit250HTTPS,Credit250Worker,credit_policy
            api.close()
            api=Credit250HTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=Credit250Worker(str(ROOT/'data/direct.db'),cipher,api,credit_policy(config))
            action=action.removeprefix('credit250_')
        if action.startswith('siteplus_'):
            from zovocard_siteplus import SitePlusHTTPS,SitePlusWorker,siteplus_policy
            api.close();api=SitePlusHTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=SitePlusWorker(str(ROOT/'data/direct.db'),cipher,api,siteplus_policy(config))
            action=action.removeprefix('siteplus_')
        if action.startswith('go_'):
            from zovocard_go import GoHTTPS,GoWorker,go_policy
            api.close();api=GoHTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=GoWorker(str(ROOT/'data/direct.db'),cipher,api,go_policy(config))
            action=action.removeprefix('go_')
        if action.startswith('pro500_'):
            from zovocard_pro500 import Pro500HTTPS,Pro500Worker,pro500_policy
            api.close();api=Pro500HTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=Pro500Worker(str(ROOT/'data/direct.db'),cipher,api,pro500_policy(config))
            action=action.removeprefix('pro500_')
        if action.startswith('pro20x_'):
            from zovocard_pro20x import Pro20xHTTPS,Pro20xWorker,pro20x_policy
            api.close();api=Pro20xHTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=Pro20xWorker(str(ROOT/'data/direct.db'),cipher,api,pro20x_policy(config))
            action=action.removeprefix('pro20x_')
        if action.startswith('pro5x_'):
            from zovocard_pro5x import Pro5xHTTPS,Pro5xWorker,pro5x_policy
            api.close()
            api=Pro5xHTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=Pro5xWorker(str(ROOT/'data/direct.db'),cipher,api,pro5x_policy(config))
            action=action.removeprefix('pro5x_')
        if action.startswith('credit1000_'):
            from zovocard_credit1000 import Credit1000HTTPS,Credit1000Worker,credit_policy
            api.close()
            api=Credit1000HTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode())
            worker=Credit1000Worker(str(ROOT/'data/direct.db'),cipher,api,credit_policy(config))
            action=action.removeprefix('credit1000_')
        if action in ('poll', 'status', 'receipt') and worker.PLAN in ('plus','credit250','credit500','credit1000'):
            from zovocard_decline_retry import resolve
            request['source_id'] = resolve(worker, request['source_id'])
        if action=='fallback_claim':
            from zovocard_fallback_guard import claim
            result=claim(worker,request['source_id'],request['order'])
        elif action=='credit_usage':
            from curl_cffi import requests
            session=json.loads(request['session']);worker._session(request['session'],session.get('user',{}).get('email'))
            account=str(session.get('account',{}).get('id') or '');token=str(session.get('accessToken') or '')
            if not account or not token:raise Refused('full_session_required')
            response=requests.get('https://chatgpt.com/backend-api/wham/usage',headers={'Authorization':'Bearer '+token,'ChatGPT-Account-Id':account,'Accept':'application/json'},timeout=25,allow_redirects=False,impersonate='chrome')
            data=response.json() if response.status_code==200 else {};credits=data.get('credits') or {}
            result={'http':response.status_code,'plan_type':data.get('plan_type'),'balance':credits.get('balance')}
        elif action == 'plus_route':
            order=request['order'];source=worker._eligible(order);worker._session(request['session'],order.get('email'))
            api.probe();data=worker._data(api.preflight(request['session']))
            result={k:data.get(k) for k in ('currentPlan','subscription_recovery_required','subscription_is_delinquent','subscription_active_until')}
            result.update(source_id=source,attempt_absent=worker.inspect(source) is None)
        elif action == 'health':
            plans = api.probe()
            plus = plans.get('plans', {}).get('plus', {})
            result = {'ready_api': True, 'credit1000_enabled':config.get('credit1000_enabled') is True and plans.get('plans',{}).get('credit1000',{}).get('enabled') is True, 'routing_enabled': config.get('enabled') is True,
                      'plus_enabled': plus.get('enabled') is True,
                      'pro5x_enabled': config.get('pro5x_enabled') is True and plans.get('plans',{}).get('pro_5x',{}).get('enabled') is True,
                      'service_fee_usd_minor': plus.get('serviceFeeUsdMinor'),
                      'card_ids': config.get('card_ids',[config.get('card_id')]),
                      'max_clients_per_card':config.get('max_clients_per_card',5),'max_payments_per_card_day':1,
                      'day_timezone':config.get('day_timezone','Europe/Moscow'),
                      'auto_funding':config.get('auto_funding') is True,
                      'max_wallet_debit_usd_minor':config.get('max_wallet_debit_usd_minor'),
                      'max_cumulative_wallet_debit_usd_minor':config.get('max_cumulative_wallet_debit_usd_minor',2000)}
        elif action=='maintenance':
            api.probe()
            with worker.connect() as con:
                rows=con.execute("SELECT source_id,plan FROM zovo_direct_jobs WHERE state='completed' ORDER BY created_at DESC LIMIT 100").fetchall()
            for row in rows:
                policy=dict(config)
                if row['plan']=='plus' and row['source_id'].startswith(('gptishka:site:','operator:siteplus-test:')):
                    from zovocard_siteplus import siteplus_policy
                    policy=siteplus_policy(config)
                elif row['plan']=='credit250':
                    from zovocard_credit250 import credit_policy
                    policy=credit_policy(config)
                elif row['plan']=='credit1000':
                    from zovocard_credit1000 import credit_policy
                    policy=credit_policy(config)
                elif row['plan']=='credit500':
                    from zovocard_credit500 import credit_policy
                    policy=credit_policy(config)
                elif row['plan']=='go':
                    from zovocard_go import go_policy
                    policy=go_policy(config)
                elif row['plan']=='pro_50x':
                    from zovocard_pro500 import Pro500HTTPS,pro500_policy
                    policy=pro500_policy(config)
                elif row['plan']=='pro_20x':
                    from zovocard_pro20x import Pro20xHTTPS,pro20x_policy
                    policy=pro20x_policy(config)
                elif row['plan']=='pro_5x':
                    from zovocard_pro5x import pro5x_policy
                    policy=pro5x_policy(config)
                maintenance_api=Pro500HTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode()) if row['plan']=='pro_50x' else Pro20xHTTPS(cipher.decrypt((ROOT/'data/api.enc').read_bytes()).decode()) if row['plan']=='pro_20x' else api
                maintenance=Worker(str(ROOT/'data/direct.db'),cipher,maintenance_api,policy)
                try:maintenance._try_return(row['source_id'])
                finally:
                    if maintenance_api is not api:maintenance_api.close()
            with worker.connect() as con:
                result={'returns':dict(con.execute('SELECT state,count(*) FROM zovo_card_returns GROUP BY state').fetchall())}
        elif action=='finance_snapshot':
            wallet=worker._data(api.balance())
            with worker.connect() as con:
                committed=worker.committed_debit(con)
            result={k:wallet.get(k) for k in ('balance','spendable_balance','account_reserve_amount','currency')}
            result.update(local_committed_usd_minor=committed,
                local_limit_usd_minor=config.get('max_cumulative_wallet_debit_usd_minor',2000))
        elif action=='sync_notes':
            with worker.connect() as con:
                pending=con.execute('SELECT source_id FROM zovo_direct_jobs WHERE dispatched=1 AND remark_synced=0 ORDER BY created_at LIMIT 5').fetchall()
            for item in pending:
                worker.sync_remark(item['source_id'])
            with worker.connect() as con:
                remaining=con.execute('SELECT count(*) FROM zovo_direct_jobs WHERE dispatched=1 AND remark_synced=0').fetchone()[0]
            result={'pending_notes':remaining}
        elif action=='receipt' and worker.PLAN in ('plus','go','pro_5x','pro_20x','pro_50x'):
            source=request['source_id'];result=worker.inspect(source)
            with worker.connect() as con:
                identity=con.execute('SELECT plan FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
            snapshot=worker.frozen_cost(source)
            if (not result or result.get('state')!='completed' or result.get('renewal_status')!='success'
                or not identity or identity['plan']!=worker.PLAN or not snapshot
                or not 0<snapshot['total_cost_minor']<=worker.policy['max_wallet_debit_usd_minor']):raise Refused('completion_unverified')
            result.update(plan=worker.PLAN,card_remaining_usd_minor=snapshot['remaining_before_return'],card_charge_usd_minor=snapshot['card_charge_minor'],
                total_cost_usd_minor=snapshot['total_cost_minor'],open_fee_usd_minor=snapshot['open_fee_minor'])
        elif action=='receipt' and worker.PLAN=='credit500':
            source=request['source_id'];result=worker.inspect(source);snapshot=worker.frozen_cost(source)
            with worker.connect() as con:identity=con.execute('SELECT plan FROM zovo_direct_jobs WHERE source_id=?',(source,)).fetchone()
            if (not result or result.get('state')!='completed' or not identity or identity['plan']!='credit500'
                or not snapshot or not 0<snapshot['total_cost_minor']<=worker.policy['max_wallet_debit_usd_minor']):raise Refused('completion_unverified')
            result.update(plan='credit500',card_charge_usd_minor=snapshot['card_charge_minor'],card_remaining_usd_minor=snapshot['remaining_before_return'],total_cost_usd_minor=snapshot['total_cost_minor'],open_fee_usd_minor=snapshot['open_fee_minor'])
        elif action=='receipt':
            source=request['source_id'];result=worker.inspect(source)
            if not result or result.get('state')!='completed':raise Refused('completion_unverified')
            card=worker._data(api.card_balance(result['card_id']))
            if card.get('balance_stale') is not False:raise Refused('card_balance_unverified')
            with worker.connect() as con:
                baseline_table='zovo_credit1000_cost_baseline' if worker.PLAN=='credit1000' else 'zovo_credit250_cost_baseline'
                baseline=con.execute('SELECT * FROM '+baseline_table+' WHERE source_id=?',(source,)).fetchone()
            if not baseline or baseline['card_id']!=result['card_id']:raise Refused('cost_baseline_missing')
            from decimal import Decimal
            remaining=Decimal(str(card['available_amount']))*100
            if not remaining.is_finite() or remaining!=remaining.to_integral_value():raise Refused('card_balance_unverified')
            snapshot=worker.frozen_cost(source)
            charge=snapshot['card_charge_minor'] if snapshot else baseline['balance_minor']+int(result.get('funding_minor') or 0)-int(remaining)
            if not 0<charge<=(4000 if worker.PLAN=='credit1000' else 1200):raise Refused('actual_cost_unverified')
            total=snapshot['total_cost_minor'] if snapshot else charge+int(result['fee_usd'])
            result.update(card_charge_usd_minor=charge,card_remaining_usd_minor=int(remaining),total_cost_usd_minor=total,open_fee_usd_minor=snapshot['open_fee_minor'] if snapshot else 0)
        elif action=='retry_declined':
            from zovocard_decline_retry import retry_declined
            api.probe();result=retry_declined(worker,request['source_id'],request['session'])
        elif action in ('prepare', 'submit', 'resume'):
            if action=='prepare':
                import re
                note_email=(json.loads(request['session']).get('user') or {}).get('email','').strip()
                if not re.fullmatch(r'[^\s@|;]{1,64}@[^\s@|;]{1,190}',note_email):raise Refused('invalid_note_email')
                identity=request['order'];platform=identity.get('platform');account=str(identity.get('account_id') or '')
                note_source=(account if platform=='playerok' else str(platform)+':'+account)+':'+str(identity.get('order_id') or '')
                with worker.connect() as con:
                    con.execute("CREATE TABLE IF NOT EXISTS zovo_order_note_emails(source_id TEXT PRIMARY KEY,email TEXT NOT NULL)")
                    con.execute('INSERT INTO zovo_order_note_emails VALUES(?,?) ON CONFLICT(source_id) DO UPDATE SET email=excluded.email',(note_source,note_email))
            result = getattr(worker, action)(request['order'], request['session'])
        elif action == 'poll':
            result = worker.poll(request['source_id'])
        else:
            result = worker.inspect(request['source_id'])
        if isinstance(result, dict) and result.get('source_id'):
            source = result['source_id']
            snapshot = worker.frozen_cost(source)
            if snapshot:
                result.update(card_charge_usd_minor=snapshot['card_charge_minor'],
                              total_cost_usd_minor=snapshot['total_cost_minor'])
            with worker.connect() as con:
                returned = con.execute('SELECT state,amount_minor,keep_minor FROM zovo_card_returns WHERE source_id=?', (source,)).fetchone()
            if returned:
                result.update(return_state=returned['state'],
                              returned_usd_minor=returned['amount_minor'] if returned['state']=='confirmed' else 0)
                if returned['state']=='confirmed':
                    result['card_remaining_usd_minor']=returned['keep_minor']
        from zovocard_decline_retry import decorate
        result = decorate(worker, result)
        print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))
    except (Refused, TransportBlocked) as error:
        reason = error.reason if isinstance(error, TransportBlocked) else error.args[0]
        print(json.dumps({'ok': False, 'reason': reason}))
    except Exception:
        # Never include exception messages, remote bodies, session or API key.
        print(json.dumps({'ok': False, 'reason': 'internal_error'}))
    finally:
        if api is not None:
            api.close()


if __name__ == '__main__':
    # Serializes funding/check/dispatch across separate SSH processes as well as DB commits.
    with open(ROOT/'data/gateway.lock','a') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'ok':False,'reason':'pool_waiting_for_card'}))
        else:
            main()
