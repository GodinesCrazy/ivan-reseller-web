-- Phase 1: ML webhook ledger + product physical package truth for Mercado Libre

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "packageWeightGrams" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "packageLengthCm" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "packageWidthCm" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "packageHeightCm" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "maxUnitsPerOrder" INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS "mercado_libre_webhook_events" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "topic" TEXT,
    "resource" TEXT,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "correlationId" TEXT,
    "bullmqJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "mercado_libre_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mercado_libre_webhook_events_idempotencyKey_key" ON "mercado_libre_webhook_events"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "mercado_libre_webhook_events_status_idx" ON "mercado_libre_webhook_events"("status");
CREATE INDEX IF NOT EXISTS "mercado_libre_webhook_events_createdAt_idx" ON "mercado_libre_webhook_events"("createdAt");
