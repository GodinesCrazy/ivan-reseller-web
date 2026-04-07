# P20 Strict ML Chile Funnel Re-entry

## Objective
Re-run the strict ML Chile funnel after freight integration work and determine whether the blocker moved downstream.

## Fresh Runtime Check
Command:
- `backend npm run check:ml-chile-controlled-operation -- 1`

Fresh output:
- `credentialCount = 1`
- `coverage.totalScanned = 1000`
- `coverage.targetCountryCl = 29`
- `coverage.missingShippingCost = 1000`
- `coverage.missingImportTax = 1000`
- `coverage.missingTotalCost = 1000`
- `coverage.missingAliExpressSku = 970`
- `coverage.strictMlChileReadyCount = 0`

Best near-valid candidate:
- `id = 32713`
- `targetCountry = CL`
- blockers:
  - `status_not_validated_ready`
  - `missing_shipping_cost`
  - `missing_import_tax`
  - `missing_total_cost`

## Interpretation
- P20 did not move the live DB beyond the shipping-cost wall yet.
- This was not because the freight endpoint was unreachable.
- It was because no valid freight quote could be persisted due the credential/app mismatch discovered in live runtime.

## Classification
- `targetCountryCl`: unchanged materially from the P18/P19 plateau
- `missingAliExpressSku`: unchanged materially during P20
- `missingShippingCost`: still blocked by freight quote absence
- `missingImportTax`: still blocked downstream of freight quote absence
- `missingTotalCost`: still blocked downstream of freight quote absence
- `strictMlChileReadyCount`: unchanged at `0`
