UPDATE "cj_shopify_usa_account_settings"
SET
  "automationEnabled" = true,
  "automationState" = 'RUNNING',
  "automationIntervalHours" = 2,
  "automationMaxDailyPublish" = GREATEST(COALESCE("automationMaxDailyPublish", 500), 500),
  "automationMaxPerCycle" = GREATEST(COALESCE("automationMaxPerCycle", 80), 80),
  "automationAutoPublish" = true,
  "automationNextRunAt" = COALESCE("automationNextRunAt", CURRENT_TIMESTAMP)
WHERE "shopifyStoreUrl" IS NOT NULL
   OR "shopifyLocationId" IS NOT NULL
   OR "shopifyAccessToken" IS NOT NULL;
