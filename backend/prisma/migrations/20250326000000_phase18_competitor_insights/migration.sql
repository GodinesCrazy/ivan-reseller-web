-- Phase 18: Competitor Intelligence — competitor_insights table
CREATE TABLE "competitor_insights" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER,
    "userId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "categoryId" TEXT,
    "keywordPatterns" TEXT,
    "priceMin" DECIMAL(18,2),
    "priceMax" DECIMAL(18,2),
    "priceMedian" DECIMAL(18,2),
    "imageCountAvg" DOUBLE PRECISION,
    "salesVelocityEst" DOUBLE PRECISION,
    "competitionScore" DECIMAL(5,2),
    "competitorCount" INTEGER,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "competitor_insights_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "competitor_insights_userId_idx" ON "competitor_insights"("userId");
CREATE INDEX "competitor_insights_listingId_idx" ON "competitor_insights"("listingId");
CREATE INDEX "competitor_insights_marketplace_idx" ON "competitor_insights"("marketplace");
CREATE INDEX "competitor_insights_analyzedAt_idx" ON "competitor_insights"("analyzedAt");

ALTER TABLE "competitor_insights" ADD CONSTRAINT "competitor_insights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competitor_insights" ADD CONSTRAINT "competitor_insights_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
