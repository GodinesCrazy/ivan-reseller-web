-- User.payoneerPayoutEmail (idempotent)
-- Email Payoneer para recibir pagos de eBay y otros marketplaces
DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "payoneerPayoutEmail" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
