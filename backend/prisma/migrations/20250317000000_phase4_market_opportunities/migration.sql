-- Phase 4: Market Intelligence Engine - discovered high-potential products (0-100 score)
CREATE TABLE IF NOT EXISTS "market_opportunities" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER,
    "externalProductId" TEXT,
    "source" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "trendScore" DECIMAL(5,2),
    "demandScore" DECIMAL(5,2),
    "competitionScore" DECIMAL(5,2),
    "marginScore" DECIMAL(5,2),
    "supplierScore" DECIMAL(5,2),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "market_opportunities_userId_idx" ON "market_opportunities"("userId");
CREATE INDEX IF NOT EXISTS "market_opportunities_productId_idx" ON "market_opportunities"("productId");
CREATE INDEX IF NOT EXISTS "market_opportunities_source_idx" ON "market_opportunities"("source");
CREATE INDEX IF NOT EXISTS "market_opportunities_detectedAt_idx" ON "market_opportunities"("detectedAt");
CREATE INDEX IF NOT EXISTS "market_opportunities_score_idx" ON "market_opportunities"("score");

ALTER TABLE "market_opportunities" ADD CONSTRAINT "market_opportunities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_opportunities" ADD CONSTRAINT "market_opportunities_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
