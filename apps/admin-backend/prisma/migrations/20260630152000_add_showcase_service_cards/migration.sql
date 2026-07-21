CREATE TABLE IF NOT EXISTS "product_showcase_service_cards" (
  "id" TEXT NOT NULL,
  "service_key" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "plan_summary" TEXT NOT NULL DEFAULT '',
  "price_text" TEXT NOT NULL DEFAULT '',
  "button_text" TEXT NOT NULL DEFAULT '',
  "href" TEXT NOT NULL DEFAULT '',
  "icon_text" TEXT NOT NULL DEFAULT '',
  "theme" TEXT NOT NULL DEFAULT '',
  "image_url" TEXT NOT NULL DEFAULT '',
  "image_alt" TEXT NOT NULL DEFAULT '',
  "hover_image_url" TEXT NOT NULL DEFAULT '',
  "hover_image_alt" TEXT NOT NULL DEFAULT '',
  "background_type" "ProductVisualBackgroundType" NOT NULL DEFAULT 'solid',
  "background_color" TEXT NOT NULL DEFAULT '',
  "background_gradient" TEXT NOT NULL DEFAULT '',
  "text_color" TEXT NOT NULL DEFAULT '',
  "button_background" TEXT NOT NULL DEFAULT '',
  "button_text_color" TEXT NOT NULL DEFAULT '',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_showcase_service_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_showcase_service_cards_service_key_key"
  ON "product_showcase_service_cards"("service_key");

CREATE INDEX IF NOT EXISTS "product_showcase_service_cards_is_active_sort_order_idx"
  ON "product_showcase_service_cards"("is_active", "sort_order");
