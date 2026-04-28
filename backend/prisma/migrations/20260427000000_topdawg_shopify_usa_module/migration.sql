-- TopDawg → Shopify USA module tables

CREATE TABLE "topdawg_shopify_usa_account_settings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "shopifyStoreUrl" TEXT,
    "shopifyLocationId" TEXT,
    "topDawgApiKey" TEXT,
    "minMarginPct" DECIMAL(6,4),
    "minProfitUsd" DECIMAL(8,2),
    "maxShippingUsd" DECIMAL(8,2),
    "minCostUsd" DECIMAL(8,2),
    "defaultShippingUsd" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_account_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topdawg_shopify_usa_account_settings_userId_key" ON "topdawg_shopify_usa_account_settings"("userId");

CREATE TABLE "topdawg_shopify_usa_products" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tdSku" VARCHAR(200) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "brand" VARCHAR(200),
    "category" VARCHAR(200),
    "upc" VARCHAR(50),
    "images" JSONB,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topdawg_shopify_usa_products_userId_tdSku_key" ON "topdawg_shopify_usa_products"("userId", "tdSku");

CREATE TABLE "topdawg_shopify_usa_product_variants" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "tdVariantSku" VARCHAR(200) NOT NULL,
    "title" TEXT NOT NULL,
    "wholesaleCost" DECIMAL(10,4) NOT NULL,
    "msrp" DECIMAL(10,4),
    "stockQty" INTEGER,
    "attributes" JSONB,
    "stockCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_product_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topdawg_shopify_usa_product_variants_productId_tdVariantSku_key" ON "topdawg_shopify_usa_product_variants"("productId", "tdVariantSku");

CREATE TABLE "topdawg_shopify_usa_product_evaluations" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_product_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topdawg_shopify_usa_listings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "shopifyProductId" TEXT,
    "shopifyVariantId" TEXT,
    "shopifyHandle" TEXT,
    "shopifySku" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "listedPriceUsd" DECIMAL(18,2),
    "quantity" INTEGER,
    "draftPayload" JSONB,
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topdawg_shopify_usa_orders" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "listingId" INTEGER,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT,
    "tdOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "totalUsd" DECIMAL(10,2),
    "lastError" TEXT,
    "rawShopifyOrder" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topdawg_shopify_usa_orders_userId_shopifyOrderId_key" ON "topdawg_shopify_usa_orders"("userId", "shopifyOrderId");

CREATE TABLE "topdawg_shopify_usa_order_events" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "step" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "topdawg_shopify_usa_order_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topdawg_shopify_usa_tracking" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "trackingNumber" TEXT,
    "carrierCode" VARCHAR(100),
    "status" VARCHAR(50),
    "syncedToShopify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_tracking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topdawg_shopify_usa_alerts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topdawg_shopify_usa_execution_traces" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "correlationId" VARCHAR(100),
    "step" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "durationMs" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "topdawg_shopify_usa_execution_traces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topdawg_shopify_usa_profit_snapshots" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "revenueUsd" DECIMAL(12,2) NOT NULL,
    "costUsd" DECIMAL(12,2) NOT NULL,
    "feesUsd" DECIMAL(12,2) NOT NULL,
    "profitUsd" DECIMAL(12,2) NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topdawg_shopify_usa_profit_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topdawg_shopify_usa_profit_snapshots_userId_date_key" ON "topdawg_shopify_usa_profit_snapshots"("userId", "date");

-- Foreign keys
ALTER TABLE "topdawg_shopify_usa_account_settings" ADD CONSTRAINT "topdawg_shopify_usa_account_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_products" ADD CONSTRAINT "topdawg_shopify_usa_products_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_product_variants" ADD CONSTRAINT "topdawg_shopify_usa_product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "topdawg_shopify_usa_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_product_evaluations" ADD CONSTRAINT "topdawg_shopify_usa_product_evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_product_evaluations" ADD CONSTRAINT "topdawg_shopify_usa_product_evaluations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "topdawg_shopify_usa_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_product_evaluations" ADD CONSTRAINT "topdawg_shopify_usa_product_evaluations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "topdawg_shopify_usa_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_listings" ADD CONSTRAINT "topdawg_shopify_usa_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_listings" ADD CONSTRAINT "topdawg_shopify_usa_listings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "topdawg_shopify_usa_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_listings" ADD CONSTRAINT "topdawg_shopify_usa_listings_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "topdawg_shopify_usa_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_orders" ADD CONSTRAINT "topdawg_shopify_usa_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_orders" ADD CONSTRAINT "topdawg_shopify_usa_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "topdawg_shopify_usa_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_order_events" ADD CONSTRAINT "topdawg_shopify_usa_order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "topdawg_shopify_usa_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_tracking" ADD CONSTRAINT "topdawg_shopify_usa_tracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "topdawg_shopify_usa_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_alerts" ADD CONSTRAINT "topdawg_shopify_usa_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topdawg_shopify_usa_profit_snapshots" ADD CONSTRAINT "topdawg_shopify_usa_profit_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
