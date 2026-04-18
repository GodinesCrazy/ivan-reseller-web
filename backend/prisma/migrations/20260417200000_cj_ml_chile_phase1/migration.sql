-- CJ → ML Chile Phase 1 — Tablas aisladas del módulo CJ→ML Chile
-- No modifica ninguna tabla existente; solo crea nuevas tablas cj_ml_chile_*

-- cj_ml_chile_account_settings
CREATE TABLE "cj_ml_chile_account_settings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "minMarginPct" DECIMAL(8,4),
    "minProfitUsd" DECIMAL(18,2),
    "minStock" INTEGER NOT NULL DEFAULT 1,
    "maxShippingUsd" DECIMAL(18,2),
    "mlcFeePct" DECIMAL(8,4) NOT NULL DEFAULT 12,
    "mpPaymentFeePct" DECIMAL(8,4) NOT NULL DEFAULT 5.18,
    "incidentBufferPct" DECIMAL(8,4) NOT NULL DEFAULT 2,
    "requireChileWarehouse" BOOLEAN NOT NULL DEFAULT true,
    "rejectOnUnknownShipping" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cj_ml_chile_account_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ml_chile_account_settings_userId_key" ON "cj_ml_chile_account_settings"("userId");
ALTER TABLE "cj_ml_chile_account_settings" ADD CONSTRAINT "cj_ml_chile_account_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cj_ml_chile_products
CREATE TABLE "cj_ml_chile_products" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cjProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "images" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cj_ml_chile_products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ml_chile_products_userId_cjProductId_key" ON "cj_ml_chile_products"("userId", "cjProductId");
CREATE INDEX "cj_ml_chile_products_userId_idx" ON "cj_ml_chile_products"("userId");
ALTER TABLE "cj_ml_chile_products" ADD CONSTRAINT "cj_ml_chile_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cj_ml_chile_product_variants
CREATE TABLE "cj_ml_chile_product_variants" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "cjSku" TEXT NOT NULL,
    "cjVid" TEXT,
    "unitCostUsd" DECIMAL(18,2),
    "stockLastKnown" INTEGER NOT NULL DEFAULT 0,
    "stockCheckedAt" TIMESTAMP(3),
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cj_ml_chile_product_variants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ml_chile_product_variants_productId_cjSku_key" ON "cj_ml_chile_product_variants"("productId", "cjSku");
CREATE INDEX "cj_ml_chile_product_variants_productId_idx" ON "cj_ml_chile_product_variants"("productId");
CREATE INDEX "cj_ml_chile_product_variants_productId_cjVid_idx" ON "cj_ml_chile_product_variants"("productId", "cjVid");
ALTER TABLE "cj_ml_chile_product_variants" ADD CONSTRAINT "cj_ml_chile_product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ml_chile_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cj_ml_chile_shipping_quotes
CREATE TABLE "cj_ml_chile_shipping_quotes" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "serviceName" TEXT,
    "carrier" TEXT,
    "estimatedMinDays" INTEGER,
    "estimatedMaxDays" INTEGER,
    "confidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "originCountryCode" TEXT DEFAULT 'CN',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ml_chile_shipping_quotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ml_chile_shipping_quotes_userId_idx" ON "cj_ml_chile_shipping_quotes"("userId");
CREATE INDEX "cj_ml_chile_shipping_quotes_productId_idx" ON "cj_ml_chile_shipping_quotes"("productId");
ALTER TABLE "cj_ml_chile_shipping_quotes" ADD CONSTRAINT "cj_ml_chile_shipping_quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_shipping_quotes" ADD CONSTRAINT "cj_ml_chile_shipping_quotes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ml_chile_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_shipping_quotes" ADD CONSTRAINT "cj_ml_chile_shipping_quotes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ml_chile_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- cj_ml_chile_product_evaluations
CREATE TABLE "cj_ml_chile_product_evaluations" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "shippingQuoteId" INTEGER,
    "decision" TEXT NOT NULL,
    "reasons" JSONB,
    "estimatedMarginPct" DECIMAL(8,4),
    "landedCostUsd" DECIMAL(18,2),
    "suggestedPriceCLP" DECIMAL(18,0),
    "fxRateUsed" DECIMAL(12,4),
    "fxRateAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ml_chile_product_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ml_chile_product_evaluations_userId_idx" ON "cj_ml_chile_product_evaluations"("userId");
CREATE INDEX "cj_ml_chile_product_evaluations_userId_decision_idx" ON "cj_ml_chile_product_evaluations"("userId", "decision");
CREATE INDEX "cj_ml_chile_product_evaluations_productId_idx" ON "cj_ml_chile_product_evaluations"("productId");
ALTER TABLE "cj_ml_chile_product_evaluations" ADD CONSTRAINT "cj_ml_chile_product_evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_product_evaluations" ADD CONSTRAINT "cj_ml_chile_product_evaluations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ml_chile_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_product_evaluations" ADD CONSTRAINT "cj_ml_chile_product_evaluations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ml_chile_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_product_evaluations" ADD CONSTRAINT "cj_ml_chile_product_evaluations_shippingQuoteId_fkey" FOREIGN KEY ("shippingQuoteId") REFERENCES "cj_ml_chile_shipping_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- cj_ml_chile_listings
CREATE TABLE "cj_ml_chile_listings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "evaluationId" INTEGER,
    "shippingQuoteId" INTEGER,
    "mlListingId" TEXT,
    "mlItemId" TEXT,
    "mlSku" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "listedPriceCLP" DECIMAL(18,0),
    "listedPriceUsd" DECIMAL(18,2),
    "fxRateUsed" DECIMAL(12,4),
    "quantity" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "draftPayload" JSONB,
    "lastError" TEXT,
    "legalTextsAppended" BOOLEAN NOT NULL DEFAULT false,
    "handlingTimeDays" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cj_ml_chile_listings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ml_chile_listings_userId_idx" ON "cj_ml_chile_listings"("userId");
