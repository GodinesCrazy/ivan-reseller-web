-- FASE 3G.1: Market Reality — data quality columns on cj_ebay_opportunity_candidates
-- Adds: trendSourceType, marketPriceSourceType, dataConfidenceScore,
--       recommendationConfidence, starterSuitability, evidenceSummary, marketPriceDetail

ALTER TABLE "cj_ebay_opportunity_candidates"
  ADD COLUMN IF NOT EXISTS "trendSourceType"          TEXT         NOT NULL DEFAULT 'MOCK',
  ADD COLUMN IF NOT EXISTS "marketPriceSourceType"    TEXT         NOT NULL DEFAULT 'ESTIMATED',
  ADD COLUMN IF NOT EXISTS "dataConfidenceScore"      DECIMAL(5,2) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "recommendationConfidence" TEXT         NOT NULL DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS "starterSuitability"       TEXT         NOT NULL DEFAULT 'CAUTION_FOR_STARTER',
  ADD COLUMN IF NOT EXISTS "evidenceSummary"          TEXT,
  ADD COLUMN IF NOT EXISTS "marketPriceDetail"        JSONB;

-- Index for filtering by recommendation confidence (useful for UI badge queries)
CREATE INDEX IF NOT EXISTS "cj_ebay_opportunity_candidates_userId_recConf_idx"
  ON "cj_ebay_opportunity_candidates"("userId", "recommendationConfidence");
