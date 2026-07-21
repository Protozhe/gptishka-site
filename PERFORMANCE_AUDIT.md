# PERFORMANCE_AUDIT

Дата аудита: 2026-07-21

Проект: GPTishka (`gptishka-site`)

Исходный production commit: `c1f5a7b3642a970bfe4b5691489a12d42276c242`
Проверяемая страница: `https://www.gptishka.shop/` и локальный стенд `http://127.0.0.1:4170/`

## Область и ограничения аудита

- Код, дизайн, тексты, SEO, API, оплата и бизнес-логика не изменялись.
- Репозиторий был получен с production-сервера уже с большим количеством изменённых и неотслеживаемых файлов. Ничего из существующих изменений не сбрасывалось и не удалялось.
- Метрики Lighthouse собраны по три раза для mobile и desktop; ниже приведены медианы.
- Локальный стенд не может разрешить DNS-имя `admin-api.gptishka.shop`. Поэтому часть публичных данных локально берётся из встроенного fallback, а `/api/public/homepage-content` локально отвечает `502`. Для итоговой точки отсчёта дополнительно измерен настоящий production через основной домен.
- Реальная оплата и необратимые пользовательские действия не выполнялись.

## 1. Текущая архитектура проекта

### Публичный storefront

- Многостраничный HTML: `index.html`, `en/index.html`, страницы каталога, карточки сервисов, оплаты, активации и юридические страницы.
- Основной runtime: `assets/js/app.min.js` (фактически не минифицирован, 310 426 байт), его редактируемая копия `assets/js/app.js` полностью идентична.
- Дополнительные runtime-файлы: `analytics-init.js`, `hero-lite.js`, `home-promo-slider.js`, `support-widget.js`, `steam-topup.js`.
- Стили главной состоят из 10 отдельных stylesheet-запросов, включая Google Fonts и девять локальных CSS-файлов (`index.html:98-112`).

### Storefront server

- Node.js + Express: `server.js`.
- Отдаёт статику, HTML-маршруты, локальную SQLite-статистику/heartbeat и проксирует публичные и административные API.
- `compression()` включён в Express (`server.js:932`).
- Статика в production получает `Cache-Control: public, max-age=2592000`, HTML — `no-store` (`server.js:998-1008`, `server.js:2039-2044`).

### Admin API

- `apps/admin-backend`: TypeScript, Express, Prisma/PostgreSQL.
- Production entry: `apps/admin-backend/dist/main.js`.
- Содержит товары, витрину, пользователей, заказы, оплату, активацию, VPN и Telegram-интеграции.

### Admin UI

- `apps/admin-ui`: React 18, React Router, TanStack Query, Axios, Recharts, Tailwind, Vite 6.
- Production output: `apps/admin-ui/dist`.
- Уже используется route-based code splitting, но общий JS production-build всё ещё составляет около 857 КиБ до gzip.

### Production-инфраструктура

- Ubuntu, Nginx 1.24.0, PM2.
- Nginx проксирует HTML/API к storefront на `127.0.0.1:4000`.
- `/assets/` обслуживается Nginx напрямую из `/var/www/gptishka-new/assets/`.
- В Nginx есть только `gzip on;`; `gzip_types` закомментирован. Поэтому CSS и JavaScript из `/assets/` фактически отдаются без сжатия.
- SSL server block использует `listen 443 ssl;` без HTTP/2.

### Размер локальной production-копии

- Активные файлы без `.git`, `node_modules` и каталогов резервных копий: около 661 МБ.
- Из них около 548 МБ — установщики/архивы приложения в `assets/downloads/`. Они не входят в загрузку главной страницы, но увеличивают размер деплоя и backup.
- Активные изображения: около 31,2 МБ; видео: около 20,4 МБ.

## 2. Команды запуска и сборки

### Документированный production-процесс

```bash
npm ci
npm run build:admin:api
npm run build:admin:ui
npm run start:storefront
```

Для полного admin API дополнительно требуются PostgreSQL и корректный `apps/admin-backend/.env`.

### Команды, фактически выполненные в среде аудита

