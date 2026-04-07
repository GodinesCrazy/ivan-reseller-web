# P20 ML Chile Issue Queues Refined

## Queue Updates Implemented
Updated [backend/src/utils/ml-chile-issue-queues.ts](/c:/Ivan_Reseller_Web/backend/src/utils/ml-chile-issue-queues.ts) to support freight-aware queue signals:
- `freightQuoteFoundForCl`
- `freightQuoteMissingForCl`
- `selectedShippingServicePersisted`
- `missingShippingCostTrueSupplierSide`
- `missingImportTaxAfterFreight`
- `missingTotalCostAfterFreight`
- `likelyRutRequiredForSupplierCheckout`
- `nearValid`

## Live P20 Truth
- No freight quote was persisted, so the new positive freight queues are still effectively empty in live DB.
- The next useful negative queue for this phase is:
  - `freight_quote_missing_for_cl`
- Under fresh P20 runtime evidence, that queue now really means:
  - the freight endpoint is the correct source
  - the current credential/app pair cannot produce a usable quote yet

## Practical Meaning
- The lead queue is no longer generic `missing_shipping_cost`.
- The lead queue is now a narrower operational truth:
  - freight quote path implemented
  - live quote blocked by AliExpress app/session compatibility
