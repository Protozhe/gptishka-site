-- Add customer notification preferences and events (MVP)
CREATE TABLE "customer_notification_preferences" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "email_enabled" BOOLEAN NOT NULL DEFAULT true,
  "reminder_7d" BOOLEAN NOT NULL DEFAULT true,
  "reminder_3d" BOOLEAN NOT NULL DEFAULT true,
  "reminder_1d" BOOLEAN NOT NULL DEFAULT true,
  "reminder_expired" BOOLEAN NOT NULL DEFAULT true,
  "marketing_email_enabled" BOOLEAN NOT NULL DEFAULT false,
  "transactional_email_enabled" BOOLEAN NOT NULL DEFAULT true,
  "email_status" TEXT NOT NULL DEFAULT 'active',
  "last_email_sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_notification_events" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "vpn_access_id" TEXT,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "dedupe_key" TEXT NOT NULL,
  "window_start" TIMESTAMP(3),
  "window_end" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sent_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_notification_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_notification_preferences_customer_id_key" ON "customer_notification_preferences"("customer_id");
CREATE UNIQUE INDEX "customer_notification_events_dedupe_key_key" ON "customer_notification_events"("dedupe_key");

CREATE INDEX "customer_notification_preferences_email_status_idx" ON "customer_notification_preferences"("email_status");
CREATE INDEX "customer_notification_events_customer_id_status_created_at_idx" ON "customer_notification_events"("customer_id", "status", "created_at");
CREATE INDEX "customer_notification_events_vpn_access_id_idx" ON "customer_notification_events"("vpn_access_id");
CREATE INDEX "customer_notification_events_type_status_idx" ON "customer_notification_events"("type", "status");
CREATE INDEX "customer_notification_events_status_created_at_idx" ON "customer_notification_events"("status", "created_at");

ALTER TABLE "customer_notification_preferences"
  ADD CONSTRAINT "customer_notification_preferences_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_notification_events"
  ADD CONSTRAINT "customer_notification_events_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_notification_events"
  ADD CONSTRAINT "customer_notification_events_vpn_access_id_fkey"
  FOREIGN KEY ("vpn_access_id") REFERENCES "vpn_access"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;