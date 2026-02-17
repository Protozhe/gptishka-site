# GPTishka Admin Platform

Production-ready admin stack for digital goods operations. Existing storefront remains untouched. This adds a dedicated admin backend and modern SaaS-style dashboard.

## 1. Architecture

### High-level
- `Storefront`: existing static HTML/CSS/JS + current payment frontend flow.
- `Admin API`: `Node.js + Express + TypeScript + Prisma + PostgreSQL`
- `Admin UI`: `React + Vite + Tailwind + React Query + Recharts`
- `Auth`: JWT access token (15m) + refresh token (HTTP-only cookie)
- `RBAC`: `OWNER`, `ADMIN`, `MANAGER`, `SUPPORT`
- `Payments`: provider abstraction (`stub`, `webmoney`, `stripe` placeholder)
- `Observability`: request logs + audit logs + error logs

### Clean architecture layering (backend)
- `routes` -> HTTP wiring
- `controller` -> request/response orchestration
- `service` -> domain/business rules
- `repository` -> data access via Prisma
- `common` -> cross-cutting concerns (validation, security, errors)

## 2. Project structure

```txt
apps/
  admin-backend/
    prisma/
      schema.prisma
      seed.ts
    src/
      app.ts
      main.ts
      config/
      common/
      modules/
        auth/
        users/
        products/
        orders/
        payments/
        analytics/
        audit/
        notifications/
        promocodes/
        files/
  admin-ui/
    src/
      layout/
      pages/
      components/
      hooks/
      lib/

docker-compose.admin.yml
scripts/install-admin.ps1
scripts/install-admin.sh
```

## 3. DB schema

Tables (Prisma models):
- `roles`
- `users`
- `refresh_tokens`
- `products`
- `product_images`
- `orders`
- `order_items`
- `payments`
- `promo_codes`
- `audit_logs`

Indexes included for:
- auth (`users.email`, token expiry)
- products (`is_active`, `category`, timestamps)
- orders (`status`, `email`, `payment_id`, timestamps)
- analytics/reporting and audit (`created_at`, entity refs)

## 4. Security

Implemented:
- `helmet`
- `cors` with credentials
- global + auth-specific rate limit
- bcrypt password hashing
- JWT access/refresh token rotation
- refresh token revocation tracking
- Zod request validation
- RBAC middleware
- audit logs for product/order critical changes
- anti-fraud guard (order bursts from one IP)

## 5. API summary

Base URL: `/api/admin`

Auth:
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Products:
- `GET /products` (search/sort/filter/pagination)
- `GET /products/:id`
- `POST /products`
- `PUT /products/:id`
- `PATCH /products/:id/status`
- `PATCH /products/bulk/price`
- `POST /products/:id/images`
- `DELETE /products/:id`

Orders:
- `POST /orders/checkout` (external/public)
- `GET /orders`
- `GET /orders/:id`
- `PATCH /orders/:id/status`
- `POST /orders/:id/manual-confirm`
- `POST /orders/:id/refund`
- `GET /orders/export/csv`

Analytics:
- `GET /analytics/dashboard`

Audit:
- `GET /audit`

Users:
- `GET /users`
- `POST /users`

Promo codes:
- `GET /promocodes`
- `POST /promocodes`

Partners and earnings:
- `GET /partners`
- `POST /partners` (auto-creates and binds 1:1 promo code)
- `PUT /partners/:id`
- `GET /partner-earnings`
- `POST /partner-earnings/:id/mark-paid`

Public referral/payment API:
- `POST /api/promo/validate`
- `POST /api/orders/create`
- `POST /api/public/create-order`
- `POST /api/payments/enot/create`
- `GET /api/orders/:orderId` (public status for success page polling)
- `POST /api/webhooks/payment` (payment webhook with signature validation)

## 6. Admin UI features

- SaaS layout with sidebar
- Dark/light mode toggle
- Dashboard metrics + sales chart + top products
- Products table: search, quick enable/disable, archive, bulk price update
- Orders table: filters, status updates, refund action, CSV export
- Audit logs page
- Promo code management
- User management
- Skeleton loading components

