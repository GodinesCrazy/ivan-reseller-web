-- Phase 7: Global Demand Radar - external demand signals (trendScore 0-100)
CREATE TABLE IF NOT EXISTS "demand_signals" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "externalProductId" TEXT,
    "keyword" TEXT NOT NULL,
    "trendScore" DECIMAL(5,2) NOT NULL,
    "demandScore" DECIMAL(5,2),
    "confidence" DECIMAL(5,4) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "demand_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "demand_signals_source_idx" ON "demand_signals"("source");
CREATE INDEX IF NOT EXISTS "demand_signals_keyword_idx" ON "demand_signals"("keyword");
CREATE INDEX IF NOT EXISTS "demand_signals_detectedAt_idx" ON "demand_signals"("detectedAt");
CREATE INDEX IF NOT EXISTS "demand_signals_trendScore_idx" ON "demand_signals"("trendScore");