В доступной среде есть Node.js 24.14.0 и pnpm 11.9.0, но нет npm; проект документирован для Node.js 20+/npm 10+. Поэтому зависимости ставились локально без создания lock-файла, а сборки запускались через соответствующие CLI напрямую.

```powershell
# Storefront dependencies
pnpm install --lockfile=false --ignore-workspace

# Admin UI dependencies and build
pnpm install --lockfile=false --ignore-workspace
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build

# Admin API dependencies, Prisma Client and build
pnpm install --lockfile=false --ignore-workspace --ignore-scripts
node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
node node_modules/typescript/bin/tsc -p tsconfig.json
```

Результат:

- Admin UI build: успешно, 23 файла, 911 491 байт; JS — 877 381 байт, CSS — 31 592 байта.
- Крупнейшие UI chunks: `DashboardPage` — 390,32 КБ, основной `index` — 262,38 КБ.
- Admin API build: успешно, 126 JS-файлов, 812 954 байта.
- Storefront запускается локально на `127.0.0.1:4170`.
- Синтаксическая проверка `server.js` и основных storefront JS-файлов: успешно.
- Отдельных scripts `lint` и `test` в `package.json` нет; скрывать или отключать проверки не потребовалось.

## 3. Исходные показатели

### Production, медиана трёх Lighthouse 13.0.1 прогонов

| Метрика | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 53 | 57 |
| FCP | 6,77 с | 3,13 с |
| LCP | 53,68 с | 7,55 с |
| CLS | 0,00010 | 0,00021 |
| TBT | 186 мс | 0 мс |
| Speed Index | 8,91 с | 3,55 с |
| TTI | 53,99 с | 7,55 с |
| Запросы | 66 | 71 |
| Передано | 15,46 МиБ | 19,73 МиБ |
| Полный размер ресурсов | 15,71 МиБ | 19,98 МиБ |

Production LCP-элемент: активный `article.home-promo-slide` главного промо-слайдера. Lighthouse отмечает, что его фоновое изображение не обнаруживается напрямую в исходном HTML и не имеет `fetchpriority=high`.

Очень большое и нестабильное mobile LCP связано прежде всего с передачей 15 МБ изображений под мобильным throttling и поздней отрисовкой фонового изображения слайдера. Это подтверждается тремя значениями LCP: 42,95 с, 53,68 с и 63,46 с. Цифру нельзя трактовать как стабильное полевое значение INP/LCP, но она надёжно подтверждает критический сетевой bottleneck.

### Распределение production-трафика главной

| Тип | Mobile | Desktop |
| --- | ---: | ---: |
| Изображения | 14,28 МиБ | 18,55 МиБ |
| CSS | 522 КиБ | 522 КиБ |
| JavaScript | 473 КиБ | 473 КиБ |
| Шрифты | 75,8 КиБ | 75,8 КиБ |
| HTML | 11,2 КиБ gzip / 40,9 КБ исходно | 11,2 КиБ gzip / 40,9 КБ исходно |

### Локальный стенд, медиана трёх Lighthouse-прогонов

| Метрика | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 57 | 72 |
| FCP | 2,81 с | 0,86 с |
| LCP | 55,89 с | 8,46 с |
| CLS | 0,00006 | 0,00021 |
| TBT | 457 мс | 0 мс |
| Speed Index | 3,99 с | 1,49 с |
| Запросы | 59 | 59 |
| Передано | 11,40 МиБ | 11,40 МиБ |

Локальный HTML TTFB по пяти `curl`-прогонам: медиана 3,1 мс. Production HTML TTFB с учётом сети/TLS: медиана 595 мс. Lighthouse server-response-time на production: медиана 155 мс mobile и 139 мс desktop.

### Lighthouse opportunities

- Image delivery: потенциальная экономия около 12,0 МиБ mobile и 17,9 МиБ desktop.
- Render-blocking resources: потенциальная экономия около 4,76 с mobile и 1,99 с desktop.
- Unused JavaScript: около 232 КиБ на production, включая основной storefront runtime и Yandex Metrica.
- Unused CSS: около 374–386 КиБ на production.
- Main-thread work mobile: около 4,0 с; найдено до 14 long tasks в локальном mobile-прогоне.
- CLS уже находится в хорошем диапазоне на главной, но отсутствие размеров у изображений остаётся риском на других страницах и состояниях.

