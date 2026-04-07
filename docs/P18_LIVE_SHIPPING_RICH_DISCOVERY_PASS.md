# P18 Live Shipping-Rich Discovery Pass

## Command
- `npm run run:ml-chile-discovery-seed-pass -- 1 8`

## Result
- `scannedAtDiscovery = 21`
- `admittedAfterChileSupportGate = 21`
- `admittedAfterClSkuGate = 21`
- `admittedAfterShippingCostGate = 0`
- `rejectedBeforeEnrichment = 21`
- `nearValid = 0`
- `validated = 0`

## Gate summaries
- `discoveryGateSummaryByCode.admitted = 21`
- `clSkuGateSummaryByCode.admitted = 21`
- `shippingGateSummaryByCode.missing_shipping_cost_true_supplier_side = 21`

## Best admitted candidate
- `sourceProductId = 1005011570887780`
- query: `washi tape`
- admitted SKU: `12000055951495229`
- blocker: `missing_shipping_cost`

## Best failed admitted candidate
- same product family as above
- outcome: rejected
- exact blocker: `missing_shipping_cost`

## Interpretation
P18 succeeded in broadening the Chile candidate funnel:
- more categories
- more admitted candidates
- more `targetCountry = CL`
- more persisted `AliExpress SKU`

But it still failed to find even one shipping-rich candidate.

## Strict outcome
The absence of shipping-rich candidates now holds across a broader and more varied AliExpress-first discovery set than P17.
