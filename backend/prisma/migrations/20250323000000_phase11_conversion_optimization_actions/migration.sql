-- Phase 11: Conversion Rate Optimization Engine - CRO actions (image_optimization | price_adjustment | title_restructuring | description_improvement | attribute_completion)
CREATE TABLE IF NOT EXISTS "conversion_optimization_actions" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_optimization_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "conversion_optimization_actions_listingId_idx" ON "conversion_optimization_actions"("listingId");
CREATE INDEX IF NOT EXISTS "conversion_optimization_actions_actionType_idx" ON "conversion_optimization_actions"("actionType");
CREATE INDEX IF NOT EXISTS "conversion_optimization_actions_createdAt_idx" ON "conversion_optimization_actions"("createdAt");
CREATE INDEX IF NOT EXISTS "conversion_optimization_actions_executed_idx" ON "conversion_optimization_actions"("executed");

ALTER TABLE "conversion_optimization_actions" ADD CONSTRAINT "conversion_optimization_actions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
