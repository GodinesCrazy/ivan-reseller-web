-- CreateTable
CREATE TABLE IF NOT EXISTS "autopilot_workflows" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT,
    "conditions" JSONB,
    "actions" JSONB,
    "lastRun" TIMESTAMP(3),
    "nextRun" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autopilot_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "autopilot_workflows_userId_enabled_idx" ON "autopilot_workflows"("userId", "enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "autopilot_workflows_userId_type_idx" ON "autopilot_workflows"("userId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "autopilot_workflows_enabled_nextRun_idx" ON "autopilot_workflows"("enabled", "nextRun");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "autopilot_workflows_nextRun_idx" ON "autopilot_workflows"("nextRun");

-- AddForeignKey
ALTER TABLE "autopilot_workflows" ADD CONSTRAINT "autopilot_workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

