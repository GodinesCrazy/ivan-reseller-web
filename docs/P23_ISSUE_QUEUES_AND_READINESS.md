# P23 Issue Queues And Readiness

## Queue Truth After P23
- `no_freight_entitlement`
- `freight_endpoint_incompatible`
- `freight_quote_obtained`
- `no_freight_options_returned`
- `landed_cost_complete`
- `strict_validated_ready_candidate_ids`

## Dominant Live Interpretation
- `no_freight_entitlement`
- `freight_endpoint_incompatible`

## Why
The live rerun showed:
- freight endpoint reached
- no quote returned
- every sampled admitted row failed with the same entitlement-shaped error

## Readiness Snapshot
- `targetCountryCl = 29`
- `missingAliExpressSku = 970`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `strictMlChileReadyCount = 0`
