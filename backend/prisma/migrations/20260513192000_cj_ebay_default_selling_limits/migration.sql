-- CJ-eBay USA: safe starter selling-limit defaults.
-- eBay selling limits are account-specific and must be copied from Seller Hub
-- once known. These defaults keep the autopilot conservative until then.

ALTER TABLE "cj_ebay_account_settings"
  ALTER COLUMN "monthlyListingLimit" SET DEFAULT 10,
  ALTER COLUMN "monthlyAmountLimitUsd" SET DEFAULT 500.00;

UPDATE "cj_ebay_account_settings"
SET
  "monthlyListingLimit" = COALESCE("monthlyListingLimit", 10),
  "monthlyAmountLimitUsd" = COALESCE("monthlyAmountLimitUsd", 500.00)
WHERE "monthlyListingLimit" IS NULL
   OR "monthlyAmountLimitUsd" IS NULL;
