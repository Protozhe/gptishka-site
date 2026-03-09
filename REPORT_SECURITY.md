# REPORT_SECURITY

## Ключевые риски и статус

### Критичный контур (оплата/активация) — сохранен
- Бизнес-логика checkout/payment/activation не изменялась.
- Proxy-путь до admin-backend сохранен, внесены только безопасные инфраструктурные улучшения.

### Исправленные риски

1) Некорректная передача множественных cookie в proxy
- Файл: `server.js`
- Риск: при проксировании auth/admin-ответов мог теряться один из `Set-Cookie`.
- Исправление: передача массива cookie (`getSetCookie()` + fallback).
- Критичность: **High** (сессионная стабильность/админ-доступ).

2) Отсутствие явного noindex для техстраниц оплаты
- Файлы: `server.js`, `robots.txt`
- Риск: индексация промежуточных URL и раскрытие технических шагов в выдаче.
- Исправление: `X-Robots-Tag` + `Disallow`.
- Критичность: **Medium** (SEO/privacy hygiene).

3) Избыточная фронтовая нагрузка (косвенный reliability риск)
- Файлы: `assets/js/app.js`, `assets/js/app.min.js`
- Риск: лишние наблюдатели/таймеры ухудшают responsiveness на слабых устройствах.
- Исправление: lazy-hydration и visibility-aware polling.
- Критичность: **Medium**.

## Что проверено дополнительно
- `server.js`: `helmet`, `compression`, rate-limit на `/api`, `x-powered-by` отключен.
- Admin backend: присутствуют CORS + origin checks + zod-validation + rate-limit + webhook signature checks.
- Явных `eval/new Function/document.write` не обнаружено.

## Оставшиеся зоны внимания
1. CSP сейчас отключен на storefront (`helmet({ contentSecurityPolicy: false })`).
   - Статус: осознанно оставлено из-за внешней аналитики/виджетов.
   - Риск: **Medium**.
2. На фронте есть участки с `innerHTML`; для критичных путей используется экранирование, но нужен аудит по каждому источнику данных.
   - Риск: **Medium**.
3. Нет централизованной ротации секретов на уровне документации/процедур (операционный риск).
   - Риск: **Medium**.

## Что обязательно контролировать дальше
- Логи webhook и payment create errors.
- Retry/timeout политику внешних payment API.
- Подписи webhook (enot/lava) при каждом релизе.
- CORS/origin whitelist при изменении доменов admin UI.
- Периодический секрет-скан репозитория и окружений.
