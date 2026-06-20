ALTER TABLE "license_keys"
  ADD COLUMN IF NOT EXISTS "activation_site_url" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "license_keys_product_key_activation_site_url_status_idx"
  ON "license_keys"("product_key", "activation_site_url", "status");
