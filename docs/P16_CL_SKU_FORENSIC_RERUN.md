# P16 CL-SKU Forensic Rerun

## Commands
- `npm run forensic:ml-chile-sku-stock -- 1`
- `npm run run:ml-chile-discovery-seed-pass -- 1 8`
- `npm run check:ml-chile-controlled-operation -- 1`

## Forensic rerun result
### SKU-level forensic pass
- `rows = 8`
- `rowsWithAnyPositiveNormalizedStock = 8`
- `rowsWithAnyPositiveRawStockField = 8`
- `discoveryAdmission.code = admitted` for all `8`
- `skuAdmission.code = admitted` for all `8`

### Chile-first seed pass after fix
- `scannedAtDiscovery = 8`
- `admittedAfterChileSupportGate = 8`
- `admittedAfterClSkuGate = 8`
- `rejectedBeforeEnrichment = 0`
- `nearValid = 0`
- `validated = 0`
- `discoveryGateSummaryByCode.admitted = 8`
- `clSkuGateSummaryByCode.admitted = 8`
- `rejectionSummaryByCode.missing_shipping_cost = 8`

## Best admitted candidate
- `sourceProductId = 1005010571002222`
- query: `cable organizer`
- admitted SKU: `12000052855206453`
- outcome in strict funnel: rejected
- blocker: `missing_shipping_cost`

## Readiness recheck
- `targetCountryCl = 8`
- `missingAliExpressSku = 991`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `strictMlChileReadyCount = 0`
- `mlSalesSummary.total = 0`
- `mlOrdersSummary.total = 0`

## Interpretation
P16 materially improved the ML Chile lead path:
- Chile-support gate remains valid
- CL-SKU gate now admits candidates truthfully
- the first hard blocker is no longer supplier stock
- the next real blocker is missing shipping cost for Chile

## Strict outcome
No strict `VALIDATED_READY` candidate exists yet.

The strict ML Chile funnel is still blocked, but the blocker hierarchy is now cleaner and materially narrower than in P15:
1. `missing_shipping_cost`
2. `missing_import_tax`
3. `missing_total_cost`
