-- AlterTable: add environment to sales, commissions, admin_commissions (default sandbox)
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "admin_commissions" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'sandbox';

-- Indexes for filtering by environment
CREATE INDEX IF NOT EXISTS "sales_userId_environment_idx" ON "sales"("userId", "environment");
CREATE INDEX IF NOT EXISTS "commissions_userId_environment_idx" ON "commissions"("userId", "environment");
