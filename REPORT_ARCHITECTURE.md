# REPORT_ARCHITECTURE

## Summary
This iteration focused on safe, in-place refactoring of runtime hotspots without changing business logic (payments, activation, tariffs, admin process).

## What Was Changed

### Storefront Runtime (`assets/js/app.js`, `assets/js/app.min.js`)
1. Transition handshake refactor
- Added session-based transition intent (`gptishka_nav_transition`) so enter-animation runs only after internal navigation.
- Prevents abrupt/flicker-like animation on hard refresh/direct opens.
- Added `pageshow` recovery to clear stale `is-leaving` state.

2. Home gradient lifecycle hardening
- Gradient/pointer background now initializes only on pages with `[data-hero-react-root]`.
- Pointer follow disabled on coarse pointers and reduced-motion users.
- Reduces unnecessary effect work on legal/info pages.

3. Pulse beam optimization
- Removed global `MutationObserver` over full `body` subtree.
- Replaced with lazy hydration on `mouseover`/`focusin`.
- Keeps visual behavior while reducing observer overhead.

4. Product API request deduplication
- Added in-memory short TTL product payload cache (`PRODUCTS_CACHE_TTL_MS`) + pending promise reuse.
- Reused by pricing load and checkout item id resolution.
- Eliminates redundant `/api/public/products` requests in one session flow.

5. Background timer throttling
- Promo expiry check skips hidden tabs.
- Ticker heartbeat/stats polling now pause/resume-aware via visibility handling.

6. Dead code cleanup
- Removed legacy card quantity storage flow not used by current one-item checkout model.

7. Analytics event surface (structured)
- Added unified `trackAnalyticsEvent()` with `dataLayer` + Yandex goal transport.
- Exposed as `window.gptishkaTrackEvent` for cross-script tracking.
- Added events on:
  - `faq_open`
  - `resume_activation_click`
  - `plan_preview_open`
  - `checkout_start`
  - `payment_method_selected`
  - `checkout_redirect`
  - `promo_validate_success` / `promo_validate_fail` (preview/cart)

### Support Widget (`assets/js/support-widget.js`)
- Added analytics hooks:
  - `support_widget_open`
  - `support_widget_click`
- Uses `window.gptishkaTrackEvent` when available, with safe fallback to Yandex goal calls.

### Storefront Server (`server.js`)
1. Admin proxy cookie robustness
- `Set-Cookie` forwarding now supports multi-cookie responses (array forwarding) instead of single-value forwarding.
- Important for auth/session reliability.

2. SEO control for technical pages
- Added `X-Robots-Tag: noindex, nofollow` for checkout/redeem/status pages:
  - `/cart.html`, `/payment.html`, `/success.html`, `/fail.html`, `/redeem-start.html`
  - `/en/cart.html`, `/en/payment.html`, `/en/success.html`, `/en/fail.html`, `/en/redeem-start.html`

3. Proxy header pass-through improvement
- Added forwarding of `Location` header from admin backend responses.

### Visual Layer (`assets/css/unified-premium.css`)
- Smoothed enter/leave transition curve and reduced abrupt end-state jump.
- Added final safety override to keep floating resume CTA width constrained (`fit-content`).

### SEO Infrastructure
1. `robots.txt` hardening
- Added explicit disallow rules for technical pages:
  - `/cart.html`, `/payment.html`, `/success.html`, `/fail.html`, `/redeem-start.html`
  - `/en/cart.html`, `/en/payment.html`, `/en/success.html`, `/en/fail.html`, `/en/redeem-start.html`

2. `sitemap.xml` cleanup
- Rebuilt sitemap to include only indexable commercial/content/legal pages.
- Removed technical checkout/redeem/status URLs from sitemap.

### Asset cleanup
- Deleted unused files:
  - `assets/js/reviews-feed.js`
  - `assets/css/sections.css`
  - `assets/css/sections.min.css`

### SEO markup touch
- Added Twitter card tags on home pages:
  - `index.html`
  - `en/index.html`

## Files Touched (Core)
- `assets/js/app.js`
- `assets/js/app.min.js`
- `assets/js/support-widget.js`
- `assets/css/unified-premium.css`
- `server.js`
- `index.html`
- `en/index.html`
- Multiple public HTML files: cache-busting version updates for `unified-premium.css`, `app.min.js`, `support-widget.js`
- `assets/js/reviews-feed.js` (deleted)
- `assets/css/sections.css` (deleted)
- `assets/css/sections.min.css` (deleted)

## Architectural Effect
- Lower runtime overhead on non-critical pages.
- Fewer redundant API calls during purchase flow.
- More predictable page-transition behavior.
- Better analytics observability with unified naming.
- Stronger proxy reliability for admin auth responses.
- Cleaner SEO separation between indexable pages and technical funnel URLs.
