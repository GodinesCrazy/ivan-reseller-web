-- CJ-eBay USA: account-provided eBay selling limits.
-- Operator confirmed a maximum of 300 published stock units and USD 20,000,000
-- published value exposure for this eBay USA account.

ALTER TABLE "cj_ebay_account_settings"
  ALTER COLUMN "monthlyListingLimit" SET DEFAULT 300,
  ALTER COLUMN "monthlyAmountLimitUsd" SET DEFAULT 20000000.00;

UPDATE "cj_ebay_account_settings"
SET
  "monthlyListingLimit" = 300,
  "monthlyAmountLimitUsd" = 20000000.00;
