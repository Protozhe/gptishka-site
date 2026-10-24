# AISOU procurement preparation

This directory is **not connected to production workers, stock pools, payments
or customer messages**. Importing it performs no I/O. Real purchasing is not
implemented in `AisouClient`: its public interface permits authenticated reads
only. `buyOnce` accepts an injected buyer for isolated tests and a later reviewed
integration; it defaults to disabled.

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
  were API-enabled. The key was not saved locally or on the server. Production
  source-IP permission and the actual trade path have not been exercised.
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
verify the paid order, no existing/in-progress fulfilment, financial margin,
overall spending allowance and the correct notification destination. Those
integrations are not yet wired and must not be inferred from passing unit tests.

## Tests

`node --test ops/supplier-procurement/aisou-core.test.cjs`

Tests use temporary SQLite databases, synthetic keys and mocked HTTP/buyers.
They cover exact variants, eligibility, ambiguous prefixes, authenticated
request encoding, disabled defaults, concurrent callers, process loss,
uncertain payments, encrypted quarantine, one correction, budget holds and
unexpected/reused key deliveries. They make no supplier purchases or activations.
