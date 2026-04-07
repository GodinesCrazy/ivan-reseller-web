# P4 Supplier Validation Reality Audit

## What Changed
- Added explicit rejection reason codes through `supplier-validation-reason.service.ts`.
- Preventive supplier validation now stores both:
  - `reason`
  - `reasonCode`
- Multi-region validation now emits:
  - `rejectionReason`
  - `rejectionReasonCode`
  - `rejectionSummaryByCode`
  - `nearValidProducts`
- Catalog truth now surfaces supplier-side blocked reasons from preventive metadata instead of collapsing them into only `supplierUnavailable`.

## Real Recovery Run
Command:
- `npx tsx scripts/run-multi-region-validation.ts --userId=1 --marketplaces=ebay --queries='cell phone holder|phone stand|cable organizer' --maxPriceUsd=20 --maxSearchResults=5 --minSupplierSearch=5`

Marketplace context:
- `eBay US`
- `country = US`
- `language = en`
- `currency = USD`

## Real Results
- scanned: `15`
- rejected: `15`
- validated: `0`
- firstValidatedProduct: `null`

## Quantified Rejection Matrix
- `no_stock_for_destination = 9`
- `margin_invalid = 6`

## Real Interpretation
- The dominant blocker is supplier reality, not connector reality.
- The AliExpress DS API repeatedly returns listings whose destination-specific SKU/stock validation fails for `US`.
- The second blocker is source quality under the current price ceiling: several affiliate results are not commercially viable for a `<= 20 USD` first-candidate strategy.

## What This Means
- The pipeline is now explaining candidate failure truthfully.
- The system still cannot produce the first safe candidate from the tested sourcing set.
- The current sourcing stack is still insufficient for a first safe product under these exact constraints.