CREATE INDEX "cj_ml_chile_listings_userId_status_idx" ON "cj_ml_chile_listings"("userId", "status");
CREATE INDEX "cj_ml_chile_listings_mlListingId_idx" ON "cj_ml_chile_listings"("mlListingId");
ALTER TABLE "cj_ml_chile_listings" ADD CONSTRAINT "cj_ml_chile_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_listings" ADD CONSTRAINT "cj_ml_chile_listings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ml_chile_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_listings" ADD CONSTRAINT "cj_ml_chile_listings_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ml_chile_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_listings" ADD CONSTRAINT "cj_ml_chile_listings_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "cj_ml_chile_product_evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_listings" ADD CONSTRAINT "cj_ml_chile_listings_shippingQuoteId_fkey" FOREIGN KEY ("shippingQuoteId") REFERENCES "cj_ml_chile_shipping_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- cj_ml_chile_orders
CREATE TABLE "cj_ml_chile_orders" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "mlOrderId" TEXT NOT NULL,
    "cjOrderId" TEXT,
    "listingId" INTEGER,
    "mlSku" TEXT,
    "lineQuantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "rawMlSummary" JSONB,
    "buyerPayload" JSONB,
    "totalCLP" DECIMAL(18,0),
    "totalUsd" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "lastError" TEXT,
    "cjConfirmedAt" TIMESTAMP(3),
    "cjPaidAt" TIMESTAMP(3),
    "paymentBlockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cj_ml_chile_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ml_chile_orders_userId_mlOrderId_key" ON "cj_ml_chile_orders"("userId", "mlOrderId");
CREATE INDEX "cj_ml_chile_orders_userId_status_idx" ON "cj_ml_chile_orders"("userId", "status");
CREATE INDEX "cj_ml_chile_orders_listingId_idx" ON "cj_ml_chile_orders"("listingId");
ALTER TABLE "cj_ml_chile_orders" ADD CONSTRAINT "cj_ml_chile_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ml_chile_orders" ADD CONSTRAINT "cj_ml_chile_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "cj_ml_chile_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- cj_ml_chile_order_events
CREATE TABLE "cj_ml_chile_order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ml_chile_order_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ml_chile_order_events_orderId_idx" ON "cj_ml_chile_order_events"("orderId");
CREATE INDEX "cj_ml_chile_order_events_createdAt_idx" ON "cj_ml_chile_order_events"("createdAt");
ALTER TABLE "cj_ml_chile_order_events" ADD CONSTRAINT "cj_ml_chile_order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "cj_ml_chile_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cj_ml_chile_tracking
CREATE TABLE "cj_ml_chile_tracking" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrierCode" TEXT,
    "trackingNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_AVAILABLE',
    "rawPayload" JSONB,
    "submittedToMlAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cj_ml_chile_tracking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ml_chile_tracking_orderId_key" ON "cj_ml_chile_tracking"("orderId");
ALTER TABLE "cj_ml_chile_tracking" ADD CONSTRAINT "cj_ml_chile_tracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "cj_ml_chile_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cj_ml_chile_alerts
CREATE TABLE "cj_ml_chile_alerts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "payload" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cj_ml_chile_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ml_chile_alerts_userId_status_idx" ON "cj_ml_chile_alerts"("userId", "status");
CREATE INDEX "cj_ml_chile_alerts_userId_severity_idx" ON "cj_ml_chile_alerts"("userId", "severity");
ALTER TABLE "cj_ml_chile_alerts" ADD CONSTRAINT "cj_ml_chile_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cj_ml_chile_profit_snapshots
CREATE TABLE "cj_ml_chile_profit_snapshots" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "estimatedRevenueCLP" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "estimatedRevenueUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedFeesCLP" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "estimatedFeesUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedCjCostUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedLandedCostUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedProfitCLP" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "estimatedProfitUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fxRateUsed" DECIMAL(12,4),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ml_chile_profit_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cj_ml_chile_profit_snapshots_userId_snapshotDate_key" ON "cj_ml_chile_profit_snapshots"("userId", "snapshotDate");
CREATE INDEX "cj_ml_chile_profit_snapshots_userId_idx" ON "cj_ml_chile_profit_snapshots"("userId");
ALTER TABLE "cj_ml_chile_profit_snapshots" ADD CONSTRAINT "cj_ml_chile_profit_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- cj_ml_chile_execution_traces
CREATE TABLE "cj_ml_chile_execution_traces" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "correlationId" TEXT,
    "route" TEXT,
    "step" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cj_ml_chile_execution_traces_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cj_ml_chile_execution_traces_userId_createdAt_idx" ON "cj_ml_chile_execution_traces"("userId", "createdAt");
CREATE INDEX "cj_ml_chile_execution_traces_correlationId_idx" ON "cj_ml_chile_execution_traces"("correlationId");
ALTER TABLE "cj_ml_chile_execution_traces" ADD CONSTRAINT "cj_ml_chile_execution_traces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
