# P17 CL Shipping Forensic Rerun

## Commands
- `npm run forensic:ml-chile-logistics -- 1`
- `npm run run:ml-chile-discovery-seed-pass -- 1 8`
- `npm run check:ml-chile-controlled-operation -- 1`

## Combined rerun result
- `scannedAtDiscovery = 8`
- `admittedAfterChileSupportGate = 8`
- `admittedAfterClSkuGate = 8`
- `admittedAfterShippingCostGate = 0`
- `rejectedBeforeEnrichment = 8`
- `nearValid = 0`
- `validated = 0`

## Gate summaries
- `discoveryGateSummaryByCode.admitted = 8`
- `clSkuGateSummaryByCode.admitted = 8`
- `shippingGateSummaryByCode.missing_shipping_cost_true_supplier_side = 8`

## Best admitted candidate
- `sourceProductId = 1005010571002222`
- query: `cable organizer`
- admitted SKU: `12000052855206453`
- exact blocker: `missing_shipping_cost`

## Why the shipping gate remains closed
The live forensic payload shows:
- destination acknowledgement for `CL`
- no normalized shipping methods
- no parsed shipping cost
- no free-shipping signal

## Strict outcome
P17 did not produce the first strict ML Chile candidate.

It did produce a cleaner proof:
- Chile-support is real
- CL-SKU truth is real
- shipping-cost truth is absent for the sampled family
