-- Phase 13: Launch Audit - listing_audit_actions and unprofitable_listing_flags
CREATE TABLE IF NOT EXISTS "listing_audit_actions" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_audit_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "listing_audit_actions_listingId_idx" ON "listing_audit_actions"("listingId");
CREATE INDEX IF NOT EXISTS "listing_audit_actions_marketplace_idx" ON "listing_audit_actions"("marketplace");
CREATE INDEX IF NOT EXISTS "listing_audit_actions_actionType_idx" ON "listing_audit_actions"("actionType");
CREATE INDEX IF NOT EXISTS "listing_audit_actions_executed_idx" ON "listing_audit_actions"("executed");
CREATE INDEX IF NOT EXISTS "listing_audit_actions_createdAt_idx" ON "listing_audit_actions"("createdAt");

ALTER TABLE "listing_audit_actions" ADD CONSTRAINT "listing_audit_actions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "unprofitable_listing_flags" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "expectedMargin" DECIMAL(8,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unprofitable_listing_flags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "unprofitable_listing_flags_productId_idx" ON "unprofitable_listing_flags"("productId");
CREATE INDEX IF NOT EXISTS "unprofitable_listing_flags_marketplace_idx" ON "unprofitable_listing_flags"("marketplace");
CREATE INDEX IF NOT EXISTS "unprofitable_listing_flags_createdAt_idx" ON "unprofitable_listing_flags"("createdAt");

ALTER TABLE "unprofitable_listing_flags" ADD CONSTRAINT "unprofitable_listing_flags_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
