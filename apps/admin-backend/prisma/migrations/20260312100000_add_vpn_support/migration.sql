-- CreateTable
CREATE TABLE "vpn_access" (
    "id" TEXT NOT NULL,
    "telegram_id" TEXT,
    "email" TEXT,
    "order_id" TEXT,
    "uuid" TEXT NOT NULL,
    "access_link" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "server_id" TEXT NOT NULL DEFAULT 'eu-1',
    "traffic_used_bytes" BIGINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vpn_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_events" (
    "id" TEXT NOT NULL,
    "vpn_access_id" TEXT,
    "telegram_id" TEXT,
    "event_type" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vpn_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vpn_access_uuid_key" ON "vpn_access"("uuid");

-- CreateIndex
CREATE INDEX "vpn_access_telegram_id_idx" ON "vpn_access"("telegram_id");

-- CreateIndex
CREATE INDEX "vpn_access_email_idx" ON "vpn_access"("email");

-- CreateIndex
CREATE INDEX "vpn_access_order_id_idx" ON "vpn_access"("order_id");

-- CreateIndex
CREATE INDEX "vpn_access_is_active_expires_at_idx" ON "vpn_access"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "vpn_events_vpn_access_id_idx" ON "vpn_events"("vpn_access_id");

-- CreateIndex
CREATE INDEX "vpn_events_telegram_id_idx" ON "vpn_events"("telegram_id");

-- CreateIndex
CREATE INDEX "vpn_events_event_type_created_at_idx" ON "vpn_events"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "vpn_access"
ADD CONSTRAINT "vpn_access_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vpn_events"
ADD CONSTRAINT "vpn_events_vpn_access_id_fkey"
FOREIGN KEY ("vpn_access_id") REFERENCES "vpn_access"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed / upsert default VPN plans.
INSERT INTO "Product" (
  "id",
  "slug",
  "title",
  "titleEn",
  "description",
  "descriptionEn",
  "modalDescription",
  "modalDescriptionEn",
  "price",
  "oldPrice",
  "currency",
  "category",
  "tags",
  "stock",
  "isActive",
  "isArchived",
  "createdAt",
  "updatedAt"
)
VALUES (
  'vpn_month_product_2026',
  'vpn_month',
  'VPN 1 месяц',
  'VPN 1 month',
  'Срок: 30 дней',
  'Duration: 30 days',
  'VLESS Reality. Подключение за 1 минуту.',
  'VLESS Reality. Connection in 1 minute.',
  199,
  NULL,
  'RUB'::"Currency",
  'VPN',
  ARRAY['vpn', 'delivery:vpn', 'vpn:days:30', 'badge:new'],
  NULL,
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("slug")
DO UPDATE SET
  "title" = EXCLUDED."title",
  "titleEn" = EXCLUDED."titleEn",
  "description" = EXCLUDED."description",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "modalDescription" = EXCLUDED."modalDescription",
  "modalDescriptionEn" = EXCLUDED."modalDescriptionEn",
  "price" = EXCLUDED."price",
  "oldPrice" = EXCLUDED."oldPrice",
  "currency" = EXCLUDED."currency",
  "category" = EXCLUDED."category",
  "tags" = EXCLUDED."tags",
  "isActive" = true,
  "isArchived" = false,
  "updatedAt" = NOW();

INSERT INTO "Product" (
  "id",
  "slug",
  "title",
  "titleEn",
  "description",
  "descriptionEn",
  "modalDescription",
  "modalDescriptionEn",
  "price",
  "oldPrice",
  "currency",
  "category",
  "tags",
  "stock",
  "isActive",
  "isArchived",
  "createdAt",
  "updatedAt"
)
VALUES (
  'vpn_halfyear_product_2026',
  'vpn_halfyear',
  'VPN 6 месяцев',
  'VPN 6 months',
  'Срок: 180 дней',
  'Duration: 180 days',
  'VLESS Reality. Подключение за 1 минуту.',
  'VLESS Reality. Connection in 1 minute.',
  999,
  NULL,
  'RUB'::"Currency",
  'VPN',
  ARRAY['vpn', 'delivery:vpn', 'vpn:days:180', 'badge:popular'],
  NULL,
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("slug")
DO UPDATE SET
  "title" = EXCLUDED."title",
  "titleEn" = EXCLUDED."titleEn",
  "description" = EXCLUDED."description",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "modalDescription" = EXCLUDED."modalDescription",
  "modalDescriptionEn" = EXCLUDED."modalDescriptionEn",
  "price" = EXCLUDED."price",
  "oldPrice" = EXCLUDED."oldPrice",
  "currency" = EXCLUDED."currency",
  "category" = EXCLUDED."category",
  "tags" = EXCLUDED."tags",
  "isActive" = true,
  "isArchived" = false,
  "updatedAt" = NOW();

INSERT INTO "Product" (
  "id",
  "slug",
  "title",
  "titleEn",
  "description",
  "descriptionEn",
  "modalDescription",
  "modalDescriptionEn",
  "price",
  "oldPrice",
  "currency",
  "category",
  "tags",
  "stock",
  "isActive",
  "isArchived",
  "createdAt",
  "updatedAt"
)
VALUES (
  'vpn_year_product_2026',
  'vpn_year',
  'VPN 12 месяцев',
  'VPN 12 months',
  'Срок: 365 дней',
  'Duration: 365 days',
  'VLESS Reality. Подключение за 1 минуту.',
  'VLESS Reality. Connection in 1 minute.',
  1699,
  NULL,
  'RUB'::"Currency",
  'VPN',
  ARRAY['vpn', 'delivery:vpn', 'vpn:days:365', 'badge:best'],
  NULL,
  true,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("slug")
DO UPDATE SET
  "title" = EXCLUDED."title",
  "titleEn" = EXCLUDED."titleEn",
  "description" = EXCLUDED."description",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "modalDescription" = EXCLUDED."modalDescription",
  "modalDescriptionEn" = EXCLUDED."modalDescriptionEn",
  "price" = EXCLUDED."price",
  "oldPrice" = EXCLUDED."oldPrice",
  "currency" = EXCLUDED."currency",
  "category" = EXCLUDED."category",
  "tags" = EXCLUDED."tags",
  "isActive" = true,
  "isArchived" = false,
  "updatedAt" = NOW();
