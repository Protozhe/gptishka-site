"""Match a completed charge; available balances are not purchase receipts."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo


def minor(value):
    try:
        amount = Decimal(str(value)) * 100
    except InvalidOperation:
        raise ValueError('settlement_amount_invalid') from None
    if not amount.is_finite() or amount != amount.to_integral_value() or amount <= 0:
        raise ValueError('settlement_amount_invalid')
    return int(amount)


def match_charge(rows, job, timezone):
    if not job['final_amount_minor'] or not job['currency'] or not job['dispatched_at']:
        raise ValueError('settlement_identity_missing')
    matches = {}
    for item in rows:
        if item.get('status') != 'COMPLETE' or item.get('type') != 'Authorization':
            continue
        merchant=str(item.get('merchant_name','')).upper()
        claude='plan' in job.keys() and job['plan'] in ('max_5x','max_20x')
        grok='plan' in job.keys() and job['plan'] in ('plus_monthly','premium_monthly','super_monthly','ultra_monthly')
        allowed=('ANTHROPIC','CLAUDE') if claude else ('XAI','X.AI','GROK') if grok else ('OPENAI',)
        if not any(x in merchant for x in allowed):
            continue
        if item.get('auth_currency') != job['currency'] or item.get('settle_currency') != 'USD':
            continue
        try:
            if minor(item.get('auth_amount')) != job['final_amount_minor']:
                continue
            stamp = datetime.fromisoformat(str(item.get('auth_time')).replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=ZoneInfo(timezone))
            if abs(stamp.timestamp() - job['dispatched_at']) > 900:
                continue
            cost = minor(item.get('settle_amount'))
        except (ValueError, TypeError):
            continue
        identity = item.get('auth_id')
        if isinstance(identity, str) and identity:
            matches[identity] = cost
    if len(matches) != 1:
        raise ValueError('settlement_requires_reconciliation')
    return next(iter(matches.items()))
