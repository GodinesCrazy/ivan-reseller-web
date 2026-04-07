# P12 Execution Report

## Sprint scope
P12 stayed narrow on the two dominant blockers:
1. MercadoLibre Chile runtime token truth
2. CL-SKU admission quality before ML Chile enrichment

## Implemented code changes
- Added explicit MercadoLibre auth truth classification and diagnostics.
- Added raw AliExpress SKU normalization to support stricter supplier-side admission decisions.
- Added a dedicated CL-SKU admission gate for ML Chile candidate batches.
- Updated the ML Chile destination-first enrichment batch to reject candidates before enrichment when supplier truth is insufficient for Chile.
- Extended ML Chile readiness diagnostics and issue queue reporting.
- Added focused tests for auth truth, issue queues, raw SKU normalization, and CL-SKU admission behavior.

## Fresh evidence captured

### Auth runtime

```powershell
npm run check:ml-chile-auth-runtime -- 1
```

Result:
- `credential_row_present_but_tokens_missing`
- `siteId = MLC`
- `hasAccessToken = false`
- `hasRefreshToken = false`
- `tokenShapeValid = false`
- `runtimeUsable = false`
- `lastAuthFailureReason = missing_access_token`

### Clean Chile-only batch

```powershell
npm run run:ml-chile-enrichment-batch -- 1 10
```

Result:
- `scannedBeforeGate = 10`
- `admittedAfterClSkuGate = 0`
- `rejectedBeforeEnrichment = 10`
- `validated = 0`
- `no_destination_support_cl = 9`
- `supplier_data_incomplete = 1`

### Broad readiness recheck

```powershell
npm run check:ml-chile-controlled-operation -- 1
```

Result:
- `targetCountryCl = 0`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 999`
- `strictMlChileReadyCount = 0`
- `mlSalesSummary.total = 0`
- `mlOrdersSummary.total = 0`

## Verification
- `npm run type-check` passed.
- Focused test files were added and updated for the new logic.

## P12 business result
P12 did not recover the first strict ML Chile `VALIDATED_READY` candidate.

P12 did improve the quality of truth materially:
- auth is now blocked by an exact proven token state, not a vague `401`
- Chile-only enrichment no longer wastes cycles on candidates that never had supplier-valid CL support
- the next funnel blocker is now narrower and cleaner than in P11
