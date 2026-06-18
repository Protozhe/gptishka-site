# Дизайн: конструктор товаров и service-страниц

Дата: 2026-06-19  
Статус: выбран подход 1 — DB-конфигурация service-страниц + универсальный публичный шаблон.

## Цель

Сделать в существующем разделе админки “Товары” ручной, понятный конструктор, через который можно:

- редактировать уже готовые страницы ChatGPT, Claude, SuperGrok и GPTishka VPN;
- создавать новые публичные страницы сервисов с собственным URL, цветом, hero-блоком, товарами и модальным окном;
- настраивать товар, варианты покупки и активации без лишних старых полей;
- не ломать существующие товары, оплату, промокоды, CDK/VPN/activation-логику и текущие страницы.

## Текущая архитектура

- Публичные страницы `chatgpt.html`, `claude.html`, `supergrok.html`, `store/vpn/index.html` сейчас являются статическими HTML-файлами.
- `assets/js/app.js` уже умеет рендерить service-конструктор на страницах с `[data-service-page]` и `[data-service-layout="constructor"]`.
- Публичные товары приходят из `/api/public/products`.
- Backend уже поддерживает:
  - `Product`;
  - `ProductVisualConfig` для карточки товара;
  - `ProductShowcaseSection` / `ProductShowcasePlacement` для витрины;
  - `activationVariants` для “Со входом” / “Без входа”;
  - `activationSiteUrl` у CDK-ключей и вариантов активации.
- `ProductsPage.tsx` уже частично содержит нужные поля, но интерфейс остается слишком техническим и не является полноценным конструктором страницы.

## Нецели

В этой задаче не нужно:

- переписывать checkout/payment заново;
- удалять старые поля из базы физически;
- ломать или переименовывать существующие URL;
- делать админку отдельным новым разделом с нуля;
- генерировать физические HTML-файлы из админки;
- переносить логику цены на клиент. Цена и метод активации по-прежнему должны проверяться backend-ом.

## Рекомендуемый подход

Добавить отдельную DB-сущность `ServicePage`, которая описывает публичную страницу сервиса, и связать ее с товарами через placement-связь.

Публичный сайт получает конфигурацию service-страницы из backend-а и рендерит универсальный шаблон. Существующие страницы сохраняют свои URL и постепенно читают настройки из той же конфигурации.

## Модель данных

### `ServicePage`

Хранит настройки публичной страницы:

- `id`
- `slug` — публичный URL-ключ, например `chatgpt`, `claude`, `supergrok`, `midjourney`
- `path` — итоговый путь, например `/chatgpt`, `/store/vpn`, `/midjourney`
- `serviceKey` — стабильный ключ для JS/modal logic, например `chatgpt`, `claude`, `grok`, `vpn`, `custom-midjourney`
- `title`
- `titleEn`
- `heroEyebrow`
- `heroTitle`
- `heroDescription`
- `heroVideoUrl`
- `heroImageUrl`
- `heroLogoUrl`
- `theme`
- `accentColor`
- `accentGradient`
- `darkOverlay`
- `greenOrColorOverlay`
- `constructorTitle`
- `constructorDescription`
- `infoSections` JSON
- `faqItems` JSON
- `paymentCaptionLava`
- `paymentCaptionEnot`
- `isActive`
- `isIndexed`
- `sortOrder`
- `createdAt`
- `updatedAt`

### `ServicePageProductPlacement`

Связывает service-страницу и товары:

- `id`
- `servicePageId`
- `productId`
- `sortOrder`
- `isActive`
- `isPinned`
- `createdAt`
- `updatedAt`

Ограничение: `@@unique([servicePageId, productId])`.

### `Product`

В сам `Product` не нужно добавлять много новых page-полей. Товар остается товаром: название, описание, цена, варианты покупки, методы активации, визуал карточки. Привязка к публичной странице идет через `ServicePageProductPlacement`.

## Backend API

### Admin endpoints

Добавить модуль `service-pages`:

