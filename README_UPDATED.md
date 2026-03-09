# README_UPDATED

## GPTishka Site — Runtime + Admin

Коммерческий сайт подключения/продления подписок ChatGPT с:
- storefront (многостраничный HTML + JS + CSS)
- storefront proxy server (`server.js`)
- admin backend (`apps/admin-backend`)
- admin UI (`apps/admin-ui`)

## Структура
- `index.html`, `en/index.html`, `*.html` — публичные страницы и воронка.
- `assets/js/app.min.js` — основной storefront runtime.
- `assets/css/unified-premium.css` — визуальная система storefront.
- `server.js` — Express сервер, статика, API proxy, ticker/stats.
- `apps/admin-backend` — API админки/оплаты/активации (TS + Prisma).
- `apps/admin-ui` — интерфейс админки (React + Vite).

## Требования
- Node.js 20+
- npm 10+
- PostgreSQL для `apps/admin-backend`

## Быстрый запуск (локально)
1. Установка зависимостей:
```bash
npm install --include=dev
```
2. Запуск storefront:
```bash
npm run start:storefront
```
3. Запуск админ backend:
```bash
npm run dev:admin:api
```
4. Запуск админ UI:
```bash
npm run dev:admin:ui
```

## Сборка
- Admin API build:
```bash
npm run build:admin:api
```
- Admin UI build:
```bash
npm run build:admin:ui
```

## Prisma (admin-backend)
- Генерация клиента:
```bash
npm run prisma:generate --workspace @gptishka/admin-backend
```
- Применение миграций:
```bash
npm run prisma:deploy --workspace @gptishka/admin-backend
```

## Production deploy (типовой)
```bash
cd /var/www/gptishka-new
git fetch origin main
git reset --hard origin/main
npm install --include=dev
npm run build:admin:api
npm run build:admin:ui
rsync -a --delete apps/admin-ui/dist/ admin/
pm run prisma:deploy --workspace @gptishka/admin-backend
pm2 restart gptishka-admin-api --update-env
pm2 restart gptishka-storefront --update-env
```

## Переменные окружения (критичные)
Storefront (`server.js`):
- `PORT`
- `ADMIN_BACKEND_URL`
- `NODE_ENV`
- `ONLINE_TTL_SECONDS`
- `ENABLE_SYSTEM_ACTIVATIONS`

Admin backend (`apps/admin-backend`):
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ADMIN_UI_URL`
- payment/webhook secrets (`ENOT_*`, `LAVA_*`)

## Smoke-check после деплоя
1. Главная и EN-страница открываются без ошибок.
2. Тарифы загружаются (`/api/public/products`).
3. Модалка оплаты открывается, email/promo работают.
4. Переход на оплату (`/api/payments/:provider/create`) отдает `pay_url`.
5. Страница `redeem-start` отрабатывает корректно.
6. Админка авторизуется, CRUD товаров работает.

## Зависимости и назначение
Storefront:
- `express`, `helmet`, `compression`, `express-rate-limit`, `sqlite3`, `dotenv`.

Admin backend:
- `@prisma/client`, `express`, `jsonwebtoken`, `zod`, `cors`, `nodemailer`, `multer` и др.

Admin UI:
- `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`, `vite`.
