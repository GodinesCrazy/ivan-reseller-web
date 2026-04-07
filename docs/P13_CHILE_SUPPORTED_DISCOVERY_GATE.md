# P13 Chile-Supported Discovery Gate

## Objective

Push Chile support filtering earlier into discovery so the ML Chile funnel stops admitting candidates that never had supplier-side destination support for `CL`.

## Implemented Changes

- Added a new ML Chile discovery admission gate before the CL-SKU gate.
- A candidate can now enter the ML Chile recovery funnel only if supplier payload truth is strong enough to classify destination support for `CL`.
- Preserved explicit rejection codes:
  - `no_destination_support_cl`
  - `supplier_data_incomplete`
  - `no_cl_sku`
  - `cl_sku_no_stock`
  - `no_purchasable_variant`
- Updated the Chile-only enrichment runner so discovery scans a slightly wider window first, then applies the new Chile-support gate before the CL-SKU gate.

## Gate Logic

The new discovery gate admits only candidates that already expose supplier-side evidence that Chile is supported, or at minimum expose enough structured supplier truth to classify the product cleanly.

This keeps the downstream ML Chile funnel smaller and more honest:

- discovery support first
- purchasable CL SKU second
- cost enrichment after that

## Fresh P13 Batch Evidence

The first clean pass after the new discovery gate produced:

- `scannedAtDiscovery = 11`
- `admittedAfterChileSupportGate = 0`
- `admittedAfterClSkuGate = 0`
- `validated = 0`
- `discoveryGateSummaryByCode.no_destination_support_cl = 10`
- `discoveryGateSummaryByCode.supplier_data_incomplete = 1`

## Business Interpretation

This is a meaningful improvement even though it did not produce a candidate:

- The current low-risk AliExpress discovery pool is now proven to fail earlier and more truthfully.
- The dominant supplier-side blocker is no longer a vague late `missing_aliexpress_sku`.
- The real current blocker is lack of supplier-side `CL` destination support in the discovery pool itself.

## P13 Verdict

`CHILE-SUPPORTED DISCOVERY GATE = DONE`
