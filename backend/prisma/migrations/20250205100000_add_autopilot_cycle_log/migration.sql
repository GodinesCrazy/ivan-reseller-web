-- CreateTable
CREATE TABLE "autopilot_cycle_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cycleId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "opportunitiesFound" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesProcessed" INTEGER NOT NULL DEFAULT 0,
    "productsPublished" INTEGER NOT NULL DEFAULT 0,
    "productsApproved" INTEGER NOT NULL DEFAULT 0,
    "capitalUsed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "errors" JSONB,
    "metadata" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autopilot_cycle_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "autopilot_cycle_logs_userId_createdAt_idx" ON "autopilot_cycle_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "autopilot_cycle_logs_cycleId_idx" ON "autopilot_cycle_logs"("cycleId");

-- CreateIndex
CREATE INDEX "autopilot_cycle_logs_stage_idx" ON "autopilot_cycle_logs"("stage");

-- AlterTable: Add per-user autopilot thresholds (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_workflow_configs' AND column_name='minProfitUsd') THEN
    ALTER TABLE "user_workflow_configs" ADD COLUMN "minProfitUsd" DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_workflow_configs' AND column_name='minRoiPct') THEN
    ALTER TABLE "user_workflow_configs" ADD COLUMN "minRoiPct" DOUBLE PRECISION;
  END IF;
END $$;
