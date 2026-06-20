ALTER TABLE "Order"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'site',
ADD COLUMN "botType" TEXT,
ADD COLUMN "telegram_user_id" TEXT,
ADD COLUMN "telegram_username" TEXT,
ADD COLUMN "telegram_chat_id" TEXT,
ADD COLUMN "telegram_last_error" TEXT;

CREATE INDEX "Order_source_idx" ON "Order"("source");
CREATE INDEX "Order_botType_idx" ON "Order"("botType");
CREATE INDEX "Order_telegram_user_id_idx" ON "Order"("telegram_user_id");
CREATE INDEX "Order_source_botType_idx" ON "Order"("source", "botType");
