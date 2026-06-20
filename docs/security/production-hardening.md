# GPTishka Production Security Checklist

Target topology: nginx public edge, PM2 private Node processes, PostgreSQL on private interface, no Cloudflare dependency.

## Network

- Only ports 22, 80, and 443 are public.
- `gptishka-storefront` binds to `127.0.0.1:4000`.
- `gptishka-admin-api` binds to `127.0.0.1:4100`.
- PostgreSQL binds to localhost or private network only.

## nginx

- Run `nginx -t` before reload.
- Redirect HTTP to HTTPS.
- Enable HSTS after HTTPS is confirmed stable.
- Set `client_max_body_size 8m` for normal routes and no more than `20m` for admin uploads.
- Deny `.env`, `.git`, backups, `data/`, `apps/`, `includes/`, and generated archives.
- Deny script execution in upload directories.
- Proxy `X-Forwarded-Proto`, `X-Forwarded-For`, and `Host`.

## PM2

- Use `pm2 startOrReload ecosystem.config.js --update-env`.
- Run `pm2 save` after successful reload.
- Check `pm2 status` and `pm2 logs --lines 100` after deploy.

## Application

- `NODE_ENV=production`.
- `CSP_REPORT_ONLY=true` for first deploy after CSP changes.
- Change `CSP_REPORT_ONLY=false` only after storefront and admin smoke tests pass.
- `ADMIN_BOOTSTRAP_REGISTRATION_ENABLED=false` except during the first controlled bootstrap window.
- `PAYMENT_WEBHOOK_IP_ALLOWLIST` is set when Enot publishes stable source IPs.
- JWT and payment secrets are unique production values with at least 32 random characters.

## Verification

- `npm run test:security`
- `npm run build:admin:api`
- `npm run build:admin:ui`
- `npm run security:scan`
- `curl -I https://gptishka.shop`
- `curl -s https://admin-api.gptishka.shop/api/admin/health`
- Test admin login, reload, logout, and logout-all.
- Test checkout creation and payment redirect.
- Send an invalid-signature webhook and confirm rejection.
- Upload png/webp product images and confirm SVG is rejected.
