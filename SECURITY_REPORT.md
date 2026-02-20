# SECURITY REPORT

## Stack & Scope
- Storefront: static HTML/CSS/JS + Node proxy (`server.js`).
- Backend API: Node.js + Express + Prisma/PostgreSQL (`apps/admin-backend`).
- Admin UI: React/Vite (`apps/admin-ui`).
- Payment provider: Enot (`/invoice/create`, `/invoice/info`, webhook endpoints).

## Top-10 Findings (and status)

1. **Webhook status downgrade / replay abuse**
- Location: `apps/admin-backend/src/modules/payments/payment-webhook.service.ts`
- Risk: repeated or late webhook with `failed` could overwrite already paid order state.
- Fix: added terminal-state guards (`PAID` accepts only `refunded`; `REFUNDED` immutable), duplicate-safe return.
- Status: **fixed**.

2. **No mandatory S2S verification before marking order as paid**
- Location: `apps/admin-backend/src/modules/payments/payment-webhook.service.ts`
- Risk: even validly signed payload should be confirmed with provider state.
- Fix: added `verifyGatewayInvoice()` call for `success` webhooks to validate order_id, status, amount, currency against provider `/invoice/info`.
- Status: **fixed**.

3. **Public activation/restart abuse could burn keys**
- Location: `apps/admin-backend/src/modules/orders/orders.service.ts`
- Risk: rapid calls could rotate CDK flow and abuse stock.
- Fix: added stricter restart gates (deny when `issued/processing/success`), cooldown, input limits, and orderId format validation.
- Status: **fixed**.

4. **Missing endpoint-specific rate limits on money-critical public APIs**
- Location: `apps/admin-backend/src/common/security/rate-limit.ts`, `public-enot.routes.ts`, `public-promocodes.routes.ts`, `public-orders.routes.ts`
- Risk: brute-force promo/activation/payment-init abuse.
- Fix: added dedicated rate limiters for checkout create, promo validate, activation endpoints.
- Status: **fixed**.

5. **Manual payment confirmation allowed MANAGER role**
- Location: `apps/admin-backend/src/modules/orders/orders.routes.ts`
- Risk: low-trust role could force unpaid orders to PAID.
- Fix: `manual-confirm` restricted to `OWNER/ADMIN`.
- Status: **fixed**.

6. **Promo could reduce amount to near-zero**
- Location: `apps/admin-backend/src/modules/payments/payments.service.ts`
- Risk: zero/near-zero payable orders.
- Fix: enforce minimal payable amount (`>= 1`) for validation and order creation.
- Status: **fixed**.

7. **Self-referral promo abuse**
- Location: `apps/admin-backend/src/modules/payments/payments.service.ts`
- Risk: owner using own referral promo for cashback arbitrage.
- Fix: block promo when `promo.ownerLabel` equals buyer email (best-effort heuristic with current schema).
- Status: **partially fixed** (full fix requires partner email/device model).

8. **Public order endpoints lacked orderId format hardening**
- Location: `apps/admin-backend/src/modules/orders/orders.service.ts`
- Risk: noisy enumeration/garbage payload abuse.
- Fix: added strict `orderId` format assertion before public status/activation operations.
- Status: **fixed**.

9. **Webhook replay protection by event id not explicit**
- Location: webhook flow (service-level)
- Risk: repeated payloads with same data.
- Current: protected by idempotent state guards and duplicate-success handling.
- Recommendation: persist processed webhook event IDs/nonces when provider sends deterministic unique event id.
- Status: **mitigated**.

10. **Affiliate anti-fraud heuristics limited**
- Location: referral flow
- Risk: multi-account/device farming.
- Current: only IP/order anti-fraud window + paid-only accrual.
- Recommendation: add partner email linkage, device fingerprint, velocity rules by email/device/partner.
- Status: **open recommendation**.

## Code Changes Implemented
- `apps/admin-backend/src/common/security/rate-limit.ts`
- `apps/admin-backend/src/modules/payments/public-enot.routes.ts`
- `apps/admin-backend/src/modules/promocodes/public-promocodes.routes.ts`
- `apps/admin-backend/src/modules/orders/public-orders.routes.ts`
- `apps/admin-backend/src/modules/payments/payment-webhook.service.ts`
- `apps/admin-backend/src/modules/payments/payments.service.ts`
- `apps/admin-backend/src/modules/orders/orders.service.ts`
- `apps/admin-backend/src/modules/orders/orders.routes.ts`

