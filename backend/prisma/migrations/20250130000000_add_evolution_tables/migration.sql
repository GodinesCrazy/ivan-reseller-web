-- DynamicPriceLog
CREATE TABLE IF NOT EXISTS "dynamic_price_logs" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "orderId" TEXT,
    "previousPriceUsd" DECIMAL(18,2) NOT NULL,
    "newPriceUsd" DECIMAL(18,2) NOT NULL,
    "costUsd" DECIMAL(18,2) NOT NULL,
    "competitorMinUsd" DECIMAL(18,2),
    "competitorAvgUsd" DECIMAL(18,2),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dynamic_price_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dynamic_price_logs_productId_idx" ON "dynamic_price_logs"("productId");
CREATE INDEX IF NOT EXISTS "dynamic_price_logs_createdAt_idx" ON "dynamic_price_logs"("createdAt");

-- Account clustering
CREATE TABLE IF NOT EXISTS "account_clusters" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_clusters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "account_clusters_userId_idx" ON "account_clusters"("userId");

CREATE TABLE IF NOT EXISTS "marketplace_accounts" (
    "id" SERIAL NOT NULL,
    "clusterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "apiName" TEXT NOT NULL,
    "credentialId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastHealthAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marketplace_accounts_clusterId_idx" ON "marketplace_accounts"("clusterId");

CREATE TABLE IF NOT EXISTS "paypal_accounts" (
    "id" SERIAL NOT NULL,
    "clusterId" INTEGER NOT NULL,
    "identifier" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastHealthAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paypal_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "paypal_accounts_clusterId_idx" ON "paypal_accounts"("clusterId");

CREATE TABLE IF NOT EXISTS "aliexpress_accounts" (
    "id" SERIAL NOT NULL,
    "clusterId" INTEGER NOT NULL,
    "identifier" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastHealthAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aliexpress_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "aliexpress_accounts_clusterId_idx" ON "aliexpress_accounts"("clusterId");

ALTER TABLE "marketplace_accounts" ADD CONSTRAINT "marketplace_accounts_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "account_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paypal_accounts" ADD CONSTRAINT "paypal_accounts_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "account_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aliexpress_accounts" ADD CONSTRAINT "aliexpress_accounts_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "account_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LearningScore
CREATE TABLE IF NOT EXISTS "learning_scores" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "priceRangeMin" DECIMAL(18,2) NOT NULL,
    "priceRangeMax" DECIMAL(18,2) NOT NULL,
    "conversionRate" DECIMAL(8,4) NOT NULL,
    "avgProfit" DECIMAL(18,2) NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "learningScore" DECIMAL(8,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "learning_scores_userId_category_key" ON "learning_scores"("userId", "category");
CREATE INDEX IF NOT EXISTS "learning_scores_userId_idx" ON "learning_scores"("userId");
