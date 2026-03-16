-- Phase 6: Dynamic Marketplace Optimization - actions (price_adjustment, title_seo_update, image_rotation, marketplace_expansion)
CREATE TABLE IF NOT EXISTS "listing_optimization_actions" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_optimization_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "listing_optimization_actions_listingId_idx" ON "listing_optimization_actions"("listingId");
CREATE INDEX IF NOT EXISTS "listing_optimization_actions_actionType_idx" ON "listing_optimization_actions"("actionType");
CREATE INDEX IF NOT EXISTS "listing_optimization_actions_createdAt_idx" ON "listing_optimization_actions"("createdAt");
CREATE INDEX IF NOT EXISTS "listing_optimization_actions_executed_idx" ON "listing_optimization_actions"("executed");

ALTER TABLE "listing_optimization_actions" ADD CONSTRAINT "listing_optimization_actions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
