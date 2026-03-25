-- Telegram links for customer account notifications (temporary free channel MVP)
CREATE TABLE "telegram_links" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "telegram_id" TEXT NOT NULL,
  "telegram_username" TEXT,
  "first_name" TEXT,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unlinked_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_link_tokens" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_links_customer_id_key" ON "telegram_links"("customer_id");
CREATE UNIQUE INDEX "telegram_link_tokens_token_hash_key" ON "telegram_link_tokens"("token_hash");

CREATE INDEX "telegram_links_telegram_id_idx" ON "telegram_links"("telegram_id");
CREATE INDEX "telegram_links_is_active_telegram_id_idx" ON "telegram_links"("is_active", "telegram_id");
CREATE INDEX "telegram_link_tokens_customer_id_expires_at_idx" ON "telegram_link_tokens"("customer_id", "expires_at");
CREATE INDEX "telegram_link_tokens_expires_at_consumed_at_idx" ON "telegram_link_tokens"("expires_at", "consumed_at");

ALTER TABLE "telegram_links"
  ADD CONSTRAINT "telegram_links_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_link_tokens"
  ADD CONSTRAINT "telegram_link_tokens_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

