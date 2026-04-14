-- CJ → eBay USA vertical (FASE 3A). Isolated tables; no legacy Product/Order/Sale changes.

CREATE TABLE "cj_ebay_account_settings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "minMarginPct" DECIMAL(6,4),
    "minProfitUsd" DECIMAL(18,2),
    "maxShippingUsd" DECIMAL(18,2),
    "handlingBufferDays" INTEGER NOT NULL DEFAULT 3,
    "minStock" INTEGER NOT NULL DEFAULT 1,
    "rejectOnUnknownShipping" BOOLEAN NOT NULL DEFAULT true,
    "maxRiskScore" INTEGER,
    "priceChangePctReevaluate" DECIMAL(6,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_account_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cj_ebay_account_settings_userId_key" ON "cj_ebay_account_settings"("userId");

CREATE TABLE "cj_ebay_products" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cj_ebay_products_userId_cjProductId_key" ON "cj_ebay_products"("userId", "cjProductId");
CREATE INDEX "cj_ebay_products_userId_idx" ON "cj_ebay_products"("userId");
CREATE INDEX "cj_ebay_products_userId_snapshotStatus_idx" ON "cj_ebay_products"("userId", "snapshotStatus");

CREATE TABLE "cj_ebay_product_variants" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "cjSku" TEXT NOT NULL,
    "attributes" JSONB,
    "unitCostUsd" DECIMAL(18,2),
    "stockLastKnown" INTEGER,
    "stockCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_product_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cj_ebay_product_variants_productId_cjSku_key" ON "cj_ebay_product_variants"("productId", "cjSku");
CREATE INDEX "cj_ebay_product_variants_productId_idx" ON "cj_ebay_product_variants"("productId");

CREATE TABLE "cj_ebay_shipping_quotes" (
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
    "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cj_ebay_shipping_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cj_ebay_shipping_quotes_userId_idx" ON "cj_ebay_shipping_quotes"("userId");
CREATE INDEX "cj_ebay_shipping_quotes_productId_idx" ON "cj_ebay_shipping_quotes"("productId");

CREATE TABLE "cj_ebay_product_evaluations" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "shippingQuoteId" INTEGER,
    "decision" TEXT NOT NULL,
    "reasons" JSONB,
    "estimatedMarginPct" DECIMAL(8,4),
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cj_ebay_product_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cj_ebay_product_evaluations_userId_idx" ON "cj_ebay_product_evaluations"("userId");
CREATE INDEX "cj_ebay_product_evaluations_userId_decision_idx" ON "cj_ebay_product_evaluations"("userId", "decision");
CREATE INDEX "cj_ebay_product_evaluations_productId_idx" ON "cj_ebay_product_evaluations"("productId");

CREATE TABLE "cj_ebay_listings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "ebayListingId" TEXT,
    "ebayOfferId" TEXT,
    "ebaySku" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "listedPriceUsd" DECIMAL(18,2),
    "quantity" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_listings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cj_ebay_listings_userId_idx" ON "cj_ebay_listings"("userId");
CREATE INDEX "cj_ebay_listings_userId_status_idx" ON "cj_ebay_listings"("userId", "status");
CREATE INDEX "cj_ebay_listings_ebayListingId_idx" ON "cj_ebay_listings"("ebayListingId");

CREATE TABLE "cj_ebay_orders" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "ebayOrderId" TEXT NOT NULL,
    "cjOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "lineItemRef" TEXT,
    "productId" INTEGER,
    "variantId" INTEGER,
    "buyerPayload" JSONB,
    "totalUsd" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cj_ebay_orders_userId_ebayOrderId_key" ON "cj_ebay_orders"("userId", "ebayOrderId");
CREATE INDEX "cj_ebay_orders_userId_status_idx" ON "cj_ebay_orders"("userId", "status");

CREATE TABLE "cj_ebay_order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cj_ebay_order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cj_ebay_order_events_orderId_idx" ON "cj_ebay_order_events"("orderId");
CREATE INDEX "cj_ebay_order_events_createdAt_idx" ON "cj_ebay_order_events"("createdAt");

CREATE TABLE "cj_ebay_tracking" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrierCode" TEXT,
    "trackingNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_AVAILABLE',
    "rawPayload" JSONB,
    "submittedToEbayAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_ebay_tracking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cj_ebay_tracking_orderId_key" ON "cj_ebay_tracking"("orderId");

CREATE TABLE "cj_ebay_alerts" (
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

    CONSTRAINT "cj_ebay_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cj_ebay_alerts_userId_status_idx" ON "cj_ebay_alerts"("userId", "status");
CREATE INDEX "cj_ebay_alerts_userId_severity_idx" ON "cj_ebay_alerts"("userId", "severity");

CREATE TABLE "cj_ebay_profit_snapshots" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "estimatedRevenueUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedFeesUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedCjCostUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedProfitUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cj_ebay_profit_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cj_ebay_profit_snapshots_userId_snapshotDate_key" ON "cj_ebay_profit_snapshots"("userId", "snapshotDate");
CREATE INDEX "cj_ebay_profit_snapshots_userId_idx" ON "cj_ebay_profit_snapshots"("userId");

CREATE TABLE "cj_ebay_execution_traces" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "correlationId" TEXT,
    "route" TEXT,
    "step" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cj_ebay_execution_traces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cj_ebay_execution_traces_userId_createdAt_idx" ON "cj_ebay_execution_traces"("userId", "createdAt");
CREATE INDEX "cj_ebay_execution_traces_correlationId_idx" ON "cj_ebay_execution_traces"("correlationId");

ALTER TABLE "cj_ebay_account_settings" ADD CONSTRAINT "cj_ebay_account_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_products" ADD CONSTRAINT "cj_ebay_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_product_variants" ADD CONSTRAINT "cj_ebay_product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_shipping_quotes" ADD CONSTRAINT "cj_ebay_shipping_quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_shipping_quotes" ADD CONSTRAINT "cj_ebay_shipping_quotes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_shipping_quotes" ADD CONSTRAINT "cj_ebay_shipping_quotes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ebay_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_product_evaluations" ADD CONSTRAINT "cj_ebay_product_evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_product_evaluations" ADD CONSTRAINT "cj_ebay_product_evaluations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_product_evaluations" ADD CONSTRAINT "cj_ebay_product_evaluations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ebay_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_product_evaluations" ADD CONSTRAINT "cj_ebay_product_evaluations_shippingQuoteId_fkey" FOREIGN KEY ("shippingQuoteId") REFERENCES "cj_ebay_shipping_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_listings" ADD CONSTRAINT "cj_ebay_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_listings" ADD CONSTRAINT "cj_ebay_listings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_ebay_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_listings" ADD CONSTRAINT "cj_ebay_listings_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "cj_ebay_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_orders" ADD CONSTRAINT "cj_ebay_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_order_events" ADD CONSTRAINT "cj_ebay_order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "cj_ebay_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_tracking" ADD CONSTRAINT "cj_ebay_tracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "cj_ebay_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_alerts" ADD CONSTRAINT "cj_ebay_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_profit_snapshots" ADD CONSTRAINT "cj_ebay_profit_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cj_ebay_execution_traces" ADD CONSTRAINT "cj_ebay_execution_traces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
