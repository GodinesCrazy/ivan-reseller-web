ALTER TABLE "cj_shopify_usa_account_settings"
  ADD COLUMN IF NOT EXISTS "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "automationState" TEXT NOT NULL DEFAULT 'IDLE',
  ADD COLUMN IF NOT EXISTS "automationIntervalHours" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "automationMaxDailyPublish" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "automationMaxPerCycle" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "automationMinMarginPct" DECIMAL(6,2) NOT NULL DEFAULT 12.00,
  ADD COLUMN IF NOT EXISTS "automationAutoPublish" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "automationDailyPublishCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "automationDailyCountDate" TEXT,
  ADD COLUMN IF NOT EXISTS "automationLastRunAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "automationNextRunAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "cj_shopify_usa_automation_cycles" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "productsScanned" INTEGER NOT NULL DEFAULT 0,
  "productsApproved" INTEGER NOT NULL DEFAULT 0,
  "draftsCreated" INTEGER NOT NULL DEFAULT 0,
  "published" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  "events" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cj_shopify_usa_automation_cycles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cj_shopify_usa_automation_cycles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cj_shopify_usa_automation_cycles_userId_startedAt_idx"
  ON "cj_shopify_usa_automation_cycles"("userId", "startedAt");

CREATE INDEX IF NOT EXISTS "cj_shopify_usa_automation_cycles_userId_status_idx"
  ON "cj_shopify_usa_automation_cycles"("userId", "status");
