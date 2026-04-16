-- FASE 3G — Warehouse-aware fulfillment: origin country for CJ shipping quotes
-- Adds `origin_country_code` to cj_ebay_shipping_quotes.
-- Nullable with default 'CN' (China) — backward compatible with all existing quote rows.
ALTER TABLE "cj_ebay_shipping_quotes" ADD COLUMN IF NOT EXISTS "originCountryCode" TEXT DEFAULT 'CN';
