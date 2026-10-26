"""Operator-only ZovoCard updates from local cached data, never payment APIs."""
import hashlib
import html
import json
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from zovocard_job_status import recoverable_wait

STATUSES = {
    'ready': 'Готово к запуску', 'submitting': 'Отправляется на оплату',
    'processing': 'В обработке', 'success': 'Успешно',
    'failed': 'Ошибка', 'manual_action': 'Требуется проверка',
}
FIELDS = ('card_last_four', 'card_charge_usd_minor', 'fee_usd',
          'total_cost_usd_minor', 'return_state', 'returned_usd_minor',
          'card_remaining_usd_minor')


def money(value):
    return f'${value // 100}.{value % 100:02d}'


def safe_finance(raw):
    try:
        data = json.loads(raw or '{}')
    except (ValueError, TypeError):
        return {}
    if not isinstance(data, dict):
        return {}
    result = {}
    for key in FIELDS:
        value = data.get(key)
        if key == 'card_last_four':
            if isinstance(value, str) and re.fullmatch(r'[0-9]{4}', value):
                result[key] = value
        elif key == 'return_state':
            if value in ('sending', 'pending', 'uncertain', 'confirmed'):
                result[key] = value
        elif type(value) is int and value >= 0:
            result[key] = value
    return result


def message(job, finance, decorated=True, historical=False):
    platform = {'funpay': 'FunPay', 'playerok': 'Playerok', 'gptishka': 'GPTishka'}.get(job['platform'], 'Заказ')
    order = str(job['order_id'])
    if not re.fullmatch(r'[A-Za-z0-9:_-]{1,90}', order):
        order = str(job['id'])
    product = 'Codex ' + str(job['package']) if job['product_type'] == 'codex' else 'ChatGPT'
    if job['platform']=='gptishka' and job['product_type'] in ('chatgpt_plus','chatgpt_go','chatgpt_pro_5x','chatgpt_pro_20x','chatgpt_pro_25x'):
        product={'chatgpt_plus':'ChatGPT Plus','chatgpt_go':'ChatGPT GO','chatgpt_pro_5x':'ChatGPT Pro 5x','chatgpt_pro_20x':'ChatGPT Pro 20x','chatgpt_pro_25x':'ChatGPT Pro 25x / Pro 500'}[job['product_type']]
    title = 'Сверка старой заявки' if historical else STATUSES[job['status']]
    lines = ['<b>ZovoCard · ' + html.escape(title) + '</b>',
             html.escape(platform + ' · ' + order + ' · ' + product),
             'Карта: ' + ('•••• ' + finance['card_last_four'] if finance.get('card_last_four') else 'ещё не подтверждена')]
    if historical:
        lines.append('Обновлены данные возврата по ранее выполненному заказу. Это сверка учёта, а не запуск новой оплаты.')
    total = finance.get('total_cost_usd_minor')
    charge = finance.get('card_charge_usd_minor')
    if total is not None and charge is not None:
        lines.append('Фактический расход: <b>' + money(total) + '</b>')
        lines.append('Списание: ' + money(charge) + '; комиссии: ' + money(max(0, total - charge)))
    else:
        lines.append('Фактический расход: ожидается подтверждение транзакции')
    if finance.get('return_state') == 'confirmed':
        lines.append('Возвращено на баланс: ' + money(finance.get('returned_usd_minor', 0)))
    elif finance.get('return_state'):
        lines.append('Возврат остатка: ' + {'pending': 'ожидается', 'sending': 'отправлен', 'uncertain': 'требуется сверка'}.get(finance['return_state'], 'проверяется'))
    if 'card_remaining_usd_minor' in finance:
        lines.append('Остаток карты: ' + money(finance['card_remaining_usd_minor']))
    if job['status'] in ('manual_action', 'failed'):
        lines.append('Подробности в админке. Повторную оплату без проверки не запускайте.')
    if not decorated:
        return '\n'.join(lines)
    icon = {'ready': '🟢', 'submitting': '🚀', 'processing': '⏳',
            'success': '✅', 'failed': '❌', 'manual_action': '⚠️'}[job['status']]
    if historical:icon='🧾'
    context = ('🛍 <b>' + html.escape(product) + '</b>\n'
               '🧾 Заказ: <code>' + html.escape(order) + '</code>\n'
               '📍 Источник: ' + html.escape(platform))
    payment = ['💳 Карта: ' + ('<code>•••• ' + finance['card_last_four'] + '</code>' if finance.get('card_last_four') else '<b>ещё не подтверждена</b>')]
    if total is not None and charge is not None:
        payment += ['💰 Фактический расход: <b>' + money(total) + '</b>',
                    '💸 Списание: ' + money(charge), '🧮 Комиссии: ' + money(max(0, total - charge))]
    else:
        payment += ['💰 Расход: <b>ожидается подтверждение транзакции</b>']
    returns = []
    if finance.get('return_state') == 'confirmed':
        returns.append('↩️ Возвращено на баланс: <b>' + money(finance.get('returned_usd_minor', 0)) + '</b>')
    elif finance.get('return_state'):
        returns.append('🔄 Возврат остатка: <b>' + {'pending': 'ожидается', 'sending': 'отправлен', 'uncertain': 'требуется сверка'}.get(finance['return_state'], 'проверяется') + '</b>')
    if 'card_remaining_usd_minor' in finance:
        returns.append('🏦 Остаток карты: ' + money(finance['card_remaining_usd_minor']))
    blocks = [icon + ' ' + lines[0], context, '\n'.join(payment)]
    if returns: blocks.append('\n'.join(returns))
    if historical:
        blocks.append('ℹ️ <b>Сверка учёта</b>\nОбновлены данные возврата ранее выполненного заказа. Новая оплата не запускалась.')
    if job['status'] in ('manual_action', 'failed'):
        blocks.append('🔎 <b>Нужна проверка в админке</b>\nПовторную оплату без проверки не запускайте.')
    return '\n\n'.join(blocks)


