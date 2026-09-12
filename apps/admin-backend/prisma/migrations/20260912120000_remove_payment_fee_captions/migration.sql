UPDATE "service_pages"
SET
  "payment_caption_lava" = '',
  "payment_caption_enot" = '';

ALTER TABLE "service_pages"
  ALTER COLUMN "payment_caption_lava" SET DEFAULT '',
  ALTER COLUMN "payment_caption_enot" SET DEFAULT '';
