CREATE TABLE "service_pages" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "service_key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "title_en" TEXT NOT NULL DEFAULT '',
  "hero_eyebrow" TEXT NOT NULL DEFAULT 'Тарифные планы',
  "hero_title" TEXT NOT NULL DEFAULT '',
  "hero_description" TEXT NOT NULL DEFAULT '',
  "hero_video_url" TEXT NOT NULL DEFAULT '',
  "hero_image_url" TEXT NOT NULL DEFAULT '',
  "hero_logo_url" TEXT NOT NULL DEFAULT '',
  "theme" TEXT NOT NULL DEFAULT 'custom',
  "accent_color" TEXT NOT NULL DEFAULT '#35f28f',
  "accent_gradient" TEXT NOT NULL DEFAULT '',
  "dark_overlay" TEXT NOT NULL DEFAULT '',
  "color_overlay" TEXT NOT NULL DEFAULT '',
  "constructor_title" TEXT NOT NULL DEFAULT '',
  "constructor_description" TEXT NOT NULL DEFAULT '',
  "info_sections" JSONB,
  "faq_items" JSONB,
  "payment_caption_lava" TEXT NOT NULL DEFAULT 'СБП 0% и карты 3.2%',
  "payment_caption_enot" TEXT NOT NULL DEFAULT 'Карты 3.2% и СБП 0%',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_indexed" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_page_product_placements" (
  "id" TEXT NOT NULL,
  "service_page_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_page_product_placements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_pages_slug_key" ON "service_pages"("slug");
CREATE UNIQUE INDEX "service_pages_path_key" ON "service_pages"("path");
CREATE INDEX "service_pages_is_active_sort_order_idx" ON "service_pages"("is_active", "sort_order");
CREATE INDEX "service_pages_service_key_idx" ON "service_pages"("service_key");
CREATE UNIQUE INDEX "service_page_product_placements_service_page_id_product_id_key" ON "service_page_product_placements"("service_page_id", "product_id");
CREATE INDEX "service_page_product_placements_product_id_idx" ON "service_page_product_placements"("product_id");
CREATE INDEX "service_page_product_placements_service_page_id_is_active_sort_order_idx" ON "service_page_product_placements"("service_page_id", "is_active", "sort_order");
CREATE INDEX "service_page_product_placements_is_pinned_idx" ON "service_page_product_placements"("is_pinned");

ALTER TABLE "service_page_product_placements"
  ADD CONSTRAINT "service_page_product_placements_service_page_id_fkey"
  FOREIGN KEY ("service_page_id") REFERENCES "service_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_page_product_placements"
  ADD CONSTRAINT "service_page_product_placements_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
