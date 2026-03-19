-- Phase 47B: manual fulfillment fallback fields on orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "manualFulfillmentRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "manualPurchaseDate" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fulfillmentNotes" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "lastAutoRetryAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "orders_manualFulfillmentRequired_idx" ON "orders"("manualFulfillmentRequired");
