# AISOU procurement

Importing the libraries performs no I/O. `AisouClient` remains read-only;
`aisou-live.cjs` supplies the separate signed balance buyer behind a protected
runtime policy. The native Plus selector and Codex 250/500/1000 start call it
only after selecting the account route and finding no local key. The scheduler resumes durable native
demands; it never repeats a claimed purchase or an activation submission.

`pulse-stock.py` supports new **website** Codex 250/500/1000 orders and website
Plus/Go fallback. It uses the peer-authenticated website Unix broker; API
credentials never enter the Pulse process. Marketplace procurement and other
tariffs remain unsupported. Their existing activation paths are unchanged.
`install-pulse.py` checks exact anchors before installing the adapter and keeps
code backups. It does not enable policies, buy keys or activate customer accounts.

## Verified merchant facts (2026-10-24)

- AISOU serves the ACG-Faka Shared API. An unauthenticated read-only request to
  `/shared/commodity/items` returned JSON with `code=0`, `商户ID不存在`.
- The signed-in profile `/user/security/personal` visibly contains merchant ID
  and merchant key fields. Their values were not copied into tool output or code.
- Upstream protocol sources: [Shared Commodity](https://github.com/lizhipay/acg-faka/blob/main/app/Controller/Shared/Commodity.php),
  [authentication](https://github.com/lizhipay/acg-faka/blob/main/app/Interceptor/SharedValidation.php),
  [signature](https://github.com/lizhipay/acg-faka/blob/main/app/Util/Str.php).
- Shared `trade` forces balance payment and accepts `request_no` through the
  order service. Upstream rejects a duplicate request number. This capability
  has **not been tested by charging the AISOU balance**; the merchant can run a
  different version or add restrictions.
- Authenticated `connect`, `items`, `item` and `inventory` reads succeeded using
  the existing account key held only in RAM. Sixteen relevant catalog goods
  were API-enabled. The owner subsequently authorized protected server-side
  storage and automatic procurement. Server authentication using curl succeeds;
  Python urllib was rejected with HTTP 403. The actual charged trade path must
  still be confirmed by a qualifying new paid order, not a synthetic purchase.
- The documented `query` method needs `tradeNo`. No reliable lookup by our
  `request_no` alone has been confirmed. If a reply is lost before `tradeNo` is
  received, keep the purchase uncertain and reconcile owner purchase history;
  do not replay it or silently change merchant request numbers.
- Authenticated one-unit IOS Plus price is 124 CNY, while the catalog teaser
  showed the 122 CNY wholesale price. The prepared contract ceiling is 124.
  Quantity stays one; wholesale discounts must never cause bulk purchases for
  a single customer.
- Codex `inventory` returns stock for the selected race but currently returns
  only the first race (250) in its category price fields. Authenticated `item`
  supplies all four denominations and their prices (75/145/276/680 CNY).
  `quoteFromReads` binds the exact selected race in that map; a base `price=75`
  or an omitted denomination is never substituted for a larger denomination.
- The installed read-only `valuation` endpoint was verified for all seven
  enabled route/denomination combinations. Production uses lightweight `items`
  + exact-race one-unit `valuation` + inventory, avoiding `item`'s slow upstream
  synchronization. For IOS, inventory can quote 124 while valuation exposes
  122; the higher authenticated quote bounds the purchase. A lower positive
  actual charge is accepted and recorded; an overcharge remains quarantined.
- Reads have a 30-second timeout and one bounded retry. Balance purchase has
  a 45-second timeout and no retry. Provider key checks run concurrently.
  Procurement uses a separate peer-authenticated Unix service so a slow
  supplier does not block existing reserve/completion RPC or status polling.

## Key evidence

381 unique retained keys were examined in memory across website inventory,
website activation history and marketplace inventory. No full key was exported.
Observed reusable segments: `C250-`, `C500-`, `C1000-`, `C2500-`, `GPLUS-`,
`GPGO-`, `GO-`, `IOS-`, `EEE-`, `GGG-`. They are hints, not an immutable supplier
contract. IOS occurs across Plus and Go history; Grok prefix does not encode the
duration; legacy random keys have overlapping formats across products.

Every purchased key requires a read-only canonical provider check of product,
denomination/duration, endpoint and unused state before release. Mismatches or
ambiguous responses stay encrypted in quarantine. A contradictory prefix and
provider response also stops release.

## Durable dispatch and recovery

The journal atomically records a unique order-bound dispatch before invoking a
buyer. Another process, a restart or a timeout never steals a `sending` claim.
Receipts are encrypted and saved before parsing. Wrong keys remain encrypted
and unavailable to customer workers. There is at most one corrective purchase,
with a distinct stable request number, after confirmed wrong product + unused
state, a confirmed original price, and sufficient explicit total budget. An
uncertain purchase, an ambiguous key or a changed charge never permits it.

The journal belongs outside the checkout, under a service-only directory. Its
32-byte encryption key must come from a protected runtime secret. Journal file
permissions are set to 0600; the parent directory must be 0700. The caller must
verify the paid order, no existing/in-progress fulfilment, financial margin and
the correct notification destination. `aisou-live.cjs` independently checks the
new paid website order, exact product, quantity, payment amount, original payment
commission, cost-reference freshness, session presence and prior fulfilment.
Missing or uncertain evidence holds the order. Stock and merchant balance are
checked before a new dispatch. Existing receipts are recovered independently of
current stock/balance. Merchant quantity is always one.

Policies and credentials: `/var/lib/gptishka-runtime/supplier-secrets/`, root
owned, directory 0750, files 0640 readable only by the website group. Journal:
`/var/lib/gptishka-runtime/aisou-procurement/`, website UID 0700, database 0600.
The policy's `enabledAfter` applies to order creation and confirmed payment.
The budget monitor and Zovo cumulative spending cap are not altered.

Confirmed AISOU balance shortages create a durable 15-minute owner grace period
in the existing journal. The owner receives a structured alert with the exact
CNY quote, available balance, shortfall and deadline, then one reminder after
15 minutes if still unresolved. Deadlines survive process restarts; a separate
local journal check can remind even during a supplier read outage. Only paid,
unfinished orders are eligible. Funding restoration resumes the existing demand
through the normal purchase claim; a previous uncertain dispatch is never retried.
Website alerts use the website admin bot. Zovo subscription jobs have the same
15-minute grace before reserve handoff; marketplace alerts use their own bot.
Expiry never cancels/refunds an order or raises a spending limit.

Fallback procurement requires the existing remote `fallback_sealed` proof,
bound source/session/product and the native order lock. It cannot start Zovo.
Codex purchases enter the encrypted website-only reserve pool with acquisition
costs. Subscription purchases are assigned in the website admin inventory.
Wrong keys remain in encrypted quarantine. Unmapped products, ambiguous keys,
unknown commissions, stale cost references and unresolved purchases stop rather
than silently substitute a different tariff or issue another payment.

## Tests

`node scripts/verify-supplier-procurement.mjs`

Tests use temporary SQLite databases, synthetic keys and mocked HTTP/buyers.
They cover exact variants, eligibility, ambiguous prefixes, authenticated
request encoding, disabled defaults, concurrent callers, process loss,
uncertain payments, encrypted quarantine, one correction, budget holds and
unexpected/reused key deliveries. They make no supplier purchases or activations.

## AI-BUY Codex on the website

`aibuy-live.cjs` selects AI-BUY only for website Codex 250/500/1000 orders
created AND paid after the separate `aibuy-policy.json` cutoff. Matching local
AIEE stock is used first. ChatGPT, Grok, Claude Max and marketplace routes are
not changed. Claude Pro has the separate opt-in below. Any existing AISOU
purchase claim blocks a second supplier purchase.

The ordinary storefront runs in real sandboxed Chrome as `gptishka-buy`, with
the independently established, encrypted server session. No desktop cookies or
passwords are imported. Root keeps the session and encrypted inventory; the
website has a peer-UID checked Unix socket that accepts only an order ID. A
separate website DB validator determines payment, product, session eligibility,
cost ceiling and margin. Protected runtime settings/journals stay outside Git.

Only item 75, quantity 1 and balance payment are permitted. Variants are exact
`250点数额度` / `500点数额度` / `1000点数额度`, capped at ¥75 / ¥145 / ¥276.
Before the one pay click, the broker fsyncs a durable claim; the ordinary form
carries a stable opaque request number and contact correlation. Lost replies
are recovered by authenticated own-order history, never by paying again. No
CAPTCHA, TOTP or other verification is bypassed. An uncertain earlier debit
blocks further debits from that account until resolved.

The key is independently verified unused and `codex_<denomination>` at
`aichongzhi.fun`. It never enters an AIEE pool. New activation submissions also
have a durable boundary; a lost response leads to status polling only. Confirmed
wrong/used keys remain encrypted in quarantine. Margin/verification failures
hold the order for review without another charge. Native website notices use
the website admin bot, including a 15-minute funds grace and confirmed outcome.

Native Codex status reads carry the selected product into the provider adapter,
so a different workflow cannot complete the order. Confirmed completion is
monotonic: a slower concurrent pending/failed reply cannot downgrade success or
restore erased customer credentials. An uncertain submission that reached the
review timeout continues read-only reconciliation for up to seven days; a late
final provider confirmation can complete it without a second activation POST.
An explicit final provider failure does not enter this uncertain-state polling.

Isolated native integration tests cover all three denominations, one purchased
key and acquisition cost per order, restart reuse, lost activation responses,
late success and final notification dispatch. They use synthetic paid orders
and mocked transports; passing them does not by itself prove a new live
customer purchase and activation. Read-only supplier preflight verifies the
current exact variants/quotes and inventory without debiting the wallet.

Install `install-aibuy.py` from the deployed committed release; it starts with
`enabled:false, paused:true`. Run `preflight-aibuy.py` (read-only) and confirm all
three variants, balance and owner before enabling. Set a fresh cutoff when
enabling; do not admit earlier orders implicitly. The Git deployment restarts
an already installed broker, retaining its durable claims and encrypted stock.
The Python runtime needs cryptography and Playwright, already provisioned on
the production host, plus official Google Chrome with sandbox support.

Keep ONE server login for procurement. For funding, use owner-only SSH helper
`aibuy-topup.py --id <unique-reference> --amount 200 --network BEP20`. It creates
one unpaid invoice in that existing session and returns an allowlisted
`pay.ai-buy.vip` URL. The owner pays the external page without signing into the
supplier; the helper never transfers money. Repeating the same reference
returns the same invoice or holds an uncertain result. The account lock
serializes invoice creation with purchases. A supplier-requested login/2FA
renewal requires owner participation and never starts an automatic new login.

### Website Claude Pro

Claude Pro additionally requires a fresh `productEnabledAfter["claude-pro"]`
in the protected AI-BUY policy. Both order creation and confirmed payment must
follow it. Enabling Codex alone does not enable Claude or admit old orders.
Normal available native Claude keys are reserved first. With an empty pool,
the activation form still accepts a Claude account UUID, stores the encrypted
input and requests one acquisition for that trusted paid order.

The only subscription contract is item **29**, no variant, quantity **1**,
balance payment, at most **¥134** with confirmed positive margin. Any newly
introduced variants stop checkout. The old INTEGER ledger stores this distinct
subscription contract as `0`; it does not mean zero credits. No schema change
is needed, the global uncertain-debit guard covers subscriptions and credits,
and Codex never takes an asset from the Claude bucket. Receipt item, empty
variant, quantity, payment and amount must all match. The independent key oracle
must confirm `product=claude`, unused `workflow=claude_pro`, without a prior
job/account binding. Prefixes and similar titles are never proof.

Claude uses the same durable purchase and native activation boundaries as
Codex. One `activate` POST follows the saved native submission claim; timeouts
only poll the original key. Final success cannot be downgraded by a slower
status reply. Review of an uncertain response keeps read-only polling enabled;
the native retry/swap actions cannot resubmit it. Funds shortages retain the
15-minute owner grace and automatic continuation. Website outcome notifications
use the existing website admin bot and its once-only delivery journal.

Claude Max, support SDK pools, Zovo routes and old/manual orders are excluded.
Isolated tests include correct item/no variants, canonical workflow, encrypted
quarantine, old/unpaid/invalid UUID rejection, lost purchase/activation replies,
restart reuse and late final completion. These do not debit the real wallet;
first live empty-pool procurement still needs a genuine new paid order.

### Owner-prepaid AIEE 1000 reserve

The optional `prepaidAieeFallback` policy has its own `enabled` and fresh
`enabledAfter` cutoff. It accepts only website Codex 1000 orders both created
and paid after that cutoff, with the existing fresh-session and margin checks.
Prepaid keys stay AES-GCM encrypted in the root broker's
`prepaid_aiee_reserves` table, never in the ordinary available AIEE pool. Each
row records actual acquisition CNY, USDT and purchase date without a purchase
request. Never put a real key in Git, arguments, logs or reports.

AI-BUY remains primary. Only a login-required error, checkout-not-ready result
proven before any pay click, or confirmed balance shortage can claim a reserve.
Its unused status and exact `codex1000` denomination are checked via AIEE's
read-only `query_code` and `verify_code` actions. A single SQLite transaction
assigns the key exclusively and seals the original purchase as
`cancelled_no_charge`. Restart recovery returns the same bound key. A timeout,
ambiguous debit, prior submitted activation, human verification or owner pause
cannot consume the reserve. AIEE activation then uses the existing native
durable submission flow; this feature never activates a key as a test.
