"""Private marketplace stock waits. No customer transport or supplier calls."""
import html,json,threading,time

WAIT_MESSAGE='Данные получены. Подготавливаем активацию.'
_active=set()
_lock=threading.Lock()


class StockUnavailable(ValueError):
    def __init__(self,pool):
        self.pool=str(pool)
        super().__init__('market_stock_wait')


def init(a):
    with a.connect() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS market_stock_waits(
          job_id INTEGER PRIMARY KEY,pool TEXT NOT NULL,state TEXT NOT NULL,
          next_at REAL NOT NULL DEFAULT 0,created_at REAL NOT NULL,updated_at REAL NOT NULL)''')
        c.execute('''CREATE TABLE IF NOT EXISTS market_aibuy_notices(
          event TEXT PRIMARY KEY,state TEXT NOT NULL,message TEXT NOT NULL,message_id TEXT,created_at REAL NOT NULL)''')


def _table(c,name):
    return bool(c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(name,)).fetchone())


def safe(c,j,initial=False,released=False):
    if not j:return False
    j=dict(j)
    if (j['platform'] not in ('funpay','playerok') or j['status'] not in (('waiting_data','validating','failed') if initial else ('waiting_data',))
        or j.get('archived_at') or not j.get('auto_submit_allowed') or j.get('key_id') or j.get('aiee_order_id')
        or j.get('submit_attempts') or j.get('last_poll_status') or j.get('finished_at')):return False
    if _table(c,'marketplace_refund_holds') and c.execute('SELECT 1 FROM marketplace_refund_holds WHERE platform=? AND account_id=? AND order_id=?',
        (j['platform'],j['account_id'],j['order_id'])).fetchone():return False
    if _table(c,'market_aibuy_attempts') and c.execute("SELECT 1 FROM market_aibuy_attempts WHERE job_id=? AND state<>'native_stock'",(j['id'],)).fetchone():return False
    if _table(c,'subscription_reserve_attempts') and c.execute('SELECT 1 FROM subscription_reserve_attempts WHERE job_id=?',(j['id'],)).fetchone():return False
    return initial or j['error']==WAIT_MESSAGE or (released and j['error']=='')


def notice(a,job,pool=None,shared=False,site=None):
    """One durable event across local/shared/reserve paths, owner bot only."""
    job=dict(job)
    if job.get('platform') not in ('funpay','playerok'):return
    init(a)
    selected=str(pool or job.get('key_pool') or '')
    if not pool and not shared:
        with a.connect() as c:
            if _table(c,'subscription_reserve_attempts'):
                r=c.execute('SELECT pool,provider FROM subscription_reserve_attempts WHERE job_id=?',(job['id'],)).fetchone()
                if r:selected=str(r['pool']);site={'ios':'https://vip.sxzfd.com','aiee':'https://aiee.fun'}.get(r['provider'],site)
    kind=job.get('product_type','')
    grok=kind=='grok_aisou'
    label='Claude Pro' if kind=='claude_pro' else 'Codex '+str(job.get('package')) if kind=='codex' else {
        'chatgpt_plus':'ChatGPT Plus','chatgpt_go':'ChatGPT Go','chatgpt_pro_5x':'ChatGPT Pro 5×',
        'chatgpt_pro_20x':'ChatGPT Pro 20×','chatgpt_pro_25x':'ChatGPT Pro 25×','supergrok_1m':'SuperGrok · 1 месяц','supergrok_3m':'SuperGrok · 3 месяца',
    }.get(kind,selected)
    if grok:label='Grok '+str(selected).removeprefix('aisou_grok_').title()+' · 1 месяц'
    if shared:
        selected='grok-'+str(job['key_pool']).removeprefix('aisou_grok_')+'-1' if grok else 'claude-pro' if kind=='claude_pro' else 'codex-'+str(job['package'])
        site='AISOU / aiee.fun' if grok else 'AI-BUY / aichongzhi.fun' if kind=='claude_pro' else 'AISOU / aiee.fun; резерв AI-BUY / aichongzhi.fun'
    if not site:site='https://vip.sxzfd.com' if selected.endswith('_active') else 'https://aichongzhi.fun' if selected.startswith('grok_') else 'https://aiee.fun'
    where='SDK/CDK' if shared else 'Ключи в чатах'
    url='https://gptishka.shop/admin/cdks' if shared else 'https://gptishka.shop/admin/workspace/chats'
    e=lambda value:html.escape(str(value))
    message=(f"🔑 <b>Нужно добавить ключ активации</b>\n\n🛍 <b>{e(label)}</b>\n"
        f"🧾 <b>{'FunPay' if job['platform']=='funpay' else 'PlayerOK'}</b> · <code>{e(job['order_id'])}</code>\n"
        f"Пул: <code>{e(selected)}</code>\nСпособ: {e(site)}\n\n"
        f"Добавьте ключ нужного тарифа в <a href=\"{url}\">{where}</a>. Данные клиента сохранены, обработка продолжится автоматически.\n"
        "Клиенту сообщение о нехватке ключей не отправляется.\n\n<code>Диагностика: marketplace_stock_wait</code>")
    with a.connect() as c:
        c.execute("INSERT OR IGNORE INTO market_aibuy_notices VALUES(?,'pending',?,NULL,?)",(str(job['id'])+':stock_wait',message,time.time()))


def defer(a,jid,error):
    if not isinstance(error,StockUnavailable):return False
    init(a)
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(int(jid),)).fetchone()
        if not safe(c,j,initial=True):return False
        now=time.time()
        c.execute("INSERT INTO market_stock_waits VALUES(?,?,'waiting',0,?,?) ON CONFLICT(job_id) DO UPDATE SET pool=excluded.pool,state='waiting',next_at=0,updated_at=excluded.updated_at",
            (j['id'],error.pool,now,now))
        c.execute("UPDATE codex_jobs SET status='waiting_data',error=?,updated_at=datetime('now') WHERE id=?",(WAIT_MESSAGE,j['id']))
    notice(a,j,error.pool)
    return True


def hold(a,jid):
    init(a)
    with a.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        r=c.execute("SELECT * FROM market_stock_waits WHERE job_id=? AND state IN ('waiting','released')",(int(jid),)).fetchone()
        if not r:return False
        j=c.execute('SELECT * FROM codex_jobs WHERE id=?',(int(jid),)).fetchone()
        if not safe(c,j,released=r['state']=='released'):
            c.execute("UPDATE market_stock_waits SET state='held',updated_at=? WHERE job_id=?",(time.time(),jid));return True
        if not c.execute("SELECT 1 FROM codex_keys WHERE pool=? AND status='available' AND reserved_job_id IS NULL",(r['pool'],)).fetchone():
            c.execute("UPDATE market_stock_waits SET state='waiting',updated_at=? WHERE job_id=?",(time.time(),jid));return True
        c.execute("UPDATE market_stock_waits SET state='released',updated_at=? WHERE job_id=?",(time.time(),jid))
    return False


def tick(a):
    """Continue local waits independently of new FunPay/PlayerOK messages."""
    init(a)
    with a.connect() as c:
        cfg=c.execute('SELECT enabled,auto_submit FROM codex_settings WHERE id=1').fetchone()
        if not cfg or not cfg['enabled'] or not cfg['auto_submit']:return
        rows=c.execute("SELECT job_id FROM market_stock_waits WHERE state IN ('waiting','released') AND next_at<=? ORDER BY next_at,job_id LIMIT 12",(time.time(),)).fetchall()
    for row in rows:
        jid=row['job_id']
        with _lock:
            if jid in _active or len(_active)>=4:continue
            _active.add(jid)
        def run(job_id=jid):
            try:
                with a.connect() as c:c.execute('UPDATE market_stock_waits SET next_at=? WHERE job_id=?',(time.time()+20,job_id))
                if not hold(a,job_id):a.validate_job(job_id)
            finally:
                with _lock:_active.discard(job_id)
        threading.Thread(target=run,daemon=True).start()
