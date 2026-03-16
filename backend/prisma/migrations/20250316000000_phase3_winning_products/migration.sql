-- Phase 3: Winner Product Detection - table for storing detected winners per listing
CREATE TABLE IF NOT EXISTS "winning_products" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "marketplaceListingId" INTEGER,
    "marketplace" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "score" DECIMAL(10,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "winning_products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "winning_products_userId_idx" ON "winning_products"("userId");
CREATE INDEX IF NOT EXISTS "winning_products_productId_idx" ON "winning_products"("productId");
CREATE INDEX IF NOT EXISTS "winning_products_marketplace_idx" ON "winning_products"("marketplace");
CREATE INDEX IF NOT EXISTS "winning_products_detectedAt_idx" ON "winning_products"("detectedAt");

ALTER TABLE "winning_products" ADD CONSTRAINT "winning_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "winning_products" ADD CONSTRAINT "winning_products_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "winning_products" ADD CONSTRAINT "winning_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
