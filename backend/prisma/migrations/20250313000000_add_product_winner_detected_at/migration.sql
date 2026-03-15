-- Spec: Winner detection - persist when sales in last N days >= threshold
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "winnerDetectedAt" TIMESTAMP(3);
