# P17 Controlled Test Readiness Recheck

## Decision
`NOT READY`

## Why
The ML Chile path now has:
- usable ML auth from prior sprint work
- truthful Chile destination acknowledgement
- truthful CL-buyable SKU admission

But it still does not have:
- real shipping-cost truth for Chile
- import tax
- total cost
- any strict `VALIDATED_READY` candidate

## Fresh proof
- `npm run forensic:ml-chile-logistics -- 1`
  - `sampleCount = 8`
  - `normalizedShippingMethodCount = 0` for all `8`
  - `logisticsInfoKeys = ["delivery_time", "ship_to_country"]` for all `8`
- `npm run run:ml-chile-discovery-seed-pass -- 1 8`
  - `admittedAfterChileSupportGate = 8`
  - `admittedAfterClSkuGate = 8`
  - `validated = 0`
  - `rejectionSummaryByCode.missing_shipping_cost = 8`
- `npm run check:ml-chile-controlled-operation -- 1`
  - `strictMlChileReadyCount = 0`
  - `missingShippingCost = 1000`
  - `missingImportTax = 1000`
  - `missingTotalCost = 1000`

## Strict verdict
P17 improved truth and narrowed the blocker map further, but the first controlled ML Chile operation is still blocked before publication.
