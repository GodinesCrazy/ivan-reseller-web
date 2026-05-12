ALTER TABLE "cj_ebay_account_settings"
  ADD COLUMN "monthlyListingLimit" INTEGER,
  ADD COLUMN "monthlyAmountLimitUsd" DECIMAL(18, 2);
