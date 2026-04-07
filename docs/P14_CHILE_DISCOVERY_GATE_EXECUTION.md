# P14 Chile Discovery Gate Execution

## Objective

Run the new Chile-supported seed strategy and measure whether candidates finally survive the Chile support discovery gate.

## First Expanded Seed Pass

Live command:

- `npm run run:ml-chile-discovery-seed-pass -- 1 8`

Fresh result after the stricter seed filter:

- `scannedByQuery`:
  - `cable organizer = 12`
  - `adhesive hook = 12`
  - `drawer organizer = 10`
  - `desk organizer = 12`
  - `kitchen organizer = 12`
  - `storage basket = 12`
  - `closet organizer = 12`
  - `under shelf storage = 12`
- `scannedAtDiscovery = 7`
- `admittedAfterChileSupportGate = 0`
- `admittedAfterClSkuGate = 0`
- `rejectedBeforeEnrichment = 7`
- `nearValid = 0`
- `validated = 0`
- `discoveryGateSummaryByCode.no_destination_support_cl = 7`

## Best Admitted Candidate

- none

## Exact Blocker For Best Failed Candidate

- every surviving seed candidate failed with:
  - `Supplier did not expose shipping support for destination CL.`

## Business Interpretation

This is a cleaner and stronger negative result than P13:

- the seed set is now born from Chile-scoped Affiliate discovery
- the titles are more tightly aligned with the intended safe query set
- even then, the current AliExpress discovery path still produces zero Chile-supported candidates

## P14 Verdict

Outcome `B` is now strongly supported:

- the current AliExpress Chile-first discovery capability still cannot produce a candidate that survives the Chile-support gate
