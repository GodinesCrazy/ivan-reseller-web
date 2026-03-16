-- Phase 5: Auto Listing Strategy Engine - decisions (productId, marketplace, priorityScore, executed)
CREATE TABLE IF NOT EXISTS "auto_listing_decisions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "priorityScore" DECIMAL(5,2) NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_listing_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "auto_listing_decisions_userId_idx" ON "auto_listing_decisions"("userId");
CREATE INDEX IF NOT EXISTS "auto_listing_decisions_productId_idx" ON "auto_listing_decisions"("productId");
CREATE INDEX IF NOT EXISTS "auto_listing_decisions_marketplace_idx" ON "auto_listing_decisions"("marketplace");
CREATE INDEX IF NOT EXISTS "auto_listing_decisions_createdAt_idx" ON "auto_listing_decisions"("createdAt");
CREATE INDEX IF NOT EXISTS "auto_listing_decisions_executed_idx" ON "auto_listing_decisions"("executed");

ALTER TABLE "auto_listing_decisions" ADD CONSTRAINT "auto_listing_decisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_listing_decisions" ADD CONSTRAINT "auto_listing_decisions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
