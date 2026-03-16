-- Phase 1: Product supplier stock fields for inventory sync
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplierStock" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplierStockCheckedAt" TIMESTAMP(3);

-- Phase 1: Listing metrics table (column names match Prisma schema camelCase)
CREATE TABLE IF NOT EXISTS "listing_metrics" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DECIMAL(8,4),
    "price" DECIMAL(18,2),
    "competitorPrice" DECIMAL(18,2),
    "date" DATE NOT NULL,

    CONSTRAINT "listing_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "listing_metrics_listingId_date_key" ON "listing_metrics"("listingId", "date");
CREATE INDEX IF NOT EXISTS "listing_metrics_listingId_idx" ON "listing_metrics"("listingId");
CREATE INDEX IF NOT EXISTS "listing_metrics_marketplace_date_idx" ON "listing_metrics"("marketplace", "date");

ALTER TABLE "listing_metrics" ADD CONSTRAINT "listing_metrics_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
