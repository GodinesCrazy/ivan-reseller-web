# P15 Chile Forensic Rerun

## Objective

Rerun the Chile-first discovery pass after the safe gate correction and measure the new blocker hierarchy.

## Live Rerun

Command:

- `npm run run:ml-chile-discovery-seed-pass -- 1 8`

Fresh result:

- `scannedAtDiscovery = 8`
- `admittedAfterChileSupportGate = 8`
- `admittedAfterClSkuGate = 0`
- `rejectedBeforeEnrichment = 8`
- `nearValid = 0`
- `validated = 0`
- `discoveryGateSummaryByCode.admitted = 8`
- `clSkuGateSummaryByCode.cl_sku_no_stock = 8`

## Best Admitted Candidate

- product `1005010571002222`
- query `cable organizer`
- admitted after Chile-support gate
- blocked next by:
  - `cl_sku_no_stock`

## What P15 Changed

P15 materially changed the funnel:

- before: `admittedAfterChileSupportGate = 0`
- after: `admittedAfterChileSupportGate = 8`

But the funnel still stops at the next supplier-side truth layer:

- no candidate exposes a CL-purchasable in-stock SKU

## P15 Verdict

`CHILE-FORENSIC RERUN = DONE`
