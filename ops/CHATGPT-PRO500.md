# ChatGPT Pro 25x / Pro 500

Requested contract: one month, 50,000 RUB, automatic Zovocard activation.
The product remains a draft until the independent fulfillment path is ready.
Existing Pro 5x / Pro 100 and Pro 20x / Pro 200 keep their product IDs, prices,
activation variants and fulfillment routes. Historical review text is unchanged.

## Current boundary

The site's `external-codex.ts` and the Pulse site workers support only Pro 5x
and Pro 20x. The dedicated remote Zovocard worker is reached through the existing
restricted SSH gateway. A read-only capabilities request returned
`action_not_allowed`; no activation or card purchase was submitted.

Do not route Pro 500 to the Pro 100 or Pro 200 worker. Do not copy their financial
limits or claim that Pro 500 automatic purchasing has been tested. Do not replace
the requested automatic purchasing flow with a CDK pool without an explicit change
to the delivery contract.

## Finish fulfillment before enabling sales

1. Obtain administrative access to the separate Zovocard worker.
2. Verify the actual provider/OpenAI plan identifier for Pro 500 and the applicable
   funding, fee and purchase limits. Keep paid-source verification, session binding,
   single dispatch, receipt verification and duplicate-payment protection.
3. Add an isolated Pro 25x route to the remote worker and the Pulse site worker.
4. Extend the site's external-owner recognition, activation/status presentation,
   notification guards and regression tests for the exact new product slug.
5. Verify the complete flow without buying or activating a real subscription.
6. Only after those checks, update `fulfillmentReady` in the product contract.

## Data setup

`node scripts/setup-chatgpt-pro-25x.cjs` performs a read-only plan.
`--apply` exports exact affected records and creates an inactive product draft.
`--apply --activate` refuses activation while `fulfillmentReady` is false.
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
