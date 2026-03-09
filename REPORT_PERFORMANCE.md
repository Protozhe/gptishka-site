# REPORT_PERFORMANCE

## Что тормозило до правок
- `assets/js/app.js` и `assets/js/app.min.js` содержали много always-on логики на всех страницах.
- Переходы между страницами запускались не только при осознанной навигации, из-за чего визуально ощущались резкими.
- Градиентный интерактив и pointer-follow запускались даже там, где hero-блок отсутствует.
- Для pulse-эффекта кнопок использовался глобальный `MutationObserver` по `body`.
- В checkout-пути было повторное получение `/api/public/products` в одной сессии.
- Тикер/heartbeat продолжали интервальные работы в фоне без оптимальной паузы по `visibility`.
- В проекте были неиспользуемые фронтовые ассеты (`reviews-feed.js`, `sections.css`, `sections.min.css`).

## Что исправлено

### 1) Снижение runtime-нагрузки фронтенда
Файлы:
- `assets/js/app.js`
- `assets/js/app.min.js`

Изменения:
- `initHomeGradientBackground()` теперь активируется только при наличии `[data-hero-react-root]`.
- Pointer-follow отключается на coarse-pointer и `prefers-reduced-motion`.
- Pulse-beam: удален глобальный `MutationObserver`; внедрена ленивая гидратация по `mouseover`/`focusin`.
- Добавлен dedupe/TTL-кеш (`PRODUCTS_CACHE_TTL_MS`) для `/api/public/products`.
- Polling тикера/heartbeat переведен в visibility-aware режим (пауза в фоне, восстановление при возврате вкладки).

Ожидаемый эффект:
- Меньше main-thread работы на страницах без hero.
- Меньше лишних наблюдателей DOM.
- Меньше повторных network-запросов в сценарии выбора тарифа/оплаты.

### 2) Сглаживание page transitions
Файлы:
- `assets/js/app.js`
- `assets/js/app.min.js`
- `assets/css/unified-premium.css`

Изменения:
- Переходы запускаются по флагу intent (`sessionStorage`) только после внутреннего клика-навигации.
- Вычищаются `is-leaving/is-entering/is-entering-active` на `pageshow`.
- Синхронизированы тайминги JS/CSS и смягчены кривые easing.
- Уменьшен амплитудный сдвиг и ослаблен leave-fade для устранения "обрыва" в конце.

Ожидаемый эффект:
- Существенно более мягкое ощущение переходов без визуального рывка.

### 3) Очистка неиспользуемых ресурсов
Удалено:
- `assets/js/reviews-feed.js`
- `assets/css/sections.css`
- `assets/css/sections.min.css`

Проверка:
- Поиск ссылок в проекте показал `TOTAL_MISSING=0` и отсутствие ссылок на удаленные файлы.

### 4) Кэш и статическая выдача
Файл:
- `server.js`

Изменения:
- Static cache `maxAge` увеличен до `30d` для production (HTML по-прежнему `no-store`, благодаря `setHeaders`).
- Добавлен проксируемый `Location` и корректная передача множественных `Set-Cookie`.

Ожидаемый эффект:
- Более агрессивный cache-hit по статике (css/js/img/fonts) без риска stale HTML.

## Проверки после изменений
- `node --check assets/js/app.js` — OK
- `node --check assets/js/app.min.js` — OK
- `node --check assets/js/support-widget.js` — OK
- `node --check server.js` — OK
- `npm run build:admin:api` — OK
- `npm run build:admin:ui` — OK
- Скан внутренних ссылок/ассетов: `TOTAL_MISSING=0`

## Текущие ограничения (что осталось)
- `assets/css/unified-premium.css` остается крупным (4124 строки, ~118.6 KB).
- `assets/js/app.js` остается монолитным (2508 строк, ~102.3 KB).
- В `@gptishka/admin-ui` бандл JS остается крупным (Vite warning > 500kB chunk).

## Что даст наибольший следующий прирост
1. Разбить `app.js` на модули (ticker/checkout/modals/navigation) с lazy-init по странице.
2. Для admin-ui внедрить manualChunks и route-based code-splitting.
3. Провести targeted CSS-pruning `unified-premium.css` по usage-map (без ломки визуала).
