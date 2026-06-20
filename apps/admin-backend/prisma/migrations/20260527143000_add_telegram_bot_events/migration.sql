CREATE TABLE IF NOT EXISTS "telegram_bot_events" (
  "id" TEXT NOT NULL,
  "bot_type" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'telegram',
  "order_id" TEXT,
  "telegram_user_id" TEXT,
  "telegram_username" TEXT,
  "telegram_chat_id" TEXT,
  "message_text" TEXT,
  "callback_data" TEXT,
  "meta" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_bot_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "telegram_bot_events_bot_type_created_at_idx" ON "telegram_bot_events"("bot_type", "created_at");
CREATE INDEX IF NOT EXISTS "telegram_bot_events_event_type_created_at_idx" ON "telegram_bot_events"("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "telegram_bot_events_order_id_idx" ON "telegram_bot_events"("order_id");
CREATE INDEX IF NOT EXISTS "telegram_bot_events_telegram_user_id_created_at_idx" ON "telegram_bot_events"("telegram_user_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'telegram_bot_events_order_id_fkey'
  ) THEN
    ALTER TABLE "telegram_bot_events"
      ADD CONSTRAINT "telegram_bot_events_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
