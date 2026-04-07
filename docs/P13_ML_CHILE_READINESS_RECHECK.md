# P13 ML Chile Readiness Recheck

## Objective

Measure whether P13 materially moved the system toward the first controlled MercadoLibre Chile operation.

## Fresh Recheck Summary

### Auth Truth

Strong runtime auth proof improved materially:

- `runtimeUsable = true` in the dedicated auth runtime check
- `usersMe.status = 200`
- `usersMe.country_id = CL`

### Broad Readiness Coverage

The broader commercial-readiness layer remains unchanged:

- `targetCountryCl = 0`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 999`
- `strictMlChileReadyCount = 0`
- `mlSalesSummary.total = 0`
- `mlOrdersSummary.total = 0`

## Classification

- `targetCountryCl`: unchanged, blocked by supplier truth and persistence
- `missingShippingCost`: unchanged, blocked by supplier truth
- `missingImportTax`: unchanged, blocked by downstream cost persistence because no Chile-valid candidates survive
- `missingTotalCost`: unchanged, blocked by upstream shipping and tax truth
- `missingAliExpressSku`: unchanged at readiness scale, blocked by supplier truth
- `strictMlChileReadyCount`: unchanged, still blocked by supplier truth
- `mlSalesSummary.total`: unchanged, downstream blocked
- `mlOrdersSummary.total`: unchanged, downstream blocked

## Important Diagnostic Note

The controlled-operation readiness script still reports an older auth state that conflicts with the stronger dedicated runtime auth proof. For P13, the live authenticated `users/me` result is the higher-confidence truth.

## Business Interpretation

P13 improved the ML Chile lead path materially only in one area:

- auth/runtime usability

But it did not yet improve the commercial candidate layer:

- no Chile-supported discovery candidate survived
- no strict validated-ready candidate exists

## P13 Verdict

`ML CHILE READINESS RECHECK = DONE`
