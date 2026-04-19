-- CJ → eBay UK vertical — Phase 1 migration
-- Creates all cj_ebay_uk_* tables.
-- Mirrors cj_ebay_* structure with UK-specific fields (GBP, VAT, FX rate).

CREATE TABLE "cj_ebay_uk_account_settings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "minMarginPct" DECIMAL(6,4),
    "minProfitGbp" DECIMAL(18,2),
    "maxShippingUsd" DECIMAL(18,2),
    "handlingBufferDays" INTEGER NOT NULL DEFAULT 3,
    "minStock" INTEGER NOT NULL DEFAULT 1,
    "rejectOnUnknownShipping" BOOLEAN NOT NULL DEFAULT true,
    "maxRiskScore" INTEGER,
    "priceChangePctReevaluate" DECIMAL(6,4),
    "incidentBufferPct" DECIMAL(6,4),
    "defaultEbayFeePct" DECIMAL(6,4),
    "defaultPaymentFeePct" DECIMAL(6,4),
    "defaultPaymentFixedFeeGbp" DECIMAL(18,2),
    "ukVatPct" DECIMAL(6,4) NOT NULL DEFAULT 20,
    "vatMarketplaceFacilitated" BOOLEAN NOT NULL DEFAULT true,
    "fxRateUsdToGbp" DECIMAL(10,6) NOT NULL DEFAULT 0.79,
    "cjPostCreateCheckoutMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_account_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ebay_uk_account_settings_userId_key" ON "cj_ebay_uk_account_settings"("userId");

CREATE TABLE "cj_ebay_uk_products" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cjProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "images" JSONB,
    "rawPayloadHash" TEXT,
    "snapshotStatus" TEXT NOT NULL DEFAULT 'SYNCED',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ebay_uk_products_userId_cjProductId_key" ON "cj_ebay_uk_products"("userId", "cjProductId");
CREATE INDEX "cj_ebay_uk_products_userId_idx" ON "cj_ebay_uk_products"("userId");
CREATE INDEX "cj_ebay_uk_products_userId_snapshotStatus_idx" ON "cj_ebay_uk_products"("userId", "snapshotStatus");

CREATE TABLE "cj_ebay_uk_product_variants" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "cjSku" TEXT NOT NULL,
    "cjVid" TEXT,
    "attributes" JSONB,
    "unitCostUsd" DECIMAL(18,2),
    "stockLastKnown" INTEGER,
    "stockCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_product_variants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ebay_uk_product_variants_productId_cjSku_key" ON "cj_ebay_uk_product_variants"("productId", "cjSku");
CREATE INDEX "cj_ebay_uk_product_variants_productId_idx" ON "cj_ebay_uk_product_variants"("productId");
CREATE INDEX "cj_ebay_uk_product_variants_productId_cjVid_idx" ON "cj_ebay_uk_product_variants"("productId", "cjVid");

CREATE TABLE "cj_ebay_uk_shipping_quotes" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "amountGbp" DECIMAL(18,2),
    "fxRateUsed" DECIMAL(10,6),
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "serviceName" TEXT,
    "carrier" TEXT,
    "estimatedMinDays" INTEGER,
    "estimatedMaxDays" INTEGER,
    "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "fulfillmentOrigin" TEXT,
    "requestPayload" JSONB,
    "responseRaw" JSONB,
    "originCountryCode" TEXT,
    "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "cj_ebay_uk_shipping_quotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_shipping_quotes_userId_productId_idx" ON "cj_ebay_uk_shipping_quotes"("userId", "productId");

CREATE TABLE "cj_ebay_uk_product_evaluations" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "shippingQuoteId" INTEGER,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "reasons" JSONB,
    "supplierCostUsd" DECIMAL(18,2),
    "shippingUsd" DECIMAL(18,2),
    "shippingGbp" DECIMAL(18,2),
    "fxRateUsed" DECIMAL(10,6),
    "estimatedListPriceGbp" DECIMAL(18,2),
    "estimatedMarginPct" DECIMAL(6,4),
    "estimatedProfitGbp" DECIMAL(18,2),
    "vatDeductedGbp" DECIMAL(18,2),
    "riskScore" INTEGER,
    "fulfillmentOrigin" TEXT,
    "rawBreakdown" JSONB,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "cj_ebay_uk_product_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_product_evaluations_userId_decision_idx" ON "cj_ebay_uk_product_evaluations"("userId", "decision");
