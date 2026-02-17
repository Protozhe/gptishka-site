-- CreateEnum
CREATE TYPE "PromoCodeKind" AS ENUM ('GENERAL', 'REFERRAL', 'ADS');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promoCodeId" TEXT,
ADD COLUMN     "promoCodeSnapshot" TEXT,
ADD COLUMN     "subtotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "kind" "PromoCodeKind" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "ownerLabel" TEXT;

-- CreateIndex
CREATE INDEX "Order_promoCodeId_idx" ON "Order"("promoCodeId");

-- CreateIndex
CREATE INDEX "PromoCode_kind_idx" ON "PromoCode"("kind");

-- CreateIndex
CREATE INDEX "PromoCode_ownerLabel_idx" ON "PromoCode"("ownerLabel");

-- CreateIndex
CREATE INDEX "PromoCode_campaign_idx" ON "PromoCode"("campaign");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
