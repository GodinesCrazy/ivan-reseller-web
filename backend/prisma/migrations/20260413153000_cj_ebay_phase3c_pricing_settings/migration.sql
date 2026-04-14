-- FASE 3C: CJ → eBay USA pricing / qualification settings + variant cjVid

ALTER TABLE "cj_ebay_account_settings" ADD COLUMN "incidentBufferPct" DECIMAL(6,4);
ALTER TABLE "cj_ebay_account_settings" ADD COLUMN "defaultEbayFeePct" DECIMAL(6,4);
ALTER TABLE "cj_ebay_account_settings" ADD COLUMN "defaultPaymentFeePct" DECIMAL(6,4);
ALTER TABLE "cj_ebay_account_settings" ADD COLUMN "defaultPaymentFixedFeeUsd" DECIMAL(18,2);

ALTER TABLE "cj_ebay_product_variants" ADD COLUMN "cjVid" TEXT;

CREATE INDEX "cj_ebay_product_variants_productId_cjVid_idx" ON "cj_ebay_product_variants"("productId", "cjVid");
