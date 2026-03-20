-- Phase 48: recommended supplier for manual fulfillment
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "recommendedSupplierUrl" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "recommendedSupplierMeta" JSONB;