CREATE INDEX "cj_ebay_uk_product_evaluations_productId_idx" ON "cj_ebay_uk_product_evaluations"("productId");

CREATE TABLE "cj_ebay_uk_listings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ebayListingId" TEXT,
    "ebayOfferId" TEXT,
    "ebaySku" TEXT,
    "listedPriceGbp" DECIMAL(18,2),
    "draftPayload" JSONB,
    "publishError" TEXT,
    "reconcileCount" INTEGER NOT NULL DEFAULT 0,
    "reconcileRetryAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_listings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ebay_uk_listings_ebaySku_key" ON "cj_ebay_uk_listings"("ebaySku");
CREATE INDEX "cj_ebay_uk_listings_userId_status_idx" ON "cj_ebay_uk_listings"("userId", "status");
CREATE INDEX "cj_ebay_uk_listings_userId_productId_idx" ON "cj_ebay_uk_listings"("userId", "productId");

CREATE TABLE "cj_ebay_uk_orders" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER,
    "variantId" INTEGER,
    "listingId" INTEGER,
    "ebayOrderId" TEXT NOT NULL,
    "cjOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "paymentBlockReason" TEXT,
    "totalGbp" DECIMAL(18,2),
    "rawEbaySummary" JSONB,
    "buyerPayload" JSONB,
    "cjOrderPayload" JSONB,
    "events" JSONB,
    "cjPostCreateCheckoutMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ebay_uk_orders_userId_ebayOrderId_key" ON "cj_ebay_uk_orders"("userId", "ebayOrderId");
CREATE INDEX "cj_ebay_uk_orders_userId_status_idx" ON "cj_ebay_uk_orders"("userId", "status");

CREATE TABLE "cj_ebay_uk_order_refunds" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RETURN_REQUESTED',
    "type" TEXT NOT NULL DEFAULT 'FULL',
    "amountGbp" DECIMAL(18,2),
    "reason" TEXT,
    "notes" TEXT,
    "events" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_order_refunds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_order_refunds_orderId_idx" ON "cj_ebay_uk_order_refunds"("orderId");

CREATE TABLE "cj_ebay_uk_tracking" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "carrierCode" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "cjOrderStatus" TEXT,
    "submittedToEbayAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_tracking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_tracking_orderId_idx" ON "cj_ebay_uk_tracking"("orderId");

CREATE TABLE "cj_ebay_uk_alerts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_alerts_userId_status_idx" ON "cj_ebay_uk_alerts"("userId", "status");
CREATE INDEX "cj_ebay_uk_alerts_userId_type_idx" ON "cj_ebay_uk_alerts"("userId", "type");

CREATE TABLE "cj_ebay_uk_profit_snapshots" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "estimatedRevenueGbp" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedCjCostUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedProfitGbp" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "activeOrders" INTEGER NOT NULL DEFAULT 0,
    "refundedAmountGbp" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_profit_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ebay_uk_profit_snapshots_userId_snapshotDate_key" ON "cj_ebay_uk_profit_snapshots"("userId", "snapshotDate");
CREATE INDEX "cj_ebay_uk_profit_snapshots_userId_idx" ON "cj_ebay_uk_profit_snapshots"("userId");

CREATE TABLE "cj_ebay_uk_execution_traces" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "correlationId" TEXT,
    "route" TEXT,
    "step" TEXT NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_execution_traces_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_execution_traces_userId_createdAt_idx" ON "cj_ebay_uk_execution_traces"("userId", "createdAt");
CREATE INDEX "cj_ebay_uk_execution_traces_correlationId_idx" ON "cj_ebay_uk_execution_traces"("correlationId");

CREATE TABLE "cj_ebay_uk_opportunity_runs" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'STARTER',
    "settings" JSONB,
    "providerUsed" TEXT,
    "providerNote" TEXT,
    "seedCount" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "shortlistedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_opportunity_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_opportunity_runs_userId_status_idx" ON "cj_ebay_uk_opportunity_runs"("userId", "status");