## 4. Основные источники нагрузки

### 4.1. Изображения главной

| Ресурс | Размер | Фактические размеры | Наблюдение |
| --- | ---: | ---: | --- |
| `assets/img/home/supergrok-promo-bg.png` | 2,16 МиБ | 2172×724 | LCP-фон, PNG RGB |
| `assets/img/home/topups-promo-bg.png` | 2,15 МиБ | 2172×724 | Загружается вместе со скрытым слайдом |
| `assets/img/services/chatgpt-card.png` | 1,96 МиБ | 1254×1254 | На главной запрашивается дважды из-за разных URL |
| `assets/img/home/ai-shortcut.png` | 1,64 МиБ | 1448×1086 | Отображается существенно меньше исходника |
| `assets/img/services/chatgpt-card-hover.png` | 1,02 МиБ | 1254×1254 | Hover-слой загружается до взаимодействия |
| `assets/img/logo-new-dark.png` | 31,2 КиБ | 980×208 | Отображается примерно 141×30 mobile |

`chatgpt-card.png` загружается как `/assets/img/services/chatgpt-card.png?v=20260622-header1` в шапке (`index.html:219`) и как `/assets/img/services/chatgpt-card.png` в карточке (`assets/js/app.min.js:3175`). Из-за разных URL браузер передаёт один и тот же файл дважды — около 3,92 МиБ вместо 1,96 МиБ.

Оба промо-фона прописаны в CSS (`assets/css/home-wide-marketplace.css:553`, `:591`), поэтому загружается и активный, и скрытый слайд.

### 4.2. Видео и GIF

- `assets/video/chatgpt-plans-bg.mp4` — 14,11 МиБ.
- На `chatgpt.html:99`, `claude.html:94`, `supergrok.html:94` и английских/части VPN-страниц используется `autoplay ... preload="auto"` без poster.
- `assets/video/hero-activation.mp4` — 6,26 МиБ; на главной корректно используется `preload="none"`, но `data-poster` не является нативным `poster` до выполнения JS.
- `assets/img/assistant-cat-left.gif` — 13,13 МиБ, 704×1280, 95 кадров. Он загружается позже через support widget, но остаётся очень тяжёлым ресурсом для сценария поддержки.

### 4.3. CSS и шрифты

- Главная блокируется девятью локальными CSS и Google Fonts (`index.html:98-112`).
- Наиболее крупные активные CSS: `home-stability-hotfix.css` — 196 331 байт, `unified-premium.css` — 141 611 байт, `home-wide-marketplace.css` — 72 437 байт.
- Lighthouse оценивает `home-stability-hotfix.css` как неиспользуемый на 96–97% на главной, `unified-premium.css` — на 68–71%. Автоматически удалять эти правила нельзя: в них есть динамические состояния, другие страницы и исторические overrides.
- Загружаются три семейства Google Fonts и несколько начертаний; реально на главной Lighthouse наблюдает четыре WOFF2-файла, около 76 КиБ. Внешний CSS/шрифты участвуют в render-blocking chain до ~0,9 с локально и дольше на production throttling.

### 4.4. JavaScript и сторонние скрипты

- `app.min.js` и `app.js` полностью идентичны, по 310 426 байт. Имя `.min.js` не соответствует содержимому.
- Lighthouse оценивает около 70% переданного `app.min.js` как неиспользуемое на первом экране.
- `analytics-init.js` загружается с `defer`, но сразу после разбора DOM запускает Yandex Metrica и Mail.ru. Вместе они передают около 140 КиБ и занимают примерно 140–186 мс main thread в Lighthouse.
- `app.min.js:315-414` через 1,6 с начинает prefetch до семи HTML-маршрутов и через 4,4 с прогревает products API. Это конкурирует с тяжёлыми изображениями на медленной сети.
- Тикер запускает `/api/stats` сразу и каждые 15 с, heartbeat — сразу и каждые 20 с (`app.min.js:6563-6566`, `:6911-6918`). Пауза в скрытой вкладке уже реализована корректно (`:6940-6945`). За длинный Lighthouse-прогон наблюдалось до семи stats и пяти heartbeat обращений; их вес мал, но они создают постоянную нагрузку.
- Промо-слайдер обновляется каждые 6,2 с (`home-promo-slider.js:4`, `:202`) и перерисовывается из `/api/public/homepage-content`.

