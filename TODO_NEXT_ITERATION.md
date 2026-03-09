# TODO_NEXT_ITERATION

## Priority 1 — Без риска для выручки
1. Разделить `assets/js/app.js` на модули (navigation, checkout, ticker, modal, analytics) и подключать по `data-page`.
2. Вынести общие API-обертки (`fetchJson`, retry/backoff, error normalization) для checkout/redeem/promo.
3. Добавить единый `checkout_error` telemetry event c `error_code` для аналитики отказов.

## Priority 2 — Performance
1. CSS usage-map для `assets/css/unified-premium.css` и удаление неиспользуемых селекторов без визуальной регрессии.
2. Проверка `backdrop-filter/blur` budget на mid/low-end mobile + degrade rules.
3. Для `apps/admin-ui` внедрить route-based splitting и `manualChunks`.

## Priority 3 — SEO/CRO
1. Расширить контентные страницы под long-tail поисковые кластеры.
2. Доработать JSON-LD: FAQPage для FAQ-блоков и Product/Offer для тарифов.
3. Добавить автоматический post-deploy SEO smoke (canonical/hreflang/robots/sitemap).

## Priority 4 — Security/Operability
1. Ввести минимальный CSP в report-only, затем постепенный enforcement.
2. Формализовать ротацию payment/webhook/JWT секретов.
3. Добавить health endpoint и алерты на рост 4xx/5xx по checkout/activation маршрутам.

## Priority 5 — DX
1. Добавить `.env.example` для storefront и admin-backend.
2. Зафиксировать `npm run smoke:storefront` и `npm run smoke:admin`.
3. Добавить pre-commit hooks: линт, typecheck, базовые grep-checks по критичным строкам.