CREATE TABLE "cj_ebay_uk_opportunity_candidates" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "seedKeyword" TEXT NOT NULL,
    "seedSource" TEXT NOT NULL DEFAULT 'MOCK_TREND',
    "seedCategory" TEXT,
    "seedConfidence" DECIMAL(6,4),
    "cjProductId" TEXT NOT NULL,
    "cjProductTitle" TEXT NOT NULL,
    "cjVariantSku" TEXT NOT NULL,
    "cjVariantVid" TEXT,
    "images" JSONB,
    "supplierCostUsd" DECIMAL(18,2),
    "shippingUsd" DECIMAL(18,2),
    "shippingGbp" DECIMAL(18,2),
    "shippingConfidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "shippingDaysMin" INTEGER,
    "shippingDaysMax" INTEGER,
    "stockCount" INTEGER,
    "marketObservedPriceGbp" DECIMAL(18,2),
    "pricingSnapshot" JSONB,
    "scoreSnapshot" JSONB,
    "recommendationReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SHORTLISTED',
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3),
    "linkedEvaluationId" INTEGER,
    "trendSourceType" TEXT NOT NULL DEFAULT 'MOCK',
    "marketPriceSourceType" TEXT NOT NULL DEFAULT 'MOCK',
    "dataConfidenceScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ebay_uk_opportunity_candidates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ebay_uk_opportunity_candidates_runId_idx" ON "cj_ebay_uk_opportunity_candidates"("runId");
CREATE INDEX "cj_ebay_uk_opportunity_candidates_userId_status_idx" ON "cj_ebay_uk_opportunity_candidates"("userId", "status");
CREATE INDEX "cj_ebay_uk_opportunity_candidates_userId_totalScore_idx" ON "cj_ebay_uk_opportunity_candidates"("userId", "totalScore");

-- Foreign keys
ALTER TABLE "cj_ebay_uk_account_settings" ADD CONSTRAINT "cj_ebay_uk_account_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_products" ADD CONSTRAINT "cj_ebay_uk_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_product_variants" ADD CONSTRAINT "cj_ebay_uk_product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_uk_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_shipping_quotes" ADD CONSTRAINT "cj_ebay_uk_shipping_quotes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_uk_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_shipping_quotes" ADD CONSTRAINT "cj_ebay_uk_shipping_quotes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ebay_uk_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_shipping_quotes" ADD CONSTRAINT "cj_ebay_uk_shipping_quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_product_evaluations" ADD CONSTRAINT "cj_ebay_uk_product_evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_product_evaluations" ADD CONSTRAINT "cj_ebay_uk_product_evaluations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_uk_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_product_evaluations" ADD CONSTRAINT "cj_ebay_uk_product_evaluations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ebay_uk_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_listings" ADD CONSTRAINT "cj_ebay_uk_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_listings" ADD CONSTRAINT "cj_ebay_uk_listings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_uk_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_listings" ADD CONSTRAINT "cj_ebay_uk_listings_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ebay_uk_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_orders" ADD CONSTRAINT "cj_ebay_uk_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_orders" ADD CONSTRAINT "cj_ebay_uk_orders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_uk_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_orders" ADD CONSTRAINT "cj_ebay_uk_orders_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ebay_uk_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_orders" ADD CONSTRAINT "cj_ebay_uk_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "cj_ebay_uk_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_order_refunds" ADD CONSTRAINT "cj_ebay_uk_order_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "cj_ebay_uk_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_tracking" ADD CONSTRAINT "cj_ebay_uk_tracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "cj_ebay_uk_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_alerts" ADD CONSTRAINT "cj_ebay_uk_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_profit_snapshots" ADD CONSTRAINT "cj_ebay_uk_profit_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_execution_traces" ADD CONSTRAINT "cj_ebay_uk_execution_traces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_opportunity_runs" ADD CONSTRAINT "cj_ebay_uk_opportunity_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_opportunity_candidates" ADD CONSTRAINT "cj_ebay_uk_opportunity_candidates_runId_fkey" FOREIGN KEY ("runId") REFERENCES "cj_ebay_uk_opportunity_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_uk_opportunity_candidates" ADD CONSTRAINT "cj_ebay_uk_opportunity_candidates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
