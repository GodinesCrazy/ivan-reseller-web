-- FASE 3D: CJ → eBay listing draft payload, error, evaluation/quote links, handling days.

ALTER TABLE "cj_ebay_listings" ADD COLUMN IF NOT EXISTS "draftPayload" JSONB;
ALTER TABLE "cj_ebay_listings" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "cj_ebay_listings" ADD COLUMN IF NOT EXISTS "evaluationId" INTEGER;
ALTER TABLE "cj_ebay_listings" ADD COLUMN IF NOT EXISTS "shippingQuoteId" INTEGER;
ALTER TABLE "cj_ebay_listings" ADD COLUMN IF NOT EXISTS "handlingTimeDays" INTEGER;
ALTER TABLE "cj_ebay_listings" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cj_ebay_listings_evaluationId_fkey'
  ) THEN
    ALTER TABLE "cj_ebay_listings"
      ADD CONSTRAINT "cj_ebay_listings_evaluationId_fkey"
      FOREIGN KEY ("evaluationId") REFERENCES "cj_ebay_product_evaluations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cj_ebay_listings_shippingQuoteId_fkey'
  ) THEN
    ALTER TABLE "cj_ebay_listings"
      ADD CONSTRAINT "cj_ebay_listings_shippingQuoteId_fkey"
      FOREIGN KEY ("shippingQuoteId") REFERENCES "cj_ebay_shipping_quotes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
