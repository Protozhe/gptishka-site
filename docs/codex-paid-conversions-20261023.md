# Codex confirmed-payment reporting

Scope: search campaign 714510350 only, counter 106969126, separate JavaScript/offline goal `paid_codex_server`.
No budget, bid or strategy changes; existing goals and other campaigns remain unchanged.

The protected deployment adds a read-only database collector. It only accepts paid site orders containing exclusively Codex 250/500/1000 products, a successful payment from a real provider and a recent click identifier from this campaign's own attribution touch. Mixed carts, other products/campaigns, pending/failed/refunded orders, test providers and missing identifiers are excluded.

The prospective start time is mandatory. No historical backfill is implicit. Configure `/etc/gptishka/codex-metrika.env` (0600, never commit) with `CODEX_METRIKA_START_AT`, `CODEX_METRIKA_OAUTH_TOKEN` and `CODEX_METRIKA_LEDGER=/var/lib/gptishka-runtime/codex-metrika` before enabling the dedicated five-minute systemd timer. The OAuth token needs only the existing offline-data permission. The root/backend environment files are not modified.

Only Yclid, target, actual payment timestamp, price and currency leave the server. Customer email, Telegram, activation links, account credentials and private page URLs are never sent. No external scripts are added to private pages.

An exclusive, durable per-order hashed ledger entry is written before POST. Restarts, concurrent collectors and ambiguous network outcomes do not resend a conversion. Rejected, uncertain or unmatchable uploads require review, not automatic replay. An accepted upload is recorded as SUBMITTED, not counted as a confirmed match; subsequent runs poll processing status. Existing purchase-goal events are not reused or overwritten.

First run without `--upload` is read-only. Verify the goal and campaign selection before installing `ops/codex-metrika.service` and `.timer`. Check the journal and uploaded conversions after the first genuine eligible payment; do not generate fake orders or ad clicks.

References:
- https://yandex.ru/dev/metrika/ru/management/offline-conv
- https://yandex.ru/dev/metrika/ru/management/openapi/offline_conversions/upload_1
- https://yandex.ru/support/metrica/ru/data/offline-conversion-data
