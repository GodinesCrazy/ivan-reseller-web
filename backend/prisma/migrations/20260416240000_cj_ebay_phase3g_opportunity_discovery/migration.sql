-- FASE 3G: AI Opportunity Discovery
-- Tables: cj_ebay_opportunity_runs, cj_ebay_opportunity_candidates

CREATE TABLE "cj_ebay_opportunity_runs" (
    "id"               TEXT NOT NULL,
    "userId"           INTEGER NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "mode"             TEXT NOT NULL DEFAULT 'STARTER',
    "seedCount"        INTEGER NOT NULL DEFAULT 0,
    "candidateCount"   INTEGER NOT NULL DEFAULT 0,
    "shortlistedCount" INTEGER NOT NULL DEFAULT 0,
    "approvedCount"    INTEGER NOT NULL DEFAULT 0,
    "rejectedCount"    INTEGER NOT NULL DEFAULT 0,
    "deferredCount"    INTEGER NOT NULL DEFAULT 0,
    "settings"         JSONB,
    "errorMessage"     TEXT,
    "startedAt"        TIMESTAMP(3),
    "completedAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_opportunity_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cj_ebay_opportunity_candidates" (
    "id"                     TEXT NOT NULL,
    "runId"                  TEXT NOT NULL,
    "userId"                 INTEGER NOT NULL,
    "seedKeyword"            TEXT NOT NULL,
    "seedCategory"           TEXT,
    "seedTrendConfidence"    DECIMAL(4,3) NOT NULL DEFAULT 0.5,
    "seedSource"             TEXT NOT NULL DEFAULT 'MOCK_TREND',
    "cjProductId"            TEXT NOT NULL,
    "cjProductTitle"         TEXT NOT NULL,
    "cjVariantSku"           TEXT NOT NULL,
    "cjVariantVid"           TEXT,
    "images"                 JSONB,
    "supplierCostUsd"        DECIMAL(18,2) NOT NULL,
    "shippingUsd"            DECIMAL(18,2) NOT NULL,
    "shippingConfidence"     TEXT NOT NULL DEFAULT 'UNKNOWN',
    "shippingDaysMin"        INTEGER,
    "shippingDaysMax"        INTEGER,
    "stockCount"             INTEGER,
    "marketObservedPriceUsd" DECIMAL(18,2),
    "pricingBreakdown"       JSONB,
    "scoreBreakdown"         JSONB,
    "totalScore"             DECIMAL(6,3) NOT NULL DEFAULT 0,
    "recommendationReason"   TEXT,
    "status"                 TEXT NOT NULL DEFAULT 'SHORTLISTED',
    "reviewNotes"            TEXT,
    "reviewedAt"             TIMESTAMP(3),
    "handedOffAt"            TIMESTAMP(3),
    "linkedEvaluationId"     INTEGER,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_opportunity_candidates_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "cj_ebay_opportunity_runs"
    ADD CONSTRAINT "cj_ebay_opportunity_runs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cj_ebay_opportunity_candidates"
    ADD CONSTRAINT "cj_ebay_opportunity_candidates_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "cj_ebay_opportunity_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cj_ebay_opportunity_candidates"
    ADD CONSTRAINT "cj_ebay_opportunity_candidates_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "cj_ebay_opportunity_runs_userId_status_idx"
    ON "cj_ebay_opportunity_runs"("userId", "status");

CREATE INDEX "cj_ebay_opportunity_runs_userId_createdAt_idx"
    ON "cj_ebay_opportunity_runs"("userId", "createdAt");

CREATE INDEX "cj_ebay_opportunity_candidates_runId_idx"
    ON "cj_ebay_opportunity_candidates"("runId");

CREATE INDEX "cj_ebay_opportunity_candidates_userId_status_idx"
    ON "cj_ebay_opportunity_candidates"("userId", "status");

CREATE INDEX "cj_ebay_opportunity_candidates_userId_totalScore_idx"
    ON "cj_ebay_opportunity_candidates"("userId", "totalScore");