### 4.5. Сервер и сеть

- Production Nginx отдаёт HTML/API через gzip, но CSS и JS из `/assets/` без `Content-Encoding`.
- Пример: `home-stability-hotfix.css` передаётся как 196 331 байт, `app.min.js` — 310 426 байт. На локальном Express тот же `app.min.js` занимает около 64,8 КиБ transfer благодаря gzip.
- Production использует HTTP/1.1. При 10 CSS и десятках изображений отсутствие HTTP/2 увеличивает цену параллельных запросов.
- Статические файлы имеют 30-дневный cache и ETag, но не `immutable`. Это правильно для части нехешированных имён, однако query-versioning применяется непоследовательно.

### 4.6. Разметка изображений

- В 61 активном HTML-файле найдено 280 тегов `<img>`.
- 259 изображений не имеют HTML-атрибутов `width` и `height`.
- 196 изображений используют `loading="lazy"`.
- На самой главной в runtime наблюдалось 13 `<img>`, у 11 отсутствовали `width` и `height`.
- Текущий CLS главной низкий благодаря CSS-размерам, но другие страницы и динамические состояния остаются уязвимыми к layout shift.

## 5–8. Таблица проблем, влияние, риск и приоритет

| Приоритет | Проблема | Где находится | Подтверждение | Влияние | Риск | Предлагаемое решение |
| ---: | --- | --- | --- | --- | --- | --- |
| P0 | Критически тяжёлые PNG главной | `assets/img/home/*`, `assets/img/services/*`, `index.html`, `home-wide-marketplace.css` | 14,28–18,55 МиБ изображений; Lighthouse savings 12–18 МиБ | Критическое | Средний | Создавать оптимизированные WebP/AVIF/responsive-варианты по одному ресурсу, сохраняя оригинал/fallback, размеры, прозрачность и композицию |
| P0 | Один `chatgpt-card.png` скачивается дважды | `index.html:219`, `app.min.js:3175`, API/fallback витрины | Два запроса по 2 055 197 байт с разными query URL | Высокое | Низкий | Выбрать единый versioned URL для шапки и карточки; проверить runtime/API fallback и обе языковые версии |
| P0 | CSS/JS `/assets/` не сжимаются Nginx | `/etc/nginx/nginx.conf`, location `/assets/` | Live headers без `Content-Encoding`; CSS 522 КиБ и JS 473 КиБ transfer | Высокое | Низкий | В отдельном серверном изменении включить `gzip_types text/plain text/css application/json application/javascript image/svg+xml;`, `gzip_vary on`, затем `nginx -t` и проверка curl |
| P0 | Скрытый промо-слайд сразу загружает второй фон | `home-wide-marketplace.css:553`, `:591`, `home-promo-slider.js` | Два PNG по ~2,15 МиБ приходят до взаимодействия | Высокое | Средний | Активный фон оставить eager/LCP, следующий подгружать перед первым переключением; не менять interval/анимацию/дизайн |
| P0 | Блокирующая цепочка из 10 CSS | `index.html:98-112` | Lighthouse savings 4,76 с mobile / 1,99 с desktop | Высокое | Средний–высокий | Сначала построить page usage map; выносить только доказанно некритичные page-specific стили без изменения порядка критического каскада |
| P1 | `app.min.js` не минифицирован и монолитен | `assets/js/app.js`, `assets/js/app.min.js` | 310 426 байт каждый; ~70% не используется на первом экране | Высокое | Средний | Сначала добавить воспроизводимую минификацию без изменения source; затем отдельно page-gated initialization/code splitting |
| P1 | Видео 14,1 МиБ с `preload="auto"` на сервисных страницах | `chatgpt.html:99`, `claude.html:94`, `supergrok.html:94`, EN/VPN аналоги | Один и тот же MP4 автоматически загружается на множестве страниц | Высокое | Средний | Подготовить poster; тестировать `preload="metadata"`/`none` и запуск при viewport без изменения autoplay-вида после готовности |
| P1 | Тяжёлый GIF поддержки | `assets/img/assistant-cat-left.gif`, `support-widget.js` | 13,13 МиБ, 95 кадров | Высокое в сценарии поддержки | Средний | Сделать WebM/animated WebP fallback-пару, загружать только при показе виджета, сравнить анимацию кадр-в-кадр |
| P1 | Непоследовательные URL/version query | HTML, JS, API payload | Одинаковые файлы обходят кеш как разные URL | Среднее–высокое | Низкий | Инвентаризировать фактические URL и унифицировать их без изменения публичных URL страниц |
| P1 | Ранний prefetch маршрутов | `app.min.js:315-414` | До семи HTML prefetch начиная с 1,6 с плюс products API в 4,4 с | Среднее на медленной сети | Низкий–средний | Перенести warmup после завершения критической загрузки/первого взаимодействия, сохранить save-data/2G guard |
| P1 | Ранняя аналитика | `analytics-init.js`, `index.html:4` | ~140 КиБ third-party и до ~186 мс main thread | Среднее | Средний | Отдельно проверить события; инициализировать после load/idle, не теряя pageView/ecommerce/click events |
| P2 | 259 изображений без `width`/`height` | 61 HTML-файл и динамический `createElement("img")` | Статический инвентарь; 11 из 13 на главной | Среднее, прежде всего CLS | Низкий | Добавлять точные intrinsic dimensions небольшими page-specific пакетами; не менять CSS-размеры |
| P2 | Polling stats/heartbeat | `app.min.js:6563-6953`, `server.js:1848-1963` | 15/20 с; повторные запросы видны в длинных прогонах | Низкое для веса, среднее для сервера | Низкий–средний | Сохранить visibility pause; добавить AbortController/backoff и не запускать параллельные запросы после доказательства необходимости |
| P2 | HTTP/2 не включён | Nginx SSL server block | Nginx 1.24: `listen 443 ssl;`, директивы http2 нет | Среднее | Низкий–средний | Отдельно протестировать `listen 443 ssl http2;`, `nginx -t`, ALPN и smoke-check всех доменов |
| P3 | Резервные/временные файлы находятся внутри публичного static root | `_tmp_*`, `*.bak*`, `admin.old`, `admin.prev`, локальные backups | `express.static(__dirname)` обслуживает весь корень, кроме dotfiles | Низкое для page load, высокое для размера/риска публикации | Средний | Ничего не удалять автоматически; сначала карта ссылок, allowlist публичных директорий и отдельный backup вне web root |

