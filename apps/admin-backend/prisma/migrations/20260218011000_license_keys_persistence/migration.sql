-- CreateEnum
CREATE TYPE "LicenseKeyStatus" AS ENUM ('available', 'reserved', 'used', 'revoked');

-- CreateTable
CREATE TABLE "license_keys" (
    "id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "product_id" TEXT,
    "key_value" TEXT NOT NULL,
    "status" "LicenseKeyStatus" NOT NULL DEFAULT 'available',
    "order_id" TEXT,
    "email" TEXT,
    "reserved_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_audit_log" (
    "id" SERIAL NOT NULL,
    "key_id" TEXT,
    "action" TEXT NOT NULL,
    "user_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "license_keys_key_value_key" ON "license_keys"("key_value");

-- CreateIndex
CREATE INDEX "license_keys_product_key_status_idx" ON "license_keys"("product_key", "status");

-- CreateIndex
CREATE INDEX "license_keys_order_id_idx" ON "license_keys"("order_id");

-- CreateIndex
CREATE INDEX "key_audit_log_key_id_idx" ON "key_audit_log"("key_id");

-- CreateIndex
CREATE INDEX "key_audit_log_user_id_idx" ON "key_audit_log"("user_id");

-- CreateIndex
CREATE INDEX "key_audit_log_created_at_idx" ON "key_audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_audit_log" ADD CONSTRAINT "key_audit_log_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "license_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_audit_log" ADD CONSTRAINT "key_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

