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