def notification_destination(platform):
    platform = str(platform or '').strip().lower()
    if platform in ('funpay', 'playerok'):
        return 'marketplace'
    if platform in ('gptishka', 'site', 'telegram', 'telegram_bot', 'tgbot'):
        return 'site_admin'
    return None


def notification_confirmed(state, job_id, platform):
    """Read-only proof of an actually delivered final message, independent of returns."""
    if not state.execute("SELECT 1 FROM sqlite_master WHERE name='zovocard_notification_milestones'").fetchone():
        return False
    return bool(state.execute("""SELECT 1 FROM zovocard_notification_milestones
        WHERE job_id=? AND destination=? AND milestone='success'""",
        (job_id, notification_destination(platform))).fetchone())


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).timestamp()
    except (ValueError, TypeError):
        return None


def phase(job):
    if job['status'] == 'success':
        return 'success'
    if job['status'] in ('ready', 'submitting', 'processing') or recoverable_wait(job, job['review_reason']):
        return 'progress'
    # Card, cost and return updates must not repeat an unchanged obstacle.
    reason = ' '.join(str(job['error'] or job['review_reason'] or job['status']).split())
    return 'issue:' + hashlib.sha256(reason.encode()).hexdigest()


def remember(state, job_id, destination, milestone):
    state.execute("""INSERT OR IGNORE INTO zovocard_notification_milestones
        VALUES(?,?,?,datetime('now'))""", (job_id, destination, milestone))


