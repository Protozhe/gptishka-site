# REPORT_BEFORE

## Scope and Method
- Date: 2026-03-09
- Repository: `gptishka-site`
- Audit mode: code-first static analysis + runtime-path review (storefront, API proxy, admin backend, admin UI)
- Critical constraint: preserve business logic for payments, activation, tariffs, admin workflows

## What Was Found

### 1) Project Structure
- Storefront: static multi-page HTML (`/`, `/en/*`, legal pages, payment/redeem/status pages)
- Storefront runtime: `assets/js/app.min.js` (+ `analytics-init.js`, `support-widget.js`, `hero-react.mjs`)
- Storefront server/proxy: `server.js` (Express + sqlite stats/ticker + proxy to admin backend)
- Admin backend: `apps/admin-backend` (TS + Express + Prisma)
- Admin UI: `apps/admin-ui` (React + Vite)

### 2) Entry Points
- Public pages: `index.html`, `en/index.html`, `redeem-start.html`, `payment.html`, legal pages
- Public API via storefront server: `/api/public/*`, `/api/payments/:provider/create`, `/api/orders/*`, `/api/stats`, `/api/heartbeat`
- Admin API proxied by storefront: `/api/admin/*`
- Admin UI SPA: `/admin`

### 3) Frontend
- Main logic concentrated in one large script (`assets/js/app.js` mirrored to `app.min.js`)
- Heavy visual layer concentrated in `assets/css/unified-premium.css`
- Dynamic pricing/cart/checkout modal/promo flows present and wired
- Language switch + page transition + ticker + support widget implemented

### 4) Backend/API/Payments
- Storefront server handles secure proxying to admin backend
- Payment create path normalized through `/api/payments/:provider/create`
- Activation/redeem APIs proxied to admin backend
- Webhooks and payment providers are in admin backend

### 5) SEO/Analytics/Legal
- Core pages contain canonical/hreflang/OG/JSON-LD (home + major content pages)
- Some service/status pages have minimal SEO metadata (expected partially)
- Robots/sitemap present
- Analytics bootstrap exists (`analytics-init.js`: Yandex + Mail.ru)

### 6) Duplicates / Dead / Unused
- `assets/css/unified-premium.css` is very large and contains multiple layered overrides from iterative edits
- Runtime references use only `app.min.js`, while `app.js` is the editable mirror
- Unused file detected: `assets/js/reviews-feed.js` (no imports/references)
- Legacy placeholder CSS remains (`sections.css`, `sections.min.css`)

## What Works Well
- Payment/activation flows are decoupled through API proxy; business-critical paths are centralized
- Admin backend uses dedicated security middleware, auth, and webhook verification
- Storefront has compression + static caching + no-store for HTML
- Major customer journey (plan -> modal -> payment create) is intact and consistent

## Risky Areas
- `assets/js/app.js` is monolithic (~95 KB), many responsibilities in one file
- Page transition logic currently global and can produce perceived abruptness on non-nav loads
- Global MutationObserver for button effects can add unnecessary overhead
- Product data can be fetched repeatedly in multiple flows (extra network cost)
- `server.js` admin proxy currently forwards only a single `Set-Cookie` header value path in practice (risk for multi-cookie auth responses)
- `unified-premium.css` has high selector/override density (maintenance and regression risk)

## Speed Blockers
- Large CSS override file with repeated blocks and many expensive effects
- Universal initialization of heavy background/pointer effects on pages that do not need it
- Repeated product API fetch in checkout-related flows
- Always-running timers even when tab is hidden (ticker/heartbeat/promo checks)

## Maintainability Blockers
- One-file JS architecture for storefront interactions
- Large CSS file with multiple historical hotfix layers
- Inconsistent source of truth between runtime and editable assets (min file naming without minification)

## Conversion/UX Blockers
- Transition timing can feel abrupt at navigation boundaries
- Over-applied micro-effects can reduce perceived smoothness on weaker devices
- Some CTA visual states depend on stacked overrides and are fragile

## Future Failure Risks
- CSS specificity wars leading to accidental regressions
- Additional hotfixes in same large files increasing entropy
- Hidden performance regressions due always-on observers/timers

## Quick Wins (Safe)
1. Gate heavy gradient/pointer logic to relevant pages only
2. Replace global MutationObserver for pulse effects with lazy event-based hydration
3. Add in-memory product fetch cache (short TTL) for repeated checkout flows
4. Pause non-critical polling when `document.hidden`
5. Improve transition handshake to avoid abrupt end on reload/direct open
6. Fix multi-cookie forwarding in storefront admin proxy
7. Remove clearly unused frontend file(s)

## High Impact Fixes (Planned This Iteration)
1. Storefront JS refactor-in-place for transition smoothness and runtime overhead
2. Storefront proxy robustness fix for `Set-Cookie`
3. CSS transition tuning and conflict-safe final overrides
4. Cleanup of obviously unused assets
5. Add reporting and documentation package for architecture/performance/SEO/security/analytics

## Risky Zones Requiring Extra Caution
- Payment creation endpoints (`/api/payments/:provider/create`)
- Activation/redeem endpoints (`/api/orders/:orderId/activation*`)
- Promo validation logic and price rendering paths
- Admin auth cookies and `/api/admin/*` proxy behavior
- Cart/promo state persistence in `localStorage`

