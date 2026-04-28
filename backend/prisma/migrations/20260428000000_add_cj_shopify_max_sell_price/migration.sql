ALTER TABLE "cj_shopify_usa_account_settings"
  ADD COLUMN IF NOT EXISTS "maxSellPriceUsd" DECIMAL(18, 2) DEFAULT 45.00;

UPDATE "cj_shopify_usa_account_settings"
SET "maxSellPriceUsd" = 45.00
WHERE "maxSellPriceUsd" IS NULL;
