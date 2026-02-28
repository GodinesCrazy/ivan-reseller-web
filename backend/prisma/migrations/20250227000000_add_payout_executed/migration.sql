-- Add payoutExecuted flag for idempotent payout
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "payoutExecuted" BOOLEAN NOT NULL DEFAULT false;
