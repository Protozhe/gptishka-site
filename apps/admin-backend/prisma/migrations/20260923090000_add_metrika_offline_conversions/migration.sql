CREATE TABLE "metrika_offline_conversions" (
    "order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "upload_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metrika_offline_conversions_pkey" PRIMARY KEY ("order_id")
);

CREATE INDEX "metrika_offline_conversions_status_idx" ON "metrika_offline_conversions"("status");

ALTER TABLE "metrika_offline_conversions" ADD CONSTRAINT "metrika_offline_conversions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
