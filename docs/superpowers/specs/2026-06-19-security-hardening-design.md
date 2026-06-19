# GPTishka Security Hardening Design

Date: 2026-06-19

## Context

The goal is to harden the GPTishka storefront, admin UI, admin API, payment flows, activation flows, uploads, and production deployment without depending on Cloudflare. Cloudflare has been removed, and the current repository points to a production topology based on nginx, PM2, Node/Express, PostgreSQL, and a built React admin UI served from `admin/`.

The external repository `mukul975/Anthropic-Cybersecurity-Skills` is useful as a security workflow checklist. It is not a drop-in security package for this project. We will use its web application, API, IAM, vulnerability management, and operations coverage as audit guidance while keeping implementation aligned with the existing codebase.

Current relevant project facts:

- Storefront runs through `server.js` and proxies selected `/api/*` requests to the admin backend.
- Admin backend is `apps/admin-backend`, using Express, Prisma, JWT access tokens, refresh token cookies, CORS, Helmet, rate limits, webhook HMAC checks, and role middleware.
- Admin UI is `apps/admin-ui`, a React/Vite app built into the `admin/` folder for production.
- Deployment files indicate nginx in front of PM2 processes: `gptishka-storefront` on `127.0.0.1:4000` and `gptishka-admin-api` on `127.0.0.1:4100`.
- The working tree has many unrelated uncommitted changes, so implementation must be scoped and staged carefully.

## Recommended Approach

Use origin-first hardening as the primary approach:

- Harden nginx and PM2 assumptions in deploy documentation and config examples.
- Harden Express middleware and route-level behavior in the storefront and admin backend.
- Harden admin UI session handling and remove durable storage for admin access tokens.
- Harden uploads and dynamic rendering surfaces.
- Add tests and scripts that prevent regressions in security-sensitive behavior.

This approach does not require Cloudflare or another CDN/WAF. If a CDN/WAF is restored later, it becomes an additional outer layer, not a prerequisite for safety.

## Security Architecture

The hardened architecture has five layers:

1. Edge/reverse proxy layer.
   nginx owns HTTPS, HSTS, request body limits, sensitive path denial, upload execution denial, and coarse endpoint throttling where available.

2. Storefront layer.
   `server.js` owns storefront security headers, CSP, public API proxying, API rate limits, and normalization of responses that reach browsers.

3. Admin API layer.
   `apps/admin-backend` owns authentication, authorization, CSRF origin checks, webhook verification, payment state safety, upload validation, and audit logs.

4. Browser app layer.
   `apps/admin-ui` avoids persistent admin access tokens, uses short-lived in-memory access tokens, and relies on the existing httpOnly refresh cookie for session restoration.

5. Operations layer.
   Deployment checklists, secret scanning, dependency scanning, backup requirements, and security smoke tests keep production settings from drifting.

## Auth, Sessions, and Roles

Admin access token handling changes from persistent `localStorage` to memory-only storage in the React app. On page reload, the app calls `/api/admin/auth/refresh` using the existing httpOnly refresh cookie and receives a new short-lived access token.

Refresh cookies remain httpOnly, `secure` in production, `sameSite=lax`, path-scoped to `/api/admin/auth`, and backed by hashed refresh token records in the database.

The admin API should support session revocation:

- Current user logout revokes the current refresh token.
- "Logout all sessions" revokes all active refresh tokens for the current user.
- OWNER/ADMIN can revoke another user's active sessions after role checks.

Bootstrap admin registration is disabled by default. The `register-admin` endpoint should require an explicit production-safe env flag, in addition to the existing "no root users exist" guard. This prevents the endpoint from being accidentally reachable after initial provisioning.

Admin route protection is enforced by tests or a guard script:

- Every `/api/admin/*` route, except health/login/refresh/logout bootstrap exceptions, must require `requireAuth`.
- Mutating admin routes must have explicit role checks.
- Payment, user, role, credential, CDK, activation, and system operations must stay restricted to the narrowest existing role set.

Auth audit events are recorded without secrets:

- login success and failure
- refresh success and failure
- refresh token reuse or revoked-token use
- logout and logout-all
- user creation, role change, deactivation, and session revocation

2FA is part of the broader maximum-security roadmap, but it should be implemented as a separate slice after the session baseline is hardened. That slice needs UI, recovery codes, enrollment, reset policy, and support procedures.

## CSP, Dynamic Rendering, and XSS Surface

`server.js` currently disables Helmet CSP. Hardening introduces a project-specific CSP with a staged rollout:

1. Start in `Content-Security-Policy-Report-Only` mode.
2. Run smoke tests for homepage, product pages, checkout, payment redirects, activation pages, support widget, analytics, and admin.
3. Switch to enforcing CSP after violations are resolved.

Storefront CSP allows only known current needs:

- own origin for scripts, styles, images, media, fonts, and API calls
- configured admin API origin when different from the storefront
- known analytics and support integrations already used by the site
- payment provider redirect/connect targets where the browser must communicate directly

Admin CSP is stricter:

- `default-src 'self'`
- API connect only to the configured admin API origin or same-origin proxy
- images from self, uploads, data/blob only when needed
- no arbitrary remote scripts
- no `unsafe-inline` for scripts if the React build works without it

