# P11 ML Chile Enrichment Report

Date: 2026-03-21

## Goal

Run a small Chile-only destination-first enrichment sprint and see whether strict ML Chile truth can be persisted.

## What Was Implemented

- added ML Chile blocker and issue-queue utility
- added ML Chile destination-first enrichment batch script
- added explicit ML Chile readiness diagnostic with auth state and issue queues

## Fresh Runtime Evidence

### Global ML Chile readiness

Command run:

- `npm run check:ml-chile-controlled-operation -- 1`

Result:

- `authState = credential_row_present_but_tokens_missing`
- `strictMlChileReadyCount = 0`
- `targetCountryCl = 0`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 999`

### Controlled enrichment batch

Commands run:

- `npm run run:ml-chile-enrichment-batch -- 1 5`
- `npm run run:ml-chile-enrichment-batch -- 1 10`

Result from larger batch:

- scanned: `10`
- rejected: `10`
- near-valid: `10`
- validated: `0`
- rejectionSummaryByCode:
  - `missing_aliexpress_sku = 10`

## Most Important New Truth

The destination-first batch materially sharpened the blocker hierarchy.

At global catalog scale the blockers are broad:

- no `CL` target country
- no shipping cost
- no import tax
- no total cost
- almost no SKU persistence

But on the narrowed low-risk Chile-only batch, the dominant blocker collapses to:

- `missing_aliexpress_sku`

More precisely, the real error returned was:

- `Product not valid for publishing: no AliExpress SKU with stock > 0 for this destination`

## Meaning

This sprint did not produce the first strict ML Chile candidate.
But it did prove that after narrowing to low-risk Chile-only candidates, the hardest remaining supplier blocker is stable SKU availability with stock for `CL`.