## Required Security Test Scenarios

1. **Frontend price tampering**
- Send `POST /api/payments/enot/create` with manipulated amount/qty/currency from client.
- Expected: server ignores client-side price; computes from DB product only.

2. **Replay activation / verify calls**
- Repeatedly call:
  - `POST /api/orders/:orderId/activation/start`
  - `POST /api/orders/:orderId/activation/restart-with-new-key`
- Expected: rate-limited; restart denied unless allowed state/cooldown.

3. **Forged webhook**
- Send webhook with invalid signature / mismatched amount.
- Expected: `401` for bad signature, `409/4xx` for provider mismatch; no PAID transition.

4. **Promo beyond limits**
- Use expired/inactive/over-limit promo or promo making total below minimum.
- Expected: validation false or `400`; order not created as discounted.

5. **Referral without payment**
- Attempt to trigger partner accrual without webhook-confirmed payment.
- Expected: no `partner_earning` accrual for unpaid orders.

## Residual Recommendations
- Add dedicated table for webhook event idempotency (`provider + event_id` unique).
- Add partner email in schema and strict self-referral block by buyer email.
- Add optional device fingerprint for anti-fraud and abuse analytics.
- Add 2FA for OWNER/ADMIN accounts in admin panel.

---

## Infrastructure Hardening Status (Server, 2026-02-19)

### Confirmed State
- **Service stack**: `nginx` + `pm2-root` + `postgresql@16-main` + `fail2ban`.
- **PM2 autostart**: restored and verified after reboot (`gptishka-storefront`, `gptishka-admin-api` online).
- **Ports**:
  - public: `22`, `80`, `443` only
  - internal app ports `4000/4100`: denied from outside by UFW
  - PostgreSQL listens on localhost only (`127.0.0.1`/`::1`).
- **Nginx hardening**:
  - TLS: `TLSv1.2 TLSv1.3`
  - security headers enabled
  - rate-limit headers present
  - HSTS enabled
- **Fail2ban** active jails:
  - `sshd`
  - `nginx-http-auth`
  - `nginx-botsearch`
- **Availability**:
  - `https://gptishka.shop` -> `200`
  - `https://admin-api.gptishka.shop` -> `200`

### Important Operational Note
- `pm2-root.service` is configured as `Type=oneshot`.
- After manual `pm2 kill`, use:
  - `systemctl restart pm2-root`
  - not only `systemctl start pm2-root` (service can stay `active (exited)` without re-running `ExecStart`).

## Verification Commands (Runbook)

```bash
pm2 list
ss -lntp | egrep ':4000|:4100|:5432'
curl -I https://gptishka.shop
curl -I https://admin-api.gptishka.shop
fail2ban-client status
ufw status verbose
systemctl status nginx --no-pager
systemctl status pm2-root --no-pager
```

## Weekly Checklist

```bash
# 1) Service health
pm2 list
systemctl is-active nginx pm2-root fail2ban postgresql

# 2) Perimeter
ufw status verbose
fail2ban-client status sshd
fail2ban-client status nginx-botsearch

# 3) Public response check
curl -I https://gptishka.shop
curl -I https://admin-api.gptishka.shop

# 4) Error spikes (last 200 lines)
tail -n 200 /var/log/nginx/error.log
```

## Monthly Checklist

```bash
# 1) Package updates (security first)
apt update
apt list --upgradable

# 2) TLS and nginx config sanity
nginx -t
grep -n "ssl_protocols\\|ssl_prefer_server_ciphers" /etc/nginx/nginx.conf

# 3) Backup verification
ls -lah /var/backups/gptishka | tail -n 20
test -x /usr/local/bin/gptishka-backup.sh && echo "backup script: OK"
```

## Residual Risks / Next Steps
- Keep password SSH login temporarily only if required by your ops process; migrate to SSH keys when ready.
- Add dedicated Nginx location rules to hard-drop scanner paths (`/wp-admin`, `/wp-login.php`, `/.env`, `/.git`) if not yet enabled in active site configs.
- Add alerting on:
  - repeated `502` from Nginx
  - fail2ban ban bursts
  - low disk space (`/`, backups partition).
