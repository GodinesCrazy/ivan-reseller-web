ALTER TABLE "cj_ebay_account_settings"
  ADD COLUMN IF NOT EXISTS "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autopilotState" TEXT NOT NULL DEFAULT 'PAUSED',
  ADD COLUMN IF NOT EXISTS "autopilotIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "maxPublishesPerRun" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "maxOrdersPerRun" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "requireUsWarehouseOnly" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "autoPayCjOrders" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "orderPollingLookbackHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "minDataConfidenceScore" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "autopilotLastRunAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "autopilotNextRunAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "cj_ebay_automation_runs" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "trigger" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "lockKey" TEXT,
  "discoveryRuns" INTEGER NOT NULL DEFAULT 0,
  "candidatesChecked" INTEGER NOT NULL DEFAULT 0,
  "draftsCreated" INTEGER NOT NULL DEFAULT 0,
  "listingsPublished" INTEGER NOT NULL DEFAULT 0,
  "listingsRejectedUs" INTEGER NOT NULL DEFAULT 0,
  "ordersImported" INTEGER NOT NULL DEFAULT 0,
  "ordersPlaced" INTEGER NOT NULL DEFAULT 0,
  "ordersConfirmed" INTEGER NOT NULL DEFAULT 0,
  "ordersPaid" INTEGER NOT NULL DEFAULT 0,
  "trackingSynced" INTEGER NOT NULL DEFAULT 0,
  "recoveriesRun" INTEGER NOT NULL DEFAULT 0,
  "errorsCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedProfitUsd" DECIMAL(18,2),
  "feePctUsed" DECIMAL(8,4),
  "shippingUsd" DECIMAL(18,2),
  "supplierCostUsd" DECIMAL(18,2),
  "summary" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cj_ebay_automation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cj_ebay_automation_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cj_ebay_automation_runs_settings_fkey" FOREIGN KEY ("userId") REFERENCES "cj_ebay_account_settings"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cj_ebay_automation_runs_userId_startedAt_idx" ON "cj_ebay_automation_runs"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "cj_ebay_automation_runs_userId_status_idx" ON "cj_ebay_automation_runs"("userId", "status");