## 9. План работ по этапам

1. **Зафиксировать дизайн**: скриншоты 375/768/1440 для главной, каталога, карточек, RU/EN и интерактивных состояний; создать `VISUAL_REGRESSION_CHECK.md`.
2. **Изображения главной, один ресурс/коммит**: сначала устранить двойную загрузку `chatgpt-card.png`, затем оптимизировать карточку и hover, затем оба promo background с отдельным сравнением.
3. **Сжатие Nginx**: подготовить и проверить gzip-конфигурацию отдельно; не смешивать с изменениями изображений или кода.
4. **Видео/GIF**: отдельно сервисный hero-video, отдельно activation video, отдельно support GIF. Проверять poster, autoplay, controls и мобильное поведение.
5. **CSS**: построить usage map по страницам и динамическим классам. Начать с page-specific загрузки; не запускать автоматический purge без safelist.
6. **JavaScript**: добавить воспроизводимую минификацию; затем последовательно отделять warmup, ticker, checkout и modal initialization.
7. **Шрифты и third-party**: проверить фактические начертания, затем безопасно отложить аналитику с контролем событий.
8. **Сервер/протокол**: HTTP/2, cache headers для versioned ресурсов, проверка gzip; API/HTML не кешировать рискованно.
9. **После каждого изменения**: production build, доступные проверки, консоль, сетевой diff, Lighthouse ×3, визуальное сравнение и ручные сценарии без реальной оплаты.

