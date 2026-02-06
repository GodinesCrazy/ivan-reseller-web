-- PlatformConfig (singleton: id=1)
CREATE TABLE IF NOT EXISTS "platform_config" (
    "id" SERIAL NOT NULL,
    "platformCommissionPct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "adminPaypalEmail" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);
INSERT INTO "platform_config" ("id", "platformCommissionPct", "adminPaypalEmail", "updatedAt")
SELECT 1, 10.00, 'admin@example.com', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "platform_config" LIMIT 1);

-- User.paypalPayoutEmail (idempotent)
DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "paypalPayoutEmail" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Sale.adminPayoutId, Sale.userPayoutId (idempotent)
DO $$ BEGIN
  ALTER TABLE "sales" ADD COLUMN "adminPayoutId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "sales" ADD COLUMN "userPayoutId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
