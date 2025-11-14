-- CreateTable
CREATE TABLE IF NOT EXISTS "api_status_history" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "apiName" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "status" TEXT NOT NULL,
    "previousStatus" TEXT,
    "isAvailable" BOOLEAN NOT NULL,
    "isConfigured" BOOLEAN NOT NULL,
    "error" TEXT,
    "message" TEXT,
    "latency" INTEGER,
    "trustScore" DOUBLE PRECISION DEFAULT 100.0,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "api_status_snapshots" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "apiName" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "status" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL,
    "isConfigured" BOOLEAN NOT NULL,
    "error" TEXT,
    "message" TEXT,
    "latency" INTEGER,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_status_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_status_history_userId_apiName_environment_idx" ON "api_status_history"("userId", "apiName", "environment");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_status_history_apiName_environment_status_idx" ON "api_status_history"("apiName", "environment", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_status_history_changedAt_idx" ON "api_status_history"("changedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_status_history_userId_changedAt_idx" ON "api_status_history"("userId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "api_status_snapshots_userId_apiName_environment_key" ON "api_status_snapshots"("userId", "apiName", "environment");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_status_snapshots_userId_apiName_environment_idx" ON "api_status_snapshots"("userId", "apiName", "environment");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_status_snapshots_status_isAvailable_idx" ON "api_status_snapshots"("status", "isAvailable");

-- AddForeignKey
ALTER TABLE "api_status_history" ADD CONSTRAINT "api_status_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_status_snapshots" ADD CONSTRAINT "api_status_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

