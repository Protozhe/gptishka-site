CREATE TABLE "customer_telegram_auth_tokens" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "customer_id" TEXT,
  "telegram_id" TEXT,
  "request_ip" TEXT,
  "request_user_agent" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "approved_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_telegram_auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_telegram_auth_tokens_token_hash_key"
ON "customer_telegram_auth_tokens"("token_hash");

CREATE INDEX "customer_telegram_auth_tokens_customer_id_expires_at_idx"
ON "customer_telegram_auth_tokens"("customer_id", "expires_at");

CREATE INDEX "customer_telegram_auth_tokens_telegram_id_expires_at_idx"
ON "customer_telegram_auth_tokens"("telegram_id", "expires_at");

CREATE INDEX "customer_telegram_auth_tokens_expires_at_approved_at_consumed_at_idx"
ON "customer_telegram_auth_tokens"("expires_at", "approved_at", "consumed_at");

ALTER TABLE "customer_telegram_auth_tokens"
ADD CONSTRAINT "customer_telegram_auth_tokens_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
