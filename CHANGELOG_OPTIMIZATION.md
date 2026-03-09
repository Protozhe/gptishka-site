# CHANGELOG_OPTIMIZATION

## 2026-03-09

### Architecture / Runtime
- Refactored storefront page transition handshake to intent-based flow.
- Added transition class cleanup on `pageshow`.
- Home gradient now initializes only where hero root exists.
- Pointer-follow disabled for coarse pointer / reduced motion.
- Replaced global pulse-button MutationObserver with lazy hydration.
- Added products payload dedupe cache + in-flight request reuse.
- Ticker/heartbeat polling made visibility-aware.
- Removed legacy dead cart quantity storage branch.

### UX / Motion
- Smoothed enter/leave transitions (timing + easing + amplitude).
- Kept resume activation CTA width constrained via final safety override.

### Analytics
- Added unified `trackAnalyticsEvent()` helper.
- Added funnel events: `checkout_start`, `payment_method_selected`, `checkout_redirect`, promo events, FAQ/support interactions.
- Added support widget events (`support_widget_open`, `support_widget_click`).

### SEO
- Added noindex headers for technical checkout/redeem/status URLs in `server.js`.
- Updated `robots.txt` with Disallow rules for technical pages.
- Rebuilt `sitemap.xml` with only indexable pages.
- Added/updated twitter card tags on home pages.

### Reliability / Security
- Improved admin proxy forwarding for multiple `Set-Cookie` headers.
- Added `Location` header forwarding in admin proxy responses.
- Increased production static cache window to 30d while preserving `no-store` for HTML.

### Cleanup
- Deleted unused assets:
  - `assets/js/reviews-feed.js`
  - `assets/css/sections.css`
  - `assets/css/sections.min.css`

### Validation
- `node --check` passed for updated JS/server files.
- `npm run build:admin:api` passed.
- `npm run build:admin:ui` passed.
- Internal HTML asset/link scan returned `TOTAL_MISSING=0`.