## Первые три низкорисковые задачи с максимальной ожидаемой пользой

### 1. Устранить двойной запрос `chatgpt-card.png`

- Ожидаемая экономия: около 1,96 МиБ на главной.
- Изменения: только унификация resource URL в шапке/витрине и их fallback; сам файл и внешний вид не меняются.
- Риск: низкий.
- Проверка: один сетевой запрос к файлу, одинаковый вид шапки/карточки/hover на 375/768/1440, RU/EN.

### 2. Включить gzip для CSS/JS в Nginx отдельным изменением

- Ожидаемая экономия: ориентировочно 650–700 КиБ на первом открытии только за счёт текущих CSS/JS.
- Изменения: серверная конфигурация, без правки HTML/CSS/JS.
- Риск: низкий при `nginx -t` и предварительной проверке staging/локальной конфигурации.
- Проверка: `Content-Encoding: gzip`, корректные MIME, повторный Lighthouse, smoke-check HTML/API/admin.

Рекомендуемая конфигурация для проверки, но не применённая в рамках аудита:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_min_length 1024;
gzip_comp_level 5;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss image/svg+xml;
```

### 3. Сделать облегчённые варианты крупных PNG главной с сохранением fallback

- Первый пакет: `chatgpt-card.png` и `chatgpt-card-hover.png`; не смешивать с promo background.
- Ожидаемая экономия первого пакета: 2–3 МиБ после устранения дубля; последующие promo background дают ещё около 3–4 МиБ.
- Риск: низкий–средний, если оригиналы сохраняются как fallback и новые варианты проходят pixel/visual diff.
- Проверка: размеры/прозрачность/hover неизменны, Lighthouse image-delivery уменьшается, скриншоты совпадают.

## 10. Проверка отсутствия визуальных изменений

Перед первой оптимизацией необходимо создать baseline:

- viewport: 375×812, 768×1024, 1440×900;
- страницы: `/`, `/en/`, `/catalog/`, `/catalog/ai/`, `/chatgpt`, `/claude`, `/supergrok`, Steam/VPN страницы;
- состояния: каждый promo slide, раскрытый FAQ, меню языка, мобильная навигация, modal тарифа/заказа/выбора оплаты, hover карточки, support widget, видео до/после запуска, loading/error API;
- снимки делать после стабилизации шрифтов и динамических данных; маскировать только реально нестабильные счётчики/временные значения;
- недопустимы: изменение геометрии, переносов текста, цвета, прозрачности, кадрирования, размеров карточек, анимации, видимости элементов, порядка контента и CTA;
- для изображений дополнительно сравнивать 100% crop ключевых областей и альфа-канал;
- после каждого пакета: visual diff + ручная проверка консоли и сценариев; реальную оплату не выполнять.

## Выполненные проверки

- Admin UI TypeScript + Vite production build: успешно.
- Admin API Prisma Client generation + TypeScript production build: успешно.
- Storefront server local startup: успешно.
- `node --check` для server и основных storefront scripts: успешно.
- Главная, `/en/`, `/catalog/`, `/chatgpt`: HTTP 200 локально.
- Products, showcase, stats: HTTP 200 локально; homepage-content: 502 из-за недоступного DNS admin API, production endpoint через основной домен — HTTP 200.
- Консоль главной в локальном браузере: ошибок и предупреждений не зафиксировано.
- Lighthouse: 3 local mobile + 3 local desktop + 3 production mobile + 3 production desktop.
- Production headers и Nginx-конфигурация проверены только чтением; изменений на сервере нет.

## Оставшиеся ограничения

- INP является полевой метрикой и не может быть достоверно получен этим лабораторным аудитом; TBT используется только как лабораторный аналог нагрузки.
- Полный визуальный baseline относится к этапу 2 и ещё не создан.
- Платёжные, активационные и административные сценарии не запускались до необратимых действий.
- Из-за сильно загрязнённого production worktree удаление backup/temp/dependency файлов запрещено без отдельной карты ссылок и подтверждения владельца.
