-- AlterTable: Add shipping, tax, and total cost fields to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shippingCost" DECIMAL(18,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "importTax" DECIMAL(18,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(18,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "targetCountry" TEXT;

-- AlterTable: Add shipping, tax, and total cost fields to opportunities
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "shippingCost" DECIMAL(18,2);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "importTax" DECIMAL(18,2);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(18,2);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "targetCountry" TEXT;

