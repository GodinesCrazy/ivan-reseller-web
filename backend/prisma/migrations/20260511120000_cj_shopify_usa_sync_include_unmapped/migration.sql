-- AlterTable
ALTER TABLE "cj_shopify_usa_account_settings" ADD COLUMN IF NOT EXISTS "syncIncludeUnmappedOrders" BOOLEAN NOT NULL DEFAULT false;
