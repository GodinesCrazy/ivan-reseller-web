-- AlterTable
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0;
