# P19 Live Targeted Chile Shipping Pass

## Live pass used
- `npm run run:ml-chile-discovery-seed-pass -- 1 8`

This pass was executed after the ML Chile seed strategy had already been shifted to the broader shipping-rich-first family set.

## Targeting strategy used
- broaden beyond organizer/storage families
- prefer smaller, lighter families more likely to expose richer logistics
- observe seller/store/package/logistics patterns in the resulting admitted rows

## Families used
- `sticker pack`
- `washi tape`
- `bookmark magnetic`
- `keychain charm`
- `hair clip`
- `embroidery patch`
- `nail sticker`
- `phone lanyard`

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
- exact blocker: `missing_shipping_cost`

## P19 conclusion
Even after shifting to a broader and more shipping-plausible set of families, the live pass still found zero candidates surviving the shipping-cost gate.

This strengthens the conclusion that shipping-rich Chile seller/logistics patterns have not yet been reached by the current AliExpress discovery path.