## 7. Run locally

### Option A: local dev
1. `npm install`
2. Copy env files:
   - `apps/admin-backend/.env.example` -> `apps/admin-backend/.env`
   - `apps/admin-ui/.env.example` -> `apps/admin-ui/.env`
3. Start PostgreSQL (local or docker)
4. Backend DB setup:
   - `npm run prisma:generate --workspace @gptishka/admin-backend`
   - `npm run prisma:migrate --workspace @gptishka/admin-backend` (or apply migrations via `prisma migrate deploy`)
   - `npm run seed --workspace @gptishka/admin-backend`
5. Run services:
   - `npm run dev:admin:api`
   - `npm run dev:admin:ui`

### Option B: one-step script
- PowerShell: `./scripts/install-admin.ps1`
- Bash: `./scripts/install-admin.sh`

### Option C: Docker
1. Create `apps/admin-backend/.env`
2. `docker compose -f docker-compose.admin.yml up --build`

## 8. Seed credentials

- Owner: `owner@gptishka.local` / `OwnerPass!123`
- Admin: `admin@gptishka.local` / `AdminPass!123`
- Manager: `manager@gptishka.local` / `ManagerPass!123`
- Support: `support@gptishka.local` / `SupportPass!123`

## 9. Payment abstraction extension

Current provider selection via `PAYMENT_PROVIDER` env and factory:
- `stub`
- `webmoney`
- `stripe` (placeholder integration)

To add a new provider (e.g. YooKassa, crypto, Telegram Payments):
1. Implement `PaymentProvider` interface.
2. Register in `payment.factory.ts`.
3. Keep existing order/payment services unchanged.

## 10. Notes for production hardening

Recommended next steps:
- move tokens to Redis for centralized revocation
- add OpenTelemetry + structured logger (pino)
- add S3 storage driver for images
- add background workers for notifications/webhooks
- add E2E tests for auth/RBAC/order lifecycle
- add stricter CSP and HSTS

## 11. Referral program notes

- Partner ↔ Promo code relation is strict 1:1 (`PromoCode.partnerId` is unique).
- Order stores:
  - `subtotalAmount` as base price
  - `discountAmount`
  - `totalAmount` as final price
  - `promoCodeSnapshot`
  - `partnerId`
- On successful payment webhook:
  - order -> `PAID`
  - partner earning created once per order (`PartnerEarning.orderId` is unique)
- On refund/chargeback webhook:
  - order -> `REFUNDED`
  - earning -> `REVERSED`

Required env for payment/referrals:
- `PAYMENT_PROVIDER` (`gateway` in production)
- `ENOT_API_KEY` (preferred, alias of `PAYMENT_SECRET`)
- `ENOT_SHOP_ID` (preferred, alias of `PAYMENT_SHOP_ID`)
- `ENOT_WEBHOOK_SECRET` (preferred, alias of `WEBHOOK_SECRET`)
- `PAYMENT_SECRET` (legacy alias)
- `PAYMENT_SHOP_ID` (legacy alias)
- `WEBHOOK_SECRET` (legacy alias)
- `PAYMENT_API_BASE_URL`
- `PAYMENT_CREATE_PATH`
- `PAYMENT_REFUND_PATH`
- `PAYMENT_SUCCESS_URL`
- `PAYMENT_FAIL_URL`
- `PAYMENT_WEBHOOK_URL`
- `PAYMENT_WEBHOOK_SIGNATURE_HEADER`
- `PAYMENT_WEBHOOK_IP_ALLOWLIST` (recommended in production)

Checkout flow:
- Frontend sends `email + plan_id + promo_code + qty` to `POST /api/payments/enot/create`.
- Backend calculates final amount from server-side product/promo rules, creates order/payment, and calls Enot `invoice/create`.
- Frontend performs immediate redirect to returned `pay_url` (no iframe widget).
- Successful payment is confirmed only by webhook; `success.html` polls `GET /api/orders/:orderId`.