def notify(state, activity_db, send, *, send_site=None):
    state.execute("CREATE TABLE IF NOT EXISTS zovocard_notifications(job_id INTEGER PRIMARY KEY,signature TEXT NOT NULL,notified_at TEXT NOT NULL,destination TEXT NOT NULL DEFAULT 'legacy')")
    if 'destination' not in {r[1] for r in state.execute('PRAGMA table_info(zovocard_notifications)')}:
        state.execute("ALTER TABLE zovocard_notifications ADD COLUMN destination TEXT NOT NULL DEFAULT 'legacy'")
    state.execute("""CREATE TABLE IF NOT EXISTS zovocard_notification_milestones(
        job_id INTEGER NOT NULL,destination TEXT NOT NULL,milestone TEXT NOT NULL,
        notified_at TEXT NOT NULL,PRIMARY KEY(job_id,destination,milestone))""")
    state.commit()
    with closing(sqlite3.connect('file:' + str(activity_db) + '?mode=ro', uri=True, timeout=10)) as source:
        source.row_factory = sqlite3.Row
        has_finance = source.execute("SELECT 1 FROM sqlite_master WHERE name='codex_zovocard_finance'").fetchone()
        if not has_finance:
            return
        rows = source.execute("""SELECT j.id,j.platform,j.order_id,j.package,j.product_type,j.status,j.error,j.finished_at,f.payload,
                (SELECT detail FROM codex_logs l WHERE l.job_id=j.id AND l.event LIKE 'zovocard%review' ORDER BY l.id DESC LIMIT 1) AS review_reason,
                CASE WHEN j.platform='gptishka' AND j.key_pool IN ('zovocard_pro5x_direct','zovocard_pro20x_direct')
                    THEN EXISTS(SELECT 1 FROM codex_logs l WHERE l.job_id=j.id AND l.event IN ('zovocard_sitepro5x_finalized','zovocard_sitepro20x_finalized')) ELSE 1 END AS finalized,
                CASE WHEN j.status='success' AND datetime(COALESCE(j.finished_at,j.updated_at))<datetime('now','-1 day') THEN 1 ELSE 0 END AS historical_success
            FROM codex_jobs j LEFT JOIN codex_zovocard_finance f ON f.job_id=j.id
            WHERE j.key_pool LIKE 'zovocard%' AND j.status IN ('ready','submitting','processing','success','failed','manual_action')
              AND (datetime(j.updated_at)>=datetime('now','-1 day') OR f.updated_at>=strftime('%s','now','-1 day'))
            ORDER BY j.id DESC LIMIT 50""").fetchall()
    failed = 0
    for job in reversed(rows):
        destination = notification_destination(job['platform'])
        sender = send if destination == 'marketplace' else send_site if destination == 'site_admin' else None
        if sender is None:
            continue  # Unknown/unavailable destinations never fall back to the other bot.
        finance = safe_finance(job['payload'])
        milestone = phase(job)
        legacy_signature = hashlib.sha256(message(job, finance, decorated=False).encode()).hexdigest()
        old = state.execute('SELECT signature,notified_at,destination FROM zovocard_notifications WHERE job_id=?', (job['id'],)).fetchone()
        if old and old[2] == destination and not state.execute('SELECT 1 FROM zovocard_notification_milestones WHERE job_id=? AND destination=?', (job['id'], destination)).fetchone():
            # Seed existing deliveries, including successes whose later return
            # bookkeeping no longer matches the old full-message signature.
            remember(state, job['id'], destination, 'progress')
            sent_at, finished_at = timestamp(old[1]), timestamp(job['finished_at'])
            if milestone == 'success' and (old[0] == legacy_signature or
                    (sent_at is not None and finished_at is not None and sent_at >= finished_at)):
                remember(state, job['id'], destination, 'success')
            elif milestone.startswith('issue:') and old[0] == legacy_signature:
                remember(state, job['id'], destination, milestone)
            state.commit()
        if state.execute('SELECT 1 FROM zovocard_notification_milestones WHERE job_id=? AND destination=? AND milestone=?', (job['id'], destination, milestone)).fetchone():
            continue
        if milestone != 'success' and notification_confirmed(state, job['id'], job['platform']):
            continue  # Late stale polls cannot reopen a completed notification.
        if milestone == 'success' and (not job['finalized'] or
                'total_cost_usd_minor' not in finance or 'card_charge_usd_minor' not in finance):
            continue  # Accepted/pending charges are not a verified final result.
        rendered = dict(job)
        if milestone == 'progress':
            rendered['status'] = 'processing'
        body = message(rendered, finance, historical=bool(job['historical_success']))
        if recoverable_wait(job, job['review_reason']):
            body += '\n\n⏳ Ожидает свободную карту. Продолжим автоматически; действий не требуется.'
        # Legacy readers can still verify the actual delivered contents.
        signature = hashlib.sha256(message(rendered, finance, decorated=False).encode()).hexdigest()
        # A failed Telegram request leaves the row pending for the next loop.
        try:
            sender(body)
        except Exception:
            failed += 1
            continue  # One unavailable bot must not block the other channel.
        state.execute("INSERT INTO zovocard_notifications(job_id,signature,notified_at,destination) VALUES(?,?,datetime('now'),?) ON CONFLICT(job_id) DO UPDATE SET signature=excluded.signature,notified_at=excluded.notified_at,destination=excluded.destination", (job['id'], signature, destination))
        remember(state, job['id'], destination, milestone)
        state.commit()
    if failed:
        raise RuntimeError('notification_delivery_incomplete')
