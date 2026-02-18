-- Add redeem token hash for protected activation links.
ALTER TABLE "Order" ADD COLUMN "redeem_token_hash" TEXT;

