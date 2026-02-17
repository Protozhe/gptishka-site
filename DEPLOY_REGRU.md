# GPTishka: релиз на REG.RU (VPS) — полный чеклист

Важно: для вашего проекта нужен именно VPS/VDS. На обычном shared-хостинге Node.js + PostgreSQL + webhook-обработчик полноценно не поднимутся.

## 0) Что обязательно сохранить, чтобы не потерять данные

Перед любым деплоем сделайте backup:

- PostgreSQL (товары, заказы, промокоды, партнёры, пользователи админки).
- Папка `data/` в корне проекта:
  - `data/cdk-keys.json`
  - `data/order-activations.json`
  - `data/backups/`
  - `data/cdk-keys.audit.log`
- Папка `apps/admin-backend/uploads/` (изображения товаров).

Команды backup (на сервере):

```bash
mkdir -p /var/backups/gptishka
pg_dump -h 127.0.0.1 -U gptishka -d gptishka_admin > /var/backups/gptishka/pg-$(date +%F-%H%M).sql
tar -czf /var/backups/gptishka/files-$(date +%F-%H%M).tar.gz data apps/admin-backend/uploads
```

## 1) Подготовка сервера

Пример ниже для Ubuntu 22.04.

```bash
sudo apt update
sudo apt install -y curl git nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2) Создание БД PostgreSQL

```bash
sudo -u postgres psql
CREATE USER gptishka WITH PASSWORD 'CHANGE_STRONG_PASSWORD';
CREATE DATABASE gptishka_admin OWNER gptishka;
\q
```

## 3) Загрузка проекта

```bash
sudo mkdir -p /var/www/gptishka-site
sudo chown -R $USER:$USER /var/www/gptishka-site
cd /var/www/gptishka-site
git clone <ВАШ_РЕПО_URL> .
```

Если грузите архивом через REG.RU панель/FTP: распакуйте в `/var/www/gptishka-site`.

## 4) Установка зависимостей

```bash
cd /var/www/gptishka-site
npm ci
```

## 5) ENV-файлы (критично)

### 5.1 Корневой `.env` (storefront)

Создайте `/var/www/gptishka-site/.env`:

```env
NODE_ENV=production
PORT=3000
SITE_URL=https://gptishka.shop
ADMIN_BACKEND_URL=https://admin-api.gptishka.shop
ONLINE_TTL_SECONDS=45
SEED_DEMO_STATS=false

SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=info@gptishka.shop
```

### 5.2 `apps/admin-backend/.env`

Создайте `/var/www/gptishka-site/apps/admin-backend/.env`:

```env
NODE_ENV=production
PORT=4100
APP_URL=https://admin-api.gptishka.shop
ADMIN_UI_URL=https://gptishka.shop
DATABASE_URL=postgresql://gptishka:CHANGE_STRONG_PASSWORD@127.0.0.1:5432/gptishka_admin?schema=public

JWT_ACCESS_SECRET=CHANGE_LONG_RANDOM_ACCESS_SECRET_32PLUS
JWT_REFRESH_SECRET=CHANGE_LONG_RANDOM_REFRESH_SECRET_32PLUS
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30
REFRESH_COOKIE_NAME=admin_refresh_token
BCRYPT_ROUNDS=12

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
AUTH_RATE_LIMIT_MAX=10

SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=info@gptishka.shop

PAYMENT_PROVIDER=gateway
ENOT_API_KEY=ВАШ_X_API_KEY
ENOT_SHOP_ID=ВАШ_SHOP_ID
ENOT_WEBHOOK_SECRET=ВАШ_ДОП_КЛЮЧ_ПОДПИСИ
PAYMENT_API_BASE_URL=https://api.enot.io
PAYMENT_CREATE_PATH=/invoice/create
PAYMENT_REFUND_PATH=/invoice/refund
PAYMENT_SUCCESS_URL=https://gptishka.shop/success.html
PAYMENT_FAIL_URL=https://gptishka.shop/fail.html
PAYMENT_WEBHOOK_URL=https://admin-api.gptishka.shop/api/public/webhook/payment
PAYMENT_WEBHOOK_SIGNATURE_HEADER=x-api-sha256-signature
PAYMENT_WEBHOOK_IP_ALLOWLIST=

