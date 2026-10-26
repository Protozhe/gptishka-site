"""Read-only order/provider monitoring; writes only its private watch state."""
import json,time,sqlite3,subprocess,sys,hashlib,fcntl
from pathlib import Path
from datetime import datetime
ROOT=Path('/opt/pulse-web');STATE=ROOT/'data/next-chatgpt-watch.json'

def stamp(s):return datetime.fromisoformat(str(s).replace('Z','+00:00')).timestamp()
def save(state):
    p=STATE.with_suffix('.next');p.write_text(json.dumps(state));p.chmod(0o600);p.replace(STATE)

def site_orders(since):
    p=subprocess.run(['node',str(ROOT/'subscription_reserve_site.cjs')],input=json.dumps({'action':'watch','since':since}),text=True,capture_output=True,timeout=55)
    d=json.loads(p.stdout)
    if p.returncode or d.get('error'):raise ValueError('website_monitor_unavailable')
    return d['orders']

def primary(source):
    # A separate read-only SQLite connection: never invoke provider poll/prepare.
    query='''import sqlite3,json
c=sqlite3.connect('file:/opt/pulse-zovocard/data/direct.db?mode=ro',uri=True);c.row_factory=sqlite3.Row
rows=c.execute('SELECT source_id,state,dispatched,provider_order_id FROM zovo_direct_jobs WHERE source_id=? OR source_id LIKE ?',(SOURCE,SOURCE+':%')).fetchall()
snapshots=c.execute('SELECT source_id,card_charge_minor FROM zovo_cost_snapshots WHERE source_id=? OR source_id LIKE ?',(SOURCE,SOURCE+':%')).fetchall()
print(json.dumps({'attempts':[dict(r) for r in rows],'confirmed_card_charges':[dict(r) for r in snapshots if r['card_charge_minor']>0]}))
'''.replace('SOURCE',repr(source))
    command=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/root/.ssh/pulse_zovocard_known_hosts','-o','ConnectTimeout=10','-i','/root/.ssh/playerok_de_ed25519','root@91.108.242.137','/opt/pulse-zovocard/venv/bin/python -']
    p=subprocess.run(command,input=query,text=True,capture_output=True,timeout=45)
    if p.returncode:raise ValueError('primary_monitor_unavailable')
    return json.loads(p.stdout)

