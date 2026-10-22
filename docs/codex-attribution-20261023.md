# Codex advertising attribution correction — 23 October 2026

Status: **published**, commit `98eb1d30d5239fccb56c79dd8c1022ba357e8016`.
The user explicitly approved publication on 23 October 2026 (Europe/Berlin).
See `deployment-20261023-codex-attribution.json` for the workflow, backup and
public verification receipt. No Direct settings, Metrika settings, database
records or payment-provider configuration were changed by this release.

## Baseline and scope

The candidate was created from the clean active production checkout reached via
`/var/www/gptishka-new`, commit
`8003c17ab7b3853c43d8ae8e303586752d27c874`. The surrounding local checkout has a
broken legacy worktree pointer and is not a deployment source. This isolated
repository is on `main` and must be compared with the latest live release before
publication.

- Preserve only the six approved marketing parameters (`utm_source`,
  `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `yclid`) in the Metrika
  initialization URL. Keep private activation pages and token-bearing links
  excluded from third-party analytics. Stored landing/referrer URLs still omit
  query strings and fragments.
- Attach the existing first-touch/last-touch attribution envelope to Codex
  payment order details, using the same backend-compatible format as the main
  checkout. Emit the existing `checkout_start` event, mapped by the shared
  tracker to `ym-begin-checkout`, after contact validation and product resolution.
- Ignore duplicate submit events while a payment request is pending. Analytics
  and storage failures must not prevent payment creation or retry after failure.
- Correct the RU/EN Codex eligibility and expiry copy on both workspace pages:
  active Go/Plus/Pro, account-dependent availability, 12-month credit validity.
  The store does not newly offer this service to Free accounts.
- Synchronize HTML fallback prices with the public catalog checked on this date:
  250 credits / 1500 RUB, 500 / 2500 RUB, 1000 / 4500 RUB. Runtime catalog prices
  remain authoritative. No catalog records or prices were modified.
- Refresh analytics content hashes on 62 HTML pages; non-Codex HTML changes are
  asset cache references only. Refresh the Codex script hash on four pages.

## Verification

- `npm run verify:production`: 44 checks, including the new executable Codex
  attribution regression check.
- `npm run verify:yandex-analytics`: existing attribution/confirmed-purchase
  wiring checks plus advertising URL preservation.
- `scripts/verify-codex-attribution.mjs` exercises all four RU/EN workspace pages
  in JSDOM using intercepted fetch calls. It verifies private-parameter removal,
  attribution in order payloads, valid/invalid forms, duplicate submits,
  API-resolved price, analytics failure and payment retry. It makes no network
  requests and creates no real orders or payments.
- Existing private-page, deferred-analytics and external Codex fulfillment checks
  stay enabled. The Windows clone was normalized to LF to match committed Linux
  source bytes; unrelated file content is unchanged.

## Remaining work and authorization boundary

The browser-control tool was not supplied. The permitted window-control fallback
returned capture timeouts, so current Direct budget, bids, search queries,
moderation and ad price could not be verified or changed. The last observed ad
price (1850 RUB on 9 October) is historical, not evidence of its current text.

This release restores marketing identifiers and checkout-intent events. It does
**not** establish that confirmed payment conversions reach Metrika: private
payment/activation pages retain their analytics exclusion. Server-confirmed
conversion delivery remains deferred and no historical conversions were uploaded.

The separate explicit publication request required by workspace AGENTS.md was
received. The active server baseline was rechecked, all 44 checks passed locally
and in CI, and the protected production workflow passed server verification,
builds, tests, backup and live checks. No individual source files were copied
over the active site. Future changes must compare against this published commit
and repeat the protected release flow.

References:

- https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans
- https://yandex.ru/support/metrica/ru/general/source-tags