- `GET /api/admin/service-pages`
- `GET /api/admin/service-pages/:id`
- `POST /api/admin/service-pages`
- `PUT /api/admin/service-pages/:id`
- `PATCH /api/admin/service-pages/:id/status`
- `DELETE /api/admin/service-pages/:id`
- `POST /api/admin/service-pages/:id/products`
- `PUT /api/admin/service-pages/placements/:id`
- `DELETE /api/admin/service-pages/placements/:id`

Права: как у товаров/showcase: OWNER/ADMIN/MANAGER для чтения и редактирования, удаление только OWNER/ADMIN.

### Public endpoints

Добавить:

- `GET /api/public/service-pages`
- `GET /api/public/service-pages/:slug`

Ответ `GET /api/public/service-pages/:slug` должен возвращать:

- `page` — настройки страницы;
- `products` — товары этой страницы, развернутые через текущую публичную product-логику, включая `activationVariants`;
- `theme` — нормализованные theme tokens для фронта;
- `meta` — title/description/canonical для шаблона.

## Публичный frontend

### Универсальный шаблон

Добавить `service.html` или аналогичный шаблон, который содержит ту же структуру, что текущие страницы ChatGPT/Claude/Grok/VPN:

- header;
- hero с видео/картинкой/overlay;
- constructor-блок тарифов;
- информационные блоки;
- FAQ;
- payment modal контейнер;
- подключение `app.min.js`.

Шаблон получает `data-service-page` из URL или из серверной подстановки.

### Роутинг

В `server.js`:

- сохранить явные маршруты `/chatgpt`, `/claude`, `/supergrok`, `/store/vpn`;
- добавить безопасный dynamic route для новых service-страниц;
- dynamic route должен сначала проверить, существует ли активная `ServicePage` в backend-е;
- если страницы нет, отдавать текущий fallback/404 без перехвата системных URL.

Для существующих страниц:

- `/chatgpt`, `/claude`, `/supergrok`, `/store/vpn` остаются рабочими;
- их статический HTML можно оставить как fallback;
- JS должен уметь подхватывать `ServicePage` конфиг и обновлять hero/info/FAQ/theme без ломки текущей верстки.

### Modal logic

Текущую доведенную модалку не переписывать. Нужно обобщить ее конфигурацию:

- `displayName`;
- тема/цвет;
- какие account-поля показывать;
- какие инструкции показывать для “Без входа”;
- payment captions;
- поведение после оплаты:
  - `activation` → переход в `redeem-start`;
  - `vpn` → выдача VLESS;
  - `manual_login` → заявка менеджеру;
  - `support` / `support_claude` → существующие инструкции.

Для неизвестных новых сервисов используется generic modal на базе текущей AI/VPN модалки.

## Админка: `ProductsPage`

Форма товара становится конструктором одной страницей.

### 1. Основа товара

Оставить:

- Название RU
- Название EN
- Категория
- Описание RU/EN
- Срок RU/EN
- Активен / выключен

Спрятать из основного интерфейса:

- выбор плашки;
- PNG-иконку товара;
- загрузку PNG-иконки;
- удаление PNG-иконки;
- настройки выравнивания текста;
- шумные legacy-поля.

Старые поля не удалять из базы и не чистить у существующих товаров.

### 2. Страница сервиса

Новый блок внутри формы товара:

- выбрать существующую страницу сервиса;
- создать новую страницу сервиса прямо из формы;
- URL страницы;
- service key;
- тема:
  - ChatGPT/emerald;
  - Claude/orange;
  - Grok/black;
  - VPN/dark-blue;
  - custom;
- hero label;
- hero title;
- hero description;
- hero video URL;
- hero image/logo URL;
- overlay intensity;
- показывать товар на этой странице;
- порядок товара на странице.

### 3. Визуал карточки

Оставить `ProductVisualConfig`, но сделать интерфейс проще:

- заголовок карточки;
- описание карточки;
- картинка;
- hover-картинка;
- фон карточки;
- текст кнопки;
- показывать карточку.

`buttonStyle` не показывать как raw-поле. Цвет кнопок должен идти из темы страницы.

### 4. Варианты покупки

Сохранить текущую модель:

