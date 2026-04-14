-- FASE 3E: CJ eBay orders — listing link, ebay SKU, line qty, raw summary, lastError.

ALTER TABLE "cj_ebay_orders" ADD COLUMN IF NOT EXISTS "listingId" INTEGER;
ALTER TABLE "cj_ebay_orders" ADD COLUMN IF NOT EXISTS "ebaySku" TEXT;
ALTER TABLE "cj_ebay_orders" ADD COLUMN IF NOT EXISTS "lineQuantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "cj_ebay_orders" ADD COLUMN IF NOT EXISTS "rawEbaySummary" JSONB;
ALTER TABLE "cj_ebay_orders" ADD COLUMN IF NOT EXISTS "lastError" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cj_ebay_orders_listingId_fkey'
  ) THEN
    ALTER TABLE "cj_ebay_orders"
      ADD CONSTRAINT "cj_ebay_orders_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "cj_ebay_listings"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "cj_ebay_orders_listingId_idx" ON "cj_ebay_orders"("listingId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cj_ebay_orders_productId_fkey') THEN
    ALTER TABLE "cj_ebay_orders"
      ADD CONSTRAINT "cj_ebay_orders_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "cj_ebay_products"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cj_ebay_orders_variantId_fkey') THEN
    ALTER TABLE "cj_ebay_orders"
      ADD CONSTRAINT "cj_ebay_orders_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "cj_ebay_product_variants"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
