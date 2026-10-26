# Zovo status and notification ownership

`notifications.py` is the owner-only observer used by the existing fallback
notifier. It records delivered milestones in that notifier's SQLite database:
one progress message and one settled success, plus one alert per new obstacle.
Sending failures remain pending. Existing delivery records are migrated without
reannouncing completed orders. Return bookkeeping does not invalidate proof of
the delivered success. `watch-chatgpt.py` understands both delivery formats.

The Pro bridge preserves an in-flight result when the shared gateway is busy.
The reserve worker refreshes eligibility before evidence and reservation, and
does not inspect fallback while the primary is active. Its remote zero-charge
attestation and single-dispatch guards remain mandatory. No payment retries are
introduced here.

Run `node scripts/verify-zovocard-status.mjs` for isolated SQLite and mocked
transport regressions. The check is also part of `npm run verify:production`.

After the protected production release succeeds, run its committed installer:

```sh
python3 /var/www/gptishka-new/ops/zovocard-status/install.py --sha COMMIT
python3 /var/www/gptishka-new/ops/zovocard-status/install.py --sha COMMIT --apply
```

The installer checks release identity and known runtime hashes, refuses to reload
during validation/submission, and backs up only the listed Python modules. It
reloads the two existing consumers of cached imports; the website Pro timers
load the new bridge on their next normal invocation. Configuration, routes,
limits, customer sessions and the secondary payment worker are untouched. An
installation failure restores the original modules and services automatically.
