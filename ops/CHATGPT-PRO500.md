# ChatGPT Pro 25x / Pro 500

Requested contract: one month, 50,000 RUB, automatic Zovocard activation.
The independent fulfillment path must be installed and checked before activating the draft.
Existing Pro 5x / Pro 100 and Pro 20x / Pro 200 keep their product IDs, prices,
activation variants and fulfillment routes. Historical review text is unchanged.

## Dedicated fulfillment path

Website SKU `chatgpt-pro-25x-1` maps to ZovoCard `pro_50x` / `chatgptpromax`.
The provider retains the older 50x name. Never substitute Pro 100 / Pro 200.

- Owner: `pulse-sitepro500-v1`; pool: `zovocard_pro500_direct`.
- Main worker: `/opt/pulse-web/sitepro500_auto.py`, private RPC `sitepro500_access.cjs`.
- Frankfurt worker: `/opt/pulse-zovocard/app/zovocard_pro500.py`.
- Gateway: pro500_prepare / submit / poll / status / receipt.
- Only new paid website orders with exact product ID, quantity one, matching full
  session and no previous key/task/dispatch are eligible. Fresh fee/FX/margin checks
  precede dispatch. Unknown results are inspect-only; no CDK fallback.
- Shared XL537872 pool: five lifetime payments maximum, one payment/day MSK.
- Net expense bound including fees/opening: $500.15; temporary card funding bound $530.
- Final receipt requires exact plan/stage/card, confirmed cancellation of renewal
  and verified settled expense. Surplus returns aim at $0.01.
- Website notifications go to @myadminiibot. The shared $1000 cumulative guard and
  budget warnings remain unchanged.

Mocked purchase/return, source validation and duplicate-dispatch tests verify the
integration without purchasing a real subscription. Adequate available wallet funds
are a separate requirement: insufficient funds stop before payment. Do not raise
shared limits without user authorization.

Enable the exact existing draft only after the independent worker and production
checks pass. Preserve its existing price and placements and all other products.

## Data setup

`node scripts/setup-chatgpt-pro-25x.cjs` performs a read-only plan.
`--apply` exports exact affected records and creates an inactive product draft.
`--apply --activate` refuses activation unless `fulfillmentReady` is true.
For an already-created draft, prefer an exact audited product update instead of
rerunning the setup script and its broader display-copy updates.
Existing product updates are limited to the requested dual display names. Their
prices, delivery methods, tags and placements are preserved. The new service-page
placement is additive; no catalog sections are replaced. No NEW badge is added.

The setup exports `before.json` to a timestamped directory under
`GPTISHKA_BACKUP_DIR` or `/var/backups/gptishka` before changing data.
For rollback, restore only the captured display fields and the page copy from that
snapshot. Disable the new product first. Delete its draft placement/product only
after confirming there are no order items referring to its ID; otherwise retain
the inactive product to preserve order history. Never restore prices from a stale
snapshot over an intervening admin price change.

Deployment still follows the repository's main → verified production flow.