Dynamic HTML rendering is audited and stabilized:

- All API-derived values inserted through `innerHTML` must pass through escaping helpers.
- Prefer DOM APIs or React rendering where practical.
- Special review targets are products, showcase, service pages, ticker entries, order details, activation details, and support widget content.
- Admin UI must not use `dangerouslySetInnerHTML` unless a future change has an explicit sanitizer and test.

Activation and order tokens stored in browser storage are treated as sensitive. The first hardening pass reduces retention and clears tokens after success. A later server-side state migration can reduce reliance on `localStorage` further.

## Uploads and Static File Safety

User/admin uploads are restricted to raster image formats:

- allow `jpg`, `jpeg`, `png`, and `webp`
- deny `svg` for uploads
- keep repository-owned static SVG assets untouched

Upload handling validates both file extension and MIME type. Where feasible, image signatures are checked to reduce spoofed MIME risk.

Uploaded files are served with safe headers:

- `X-Content-Type-Options: nosniff`
- conservative `Cache-Control`
- no script execution from upload directories
- `Content-Disposition` for ambiguous or future non-image file types

nginx and Apache examples both document upload execution denial. The active target is nginx, but `.htaccess` remains useful for fallback deployments.

## Public API, Payments, and Activation Flows

Endpoint-specific rate limits protect public flows:

- checkout/order creation
- promo validation
- order status reads
- activation token validation
- activation start/restart
- account magic links
- Telegram webhooks
- admin auth login and refresh

Payment webhook safety remains layered:

- raw body parsing before JSON parsing
- provider-specific HMAC verification
- provider server-to-server verification before marking payment as paid
- terminal-state guards so late or replayed webhooks cannot downgrade paid/refunded orders

Webhook idempotency is made explicit:

- If the provider sends a stable event id, persist `provider + event_id` with a unique constraint.
- If no stable event id is available, persist a fingerprint of provider, order id, normalized status, payload hash, and a time window.
- Duplicate webhook events return a safe duplicate response and do not repeat side effects.

Webhook IP allowlists:

- Enot IP allowlist is required in production when provider IPs are known.
- Lava can remain signature-first if stable provider IPs are not available, with clear documentation.

Provider and payment errors are normalized:

- User-facing responses avoid provider secrets, raw signatures, API keys, and internal stack traces.
- Logs avoid tokens and payment secrets.
- Payment diagnostics retain enough context for support and reconciliation.

## Operations and Production Checklist

The production checklist assumes nginx plus PM2:

- PM2 processes bind only to `127.0.0.1`.
- nginx is the only public HTTP entry point.
- HTTPS is enabled with Let's Encrypt or equivalent.
- HSTS is enabled after confirming HTTPS stability.
- nginx denies hidden files, repository metadata, env files, backups, data files, and direct access to app internals.
- nginx sets request body limits for normal pages, APIs, and uploads.
- nginx denies script execution from upload directories.
- Firewall exposes only SSH, HTTP, and HTTPS.
- Backups are taken before deploy: PostgreSQL, `data/`, and `apps/admin-backend/uploads/`.
- `nginx -t`, PM2 health, admin health, public products, checkout, and webhook smoke checks run after deploy.

Operational scans become part of release readiness:

- dependency audit for root and workspaces
- secret scan with ignored generated artifacts and test fixtures
- route auth guard checks
- CSP header checks
- upload rejection checks
- webhook bad-signature checks

## Testing Strategy

Add focused tests and scripts proportional to the security risk:

- Unit tests for token/session helpers and bootstrap flag behavior.
- Route guard test or script that verifies admin routers require authentication.
- Upload tests for allowed raster formats and denied SVG.
- Webhook tests for invalid signature, duplicate event, provider mismatch, and terminal-state handling.
- Header tests for CSP, HSTS-ready security headers, nosniff, and admin no-store behavior.
- Static scan script for `dangerouslySetInnerHTML`, unsafe admin token storage, and new `innerHTML` uses in sensitive files.

Manual smoke tests cover:

- login, refresh after reload, logout, logout-all
- admin route access without token
- product list and checkout
- payment redirect creation
- invalid webhook rejection
- activation status and activation start
- uploaded image display
- admin UI load under CSP
- storefront pages under CSP report-only and enforcement

## Rollout Plan

Implementation should be split into small, reversible slices:

1. Add guard tests and security scan scripts first.
2. Harden admin token storage and bootstrap registration.
3. Harden uploads by denying SVG uploads and adding tests.
4. Add CSP in report-only mode and document expected external sources.
5. Fix CSP violations and move to enforcement.
6. Add explicit webhook idempotency.
7. Add route/session/audit improvements.
8. Update nginx/PM2 production checklist.
9. Run full verification and document residual risks.

## Residual Risks

Some risks cannot be fully closed from repository code alone:

- VPS firewall and nginx live config require server access.
- Existing production secrets must be rotated manually if they were ever exposed.
- Provider IP allowlists depend on current provider documentation.
- 2FA needs a dedicated implementation and recovery process.
- Existing customer/order activation tokens may already be present in browser storage on customer devices until naturally cleared.

These risks are documented so they can be handled during deployment and follow-up work.