def monitor(state):
    from zovocard_pulse_bridge import job_source
    from zovocard_notifications import message,safe_finance,notification_destination,notification_confirmed
    web=site_orders(state['since'])
    c=sqlite3.connect('file:'+str(ROOT/'data/chat-activity.db')+'?mode=ro',uri=True,timeout=10);c.row_factory=sqlite3.Row
    if not state.get('selected'):
        candidates=list(web)
        for j in c.execute("SELECT * FROM codex_jobs WHERE product_type LIKE 'chatgpt_%' AND platform IN ('funpay','playerok') AND created_at>=? AND source_created_at>=? ORDER BY created_at",(state['since'],state['since'])):
            candidates.append({'order_id':j['order_id'],'platform':j['platform'],'account_id':str(j['account_id']),'paid_at':j['source_created_at'],'job_id':j['id']})
        if not candidates:return {'state':'waiting_new_paid_order'}
        state['selected']=min(candidates,key=lambda x:stamp(x['paid_at']));save(state)
    selected=state['selected'];webrow=next((x for x in web if x['order_id']==selected['order_id']),None)
    j=c.execute('SELECT * FROM codex_jobs WHERE order_id=? AND platform=? AND account_id=?',(selected['order_id'],selected['platform'],selected['account_id'])).fetchone()
    result={'order_id':selected['order_id'],'platform':selected['platform'],'expected_bot':'myadminiibot' if selected['platform']=='gptishka' else 'funpaypulseaibot'}
    age=time.time()-stamp(selected['paid_at'])
    if not j:
        if webrow and webrow['activation_status']=='success' and webrow['verification_state']=='success' and webrow.get('native_key_bound'):
            if webrow.get('manual_activation'):return {**result,'state':'needs_attention','reason':'completed_manually'}
            from subscription_reserve_auto import native_notice_id
            event=str(native_notice_id(selected['order_id']))+':completed'
            sent=c.execute('SELECT destination,state FROM subscription_reserve_notices WHERE event_id=?',(event,)).fetchone()
            p=primary('gptishka:site:'+selected['order_id'])
            if p['confirmed_card_charges']:return {**result,'state':'needs_attention','reason':'primary_and_native_key_both_charged'}
            notified=bool(sent and sent['state']=='sent' and sent['destination']==result['expected_bot'])
            if notified and webrow.get('native_attempts',0)>0:return {**result,'state':'completed','channel':'existing_subscription_key','confirmed_card_charges':0,'notification_confirmed':True,'automatic_dispatch_confirmed':True}
            return {**result,'state':'needs_attention' if age>1200 else 'in_progress','reason':'final_bot_notification_not_confirmed'}
        if webrow and not webrow['has_session']:return {**result,'state':'awaiting_customer_session'}
        return {**result,'state':'needs_attention' if age>900 else 'in_progress','reason':'paid_order_not_picked_up'}
    result['job_id']=j['id'];result['job_status']=j['status']
    events=[r[0] for r in c.execute('SELECT event FROM codex_logs WHERE job_id=? ORDER BY id',(j['id'],))]
    reserve=c.execute('SELECT * FROM subscription_reserve_attempts WHERE job_id=?',(j['id'],)).fetchone()
    source=job_source(j);p=primary(source);result['primary_attempts']=len(p['attempts']);result['confirmed_card_charges']=len(p['confirmed_card_charges'])
    if len(p['confirmed_card_charges'])>1:return {**result,'state':'needs_attention','reason':'multiple_confirmed_charges'}
    if reserve and reserve['dispatched'] and p['confirmed_card_charges']:return {**result,'state':'needs_attention','reason':'primary_and_reserve_both_charged'}
    if j['status']=='manual_completed':return {**result,'state':'needs_attention','reason':'completed_manually'}
    done=j['status']=='success' and (bool(j['platform_completed_at']) if j['platform']!='gptishka' else webrow and webrow['activation_status']=='success' and webrow['verification_state']=='success')
    if done:
        if reserve:
            sent=c.execute("SELECT destination,state FROM subscription_reserve_notices WHERE job_id=? AND event_id=?",(j['id'],str(j['id'])+':completed')).fetchone()
            notified=bool(sent and sent['state']=='sent' and sent['destination']==result['expected_bot'])
            automatic='subscription_reserve_dispatch' in events and 'subscription_reserve_completed' in events
            result['channel']='reserve_key'
        elif str(j['key_pool'] or '').startswith('zovocard'):
            f=c.execute('SELECT payload FROM codex_zovocard_finance WHERE job_id=?',(j['id'],)).fetchone()
            signature=hashlib.sha256(message(j,safe_finance(f[0] if f else None),decorated=False).encode()).hexdigest()
            with sqlite3.connect('file:'+str(ROOT/'data/telegram-fallback.db')+'?mode=ro',uri=True) as n:
                r=n.execute('SELECT signature,destination FROM zovocard_notifications WHERE job_id=?',(j['id'],)).fetchone()
                notified=notification_confirmed(n,j['id'],j['platform']) or bool(r and r[0]==signature and r[1]==notification_destination(j['platform']))
            automatic=any(e.startswith('zovocard') and e.endswith('_dispatch') for e in events)
            result['channel']='zovocard'
            if len(p['confirmed_card_charges'])!=1:return {**result,'state':'needs_attention','reason':'successful_charge_proof_missing'}
        else:
            result['channel']='existing_subscription_key'
            return {**result,'state':'needs_attention','reason':'direct_key_route_requires_review'}
        result.update(notification_confirmed=notified,automatic_dispatch_confirmed=automatic)
        if not automatic:return {**result,'state':'needs_attention','reason':'automatic_dispatch_proof_missing'}
        if notified:return {**result,'state':'completed'}
        return {**result,'state':'needs_attention' if age>1200 else 'in_progress','reason':'final_bot_notification_not_confirmed'}
    if j['status'] in ('waiting_data','waiting_token') and not j['note_url'] and not (webrow or {}).get('has_session'):return {**result,'state':'awaiting_customer_session'}
    if j['status'] in ('failed','paused') or reserve and reserve['state']=='review':return {**result,'state':'needs_attention','reason':'activation_failed_or_paused'}
    return {**result,'state':'needs_attention' if age>1800 else 'in_progress','reason':reserve['reason'] if reserve else 'waiting_automatic_processing'}

def run():
    state=json.loads(STATE.read_text())
    try:result=monitor(state)
    except Exception as e:
        result={'state':'monitor_error','reason':str(e) if isinstance(e,ValueError) and str(e).endswith('_unavailable') else type(e).__name__}
    important=result['state'] in ('completed','needs_attention','monitor_error')
    signature=hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()
    recovered=state.get('previous_state')=='monitor_error' and result['state']!='monitor_error'
    result['notify']=bool((important or recovered) and signature!=state.get('reported_signature'))
    if result['notify']:state['reported_signature']=signature
    state['previous_state']=result['state'];state['last_checked_at']=time.time();state['last_result']=result;save(state)
    return result

if __name__=='__main__':
    try:
        with open(ROOT/'data/next-chatgpt-watch.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);result=run();print(json.dumps(result));sys.exit(1 if result['state']=='monitor_error' else 0)
    except BlockingIOError:print(json.dumps({'state':'monitor_busy','notify':False}))
