-- Phase 15: Listing state reconciliation & publish validation
-- Add status and lastReconciledAt to marketplace_listings
ALTER TABLE "marketplace_listings" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "marketplace_listings" ADD COLUMN "lastReconciledAt" TIMESTAMP(3);
CREATE INDEX "marketplace_listings_status_idx" ON "marketplace_listings"("status");

-- Create listing_publish_errors table
CREATE TABLE "listing_publish_errors" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_publish_errors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "listing_publish_errors_listingId_idx" ON "listing_publish_errors"("listingId");
CREATE INDEX "listing_publish_errors_marketplace_idx" ON "listing_publish_errors"("marketplace");
CREATE INDEX "listing_publish_errors_errorType_idx" ON "listing_publish_errors"("errorType");
CREATE INDEX "listing_publish_errors_createdAt_idx" ON "listing_publish_errors"("createdAt");

ALTER TABLE "listing_publish_errors" DROP CONSTRAINT IF EXISTS "listing_publish_errors_listingId_fkey";
ALTER TABLE "listing_publish_errors" ADD CONSTRAINT "listing_publish_errors_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
