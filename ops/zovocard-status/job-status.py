"""Local observation only; never decides whether a payment may be dispatched."""

TERMINAL_FAILURES = {'failed_before_dispatch', 'terminal_failure'}


def review_reason(con, job_id):
    row = con.execute("""SELECT detail FROM codex_logs WHERE job_id=?
        AND event LIKE 'zovocard%review' ORDER BY id DESC LIMIT 1""", (job_id,)).fetchone()
    return str(row[0] or '') if row else ''


def recoverable_wait(job, reason):
    # A historical review must not hide a later, different operator error.
    error = str(job['error'] or '')
    return (job['status'] == 'manual_action' and reason == 'pool_waiting_for_card'
            and any(text in error for text in ('pool_waiting_for_card',
                    'Нет свободной карты с подтверждённой историей', 'Ожидает свободную карту')))


def primary_inflight(con, job_id):
    """Fail closed when a dispatch has no confirmed terminal outcome locally.

    A terminal failure is only permission to inspect reserve evidence. The
    existing remote zero-charge attestation still exclusively seals fallback.
    """
    states = []
    for table in ('codex_external_fulfillments', 'codex_zovocard_receipts'):
        if con.execute('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=?', (table,)).fetchone():
            column = 'status' if table == 'codex_external_fulfillments' else 'state'
            states += [row[0] for row in con.execute('SELECT '+column+' FROM '+table+' WHERE job_id=?', (job_id,))]
    if states:
        return any(state not in TERMINAL_FAILURES for state in states)
    return bool(con.execute("""SELECT 1 FROM codex_logs WHERE job_id=? AND
        ((event LIKE 'zovocard%dispatch') OR event IN
         ('submitted','submit_uncertain','submit_pending_confirmation')) LIMIT 1""", (job_id,)).fetchone())
