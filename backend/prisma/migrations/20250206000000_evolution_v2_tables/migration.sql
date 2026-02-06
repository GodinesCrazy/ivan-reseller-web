-- DynamicPriceHistory (spec: productId, oldPrice, newPrice, reason, createdAt)
CREATE TABLE IF NOT EXISTS "dynamic_price_history" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "oldPrice" DECIMAL(18,2) NOT NULL,
    "newPrice" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dynamic_price_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dynamic_price_history_productId_idx" ON "dynamic_price_history"("productId");
CREATE INDEX IF NOT EXISTS "dynamic_price_history_createdAt_idx" ON "dynamic_price_history"("createdAt");

-- PurchaseAttemptLog (orderId, provider, success, error, createdAt)
CREATE TABLE IF NOT EXISTS "purchase_attempt_logs" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_attempt_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "purchase_attempt_logs_orderId_idx" ON "purchase_attempt_logs"("orderId");

-- ProductPerformance (productId, category, views, clicks, conversions, revenue)
CREATE TABLE IF NOT EXISTS "product_performance" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "product_performance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_performance_productId_key" ON "product_performance"("productId");
CREATE INDEX IF NOT EXISTS "product_performance_category_idx" ON "product_performance"("category");

-- Add dailyUsage, maxDailyUsage to account tables
ALTER TABLE "marketplace_accounts" ADD COLUMN "dailyUsage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "marketplace_accounts" ADD COLUMN "maxDailyUsage" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "paypal_accounts" ADD COLUMN "dailyUsage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "paypal_accounts" ADD COLUMN "maxDailyUsage" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "aliexpress_accounts" ADD COLUMN "dailyUsage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "aliexpress_accounts" ADD COLUMN "maxDailyUsage" INTEGER NOT NULL DEFAULT 100;
