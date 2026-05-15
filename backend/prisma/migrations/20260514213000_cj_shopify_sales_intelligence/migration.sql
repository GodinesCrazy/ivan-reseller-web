-- CJ Shopify USA sales intelligence, commercial hygiene config and experiments.

ALTER TABLE "cj_shopify_usa_account_settings"
  ADD COLUMN IF NOT EXISTS "cleanupNoTractionDays" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS "cleanupMinViewsToDecide" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "cleanupMinAddToCart" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "cleanupAutoPauseEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cleanupArchiveEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "cj_shopify_usa_product_metric_daily" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "listingId" INTEGER,
  "productId" INTEGER,
  "metricDate" DATE NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'collector',
  "productViews" INTEGER NOT NULL DEFAULT 0,
  "addToCarts" INTEGER NOT NULL DEFAULT 0,
  "checkoutStarted" INTEGER NOT NULL DEFAULT 0,
  "purchases" INTEGER NOT NULL DEFAULT 0,
  "socialClicks" INTEGER NOT NULL DEFAULT 0,
  "revenueUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cj_shopify_usa_product_metric_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cj_shopify_usa_product_metric_daily_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "cj_shopify_usa_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cj_shopify_usa_product_metric_daily_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_shopify_usa_products"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cj_shopify_usa_product_metric_daily_userId_metricDate_listingId_productId_source_key"
  ON "cj_shopify_usa_product_metric_daily" ("userId", "metricDate", "listingId", "productId", "source");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_product_metric_daily_userId_metricDate_idx"
  ON "cj_shopify_usa_product_metric_daily" ("userId", "metricDate");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_product_metric_daily_listingId_idx"
  ON "cj_shopify_usa_product_metric_daily" ("listingId");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_product_metric_daily_productId_idx"
  ON "cj_shopify_usa_product_metric_daily" ("productId");

CREATE TABLE IF NOT EXISTS "cj_shopify_usa_product_experiments" (
  "id" TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "listingId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "hypothesis" TEXT,
  "baseline" JSONB,
  "guardrails" JSONB,
  "startedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "winnerVariantId" TEXT,
  "decisionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cj_shopify_usa_product_experiments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cj_shopify_usa_product_experiments_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "cj_shopify_usa_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cj_shopify_usa_product_experiments_userId_status_idx"
  ON "cj_shopify_usa_product_experiments" ("userId", "status");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_product_experiments_listingId_idx"
  ON "cj_shopify_usa_product_experiments" ("listingId");

CREATE TABLE IF NOT EXISTS "cj_shopify_usa_product_experiment_variants" (
  "id" TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "experimentId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "views" INTEGER NOT NULL DEFAULT 0,
  "addToCarts" INTEGER NOT NULL DEFAULT 0,
  "purchases" INTEGER NOT NULL DEFAULT 0,
  "revenueUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cj_shopify_usa_product_experiment_variants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cj_shopify_usa_product_experiment_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "cj_shopify_usa_product_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cj_shopify_usa_product_experiment_variants_userId_idx"
  ON "cj_shopify_usa_product_experiment_variants" ("userId");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_product_experiment_variants_experimentId_idx"
  ON "cj_shopify_usa_product_experiment_variants" ("experimentId");