- “Со входом”
  - включен/выключен;
  - цена;
  - метод активации: manual login / credentials.
- “Без входа”
  - включен/выключен;
  - цена;
  - метод активации: CDK / support / Claude token / VPN;
  - сайт активации для CDK.

Правило: CDK-ключи должны использоваться строго по товару и сайту активации. Если товар ChatGPT Plus куплен, ключ ChatGPT Go не должен уйти в заказ.

### 5. Модальное окно

Блок предпросмотра и настроек:

- тип модалки;
- какие поля показываются;
- подписи LAVA/ENOT;
- инструкция после оплаты;
- поведение для `activation`, `vpn`, `manual_login`, `support`.

По умолчанию использовать текущий правильный UX, который уже сделан для ChatGPT/Claude/Grok/VPN.

### 6. Дополнительно

Свернутый блок для технических настроек:

- tags;
- fallback delivery type;
- старые legacy-настройки;
- raw JSON только если реально нужен администратору.

## Backfill существующих страниц

Создать записи `ServicePage`:

- ChatGPT → `/chatgpt`, emerald theme;
- Claude → `/claude`, orange theme;
- SuperGrok → `/supergrok`, black theme;
- GPTishka VPN → `/store/vpn`, dark-blue theme.

Привязать существующие товары к страницам по текущим эвристикам:

- title/tags/category для ChatGPT;
- title/tags/category для Claude;
- title/tags/category для Grok/SuperGrok;
- delivery type/tags/title для VPN.

Backfill должен быть идемпотентным: повторный запуск не должен плодить дубли.

## Миграция и совместимость

- Все новые поля должны быть nullable/default-safe.
- Старые товары без `ServicePage` продолжают работать через `/api/public/products` и витрину.
- Старые статические страницы остаются fallback-ом.
- Checkout всегда проверяет цену и delivery/activationVariant на backend-е.
- CDK/VPN/payment logic не переписывается, только получает более точную конфигурацию.

## Тестирование

Backend:

- создание/обновление `ServicePage`;
- привязка товара к странице;
- public endpoint возвращает только активные страницы и товары;
- existing public products не меняют контракт;
- activation variant price/delivery берутся из серверной конфигурации;
- CDK selection остается scoped по `productId/productKey` и `activationSiteUrl`.

Admin UI:

- форма товара открывается для старого товара без потери данных;
- создание нового товара с новой service-страницей;
- редактирование существующей service-страницы;
- лишние поля не отображаются в основном сценарии;
- “Дополнительно” сохраняет старые tags/legacy значения.

Storefront/browser:

- `/chatgpt` не регрессит;
- `/claude` не регрессит;
- `/supergrok` не регрессит;
- `/store/vpn` не регрессит;
- новый dynamic URL открывается;
- выбранный товар в constructor-card статичный, кнопка двигается отдельно;
- модалка открывается с правильной темой;
- “Без входа” не показывает логин/пароль;
- `activation` после оплаты ведет в `redeem-start`;
- `vpn` после оплаты выдает VLESS.

## Риски

- В `assets/js/app.js` уже много service-specific логики. Ее нужно расширять аккуратно, чтобы не сломать доведенные страницы.
- Dynamic route в `server.js` не должен перехватывать `/admin`, `/api`, `/store/vpn/activate`, `/payment`, `/success`, `/fail`, статические файлы и SEO-страницы.
- Админка сейчас имеет много несвязанных dirty-изменений в репозитории; реализацию нужно делать точечными патчами и не откатывать чужие изменения.
- Генерация физических HTML из админки не используется, чтобы не создавать проблемы деплоя и прав файловой системы.

## Критерии готовности

- В “Товары” появился конструктор одной страницей.
- Можно создать новый сервис с URL, темой, hero, товарами и модалкой.
- Можно настроить существующие ChatGPT/Claude/SuperGrok/VPN через тот же механизм.
- Лишний визуальный шум скрыт из основного сценария.
- Существующие товары и страницы работают как до изменений.
- Новая публичная service-страница открывается без ручного создания HTML-файла.
- Оплата, промокоды, CDK, VPN и activation-переходы проходят проверку.
