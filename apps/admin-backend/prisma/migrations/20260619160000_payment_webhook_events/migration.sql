CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "order_id" TEXT,
  "payment_id" TEXT,
  "status" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_provider_event_key_key" ON "payment_webhook_events"("provider", "event_key");
CREATE INDEX "payment_webhook_events_order_id_idx" ON "payment_webhook_events"("order_id");
CREATE INDEX "payment_webhook_events_created_at_idx" ON "payment_webhook_events"("created_at");