STORAGE_DRIVER=local
```

## 6) Миграции и админ-пользователь

### 6.1 Миграции

```bash
cd /var/www/gptishka-site
npm run prisma:deploy --workspace @gptishka/admin-backend
```

### 6.2 Создание/обновление админа

```bash
cd /var/www/gptishka-site
BOOTSTRAP_ADMIN_EMAIL=support@gptishka.shop \
BOOTSTRAP_ADMIN_PASSWORD='SupportPass!123' \
BOOTSTRAP_ADMIN_ROLE=SUPPORT \
npm run bootstrap:admin:user
```

Роли: `OWNER`, `ADMIN`, `MANAGER`, `SUPPORT`.

### 6.3 Важно про seed

`npm run seed --workspace @gptishka/admin-backend` перезаписывает демо-товары и может сбить ваши значения.  
На рабочем проде не запускайте seed повторно без необходимости.

## 7) Сборка и публикация админ-фронта (`/admin`)

```bash
cd /var/www/gptishka-site
npm run build:admin:ui
rsync -a --delete apps/admin-ui/dist/ admin/
cp -f apps/admin-ui/dist/index.html admin/index.html
```

Папка `admin/` уже обслуживается storefront сервером и имеет SPA fallback (`admin/.htaccess`).

## 8) Запуск процессов через PM2

```bash
sudo npm i -g pm2
cd /var/www/gptishka-site

pm2 start server.js --name gptishka-storefront
pm2 start npm --name gptishka-admin-api -- run start --workspace @gptishka/admin-backend

pm2 save
pm2 startup
```

Проверка:

```bash
pm2 status
pm2 logs gptishka-storefront --lines 100
pm2 logs gptishka-admin-api --lines 100
```

## 9) Nginx (два домена)

Создайте `/etc/nginx/sites-available/gptishka`:

```nginx
server {
  listen 80;
  server_name gptishka.shop www.gptishka.shop;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}

server {
  listen 80;
  server_name admin-api.gptishka.shop;

  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:4100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Активируйте:

```bash
sudo ln -s /etc/nginx/sites-available/gptishka /etc/nginx/sites-enabled/gptishka
sudo nginx -t
sudo systemctl reload nginx
```

## 10) SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d gptishka.shop -d www.gptishka.shop -d admin-api.gptishka.shop
```

Проверьте автообновление:

```bash
sudo certbot renew --dry-run
```

## 11) Enot настройка (обязательно)

В кабинете Enot:

- `Webhook URL`: `https://admin-api.gptishka.shop/api/public/webhook/payment`
- `Success URL`: `https://gptishka.shop/success.html`
- `Fail URL`: `https://gptishka.shop/fail.html`
- Ключи в кабинете должны совпадать с:
  - `ENOT_API_KEY`
  - `ENOT_WEBHOOK_SECRET`

## 12) Проверки после релиза (smoke test)

```bash
curl -I https://gptishka.shop
curl -s https://admin-api.gptishka.shop/api/admin/health
curl -s https://gptishka.shop/api/public/products?lang=ru
curl -s https://gptishka.shop/api/public/products?lang=en
```

Откройте в браузере:

- `https://gptishka.shop`
- `https://gptishka.shop/admin`
- Логин в админку.
- Проверьте: товары, CDK, промокоды, партнёры, заказы.
- Сделайте тестовый платёж Enot:
  - создаётся заказ,
  - webhook помечает `PAID`,
  - CDK списывается из `unused` в `used`,
  - активация доступна на странице выдачи.

## 13) Защита от потери данных в будущих релизах

Перед каждым обновлением:

1. `pg_dump` БД.
2. Архив `data/` и `apps/admin-backend/uploads/`.
3. Никогда не удаляйте эти папки при деплое.
4. Не запускайте seed на боевом проекте без явной причины.

Рекомендуемый cron backup (ежедневно 03:30):

```bash
30 3 * * * /usr/bin/pg_dump -h 127.0.0.1 -U gptishka -d gptishka_admin > /var/backups/gptishka/pg-$(date +\%F-\%H\%M).sql
35 3 * * * /bin/tar -czf /var/backups/gptishka/files-$(date +\%F-\%H\%M).tar.gz /var/www/gptishka-site/data /var/www/gptishka-site/apps/admin-backend/uploads
```

## 14) Обновление проекта без простоя (рекомендуемый порядок)

```bash
cd /var/www/gptishka-site
git pull
npm ci
npm run build:admin:api
npm run build:admin:ui
rsync -a --delete apps/admin-ui/dist/ admin/
npm run prisma:deploy --workspace @gptishka/admin-backend
pm2 restart gptishka-admin-api
pm2 restart gptishka-storefront
pm2 save
```

После рестарта проверьте health и тестовый заказ.
