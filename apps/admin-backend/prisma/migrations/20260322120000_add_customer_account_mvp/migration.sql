-- Create customer portal tables (MVP)
CREATE TABLE "customers" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'ru',
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
  "email_verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_sessions" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "user_agent" TEXT,
  "ip" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_magic_link_tokens" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "next_path" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "consumed_ip" TEXT,
  "consumed_user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_magic_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");
CREATE UNIQUE INDEX "customer_magic_link_tokens_token_hash_key" ON "customer_magic_link_tokens"("token_hash");

CREATE INDEX "customers_email_verified_at_idx" ON "customers"("email_verified_at");
CREATE INDEX "customer_sessions_customer_id_expires_at_idx" ON "customer_sessions"("customer_id", "expires_at");
CREATE INDEX "customer_sessions_expires_at_idx" ON "customer_sessions"("expires_at");
CREATE INDEX "customer_magic_link_tokens_customer_id_expires_at_idx" ON "customer_magic_link_tokens"("customer_id", "expires_at");
CREATE INDEX "customer_magic_link_tokens_expires_at_consumed_at_idx" ON "customer_magic_link_tokens"("expires_at", "consumed_at");

ALTER TABLE "customer_sessions"
  ADD CONSTRAINT "customer_sessions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_magic_link_tokens"
  ADD CONSTRAINT "customer_magic_link_tokens_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
