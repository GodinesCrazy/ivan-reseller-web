# P18 Strict ML Chile Funnel Reentry

## Goal
Measure whether the broader shipping-rich-first seed strategy materially moved the strict ML Chile funnel.

## Fresh readiness evidence
- Command: `npm run check:ml-chile-controlled-operation -- 1`
- Date: March 21, 2026

## Current values
- `targetCountryCl = 29`
- `missingAliExpressSku = 970`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `strictMlChileReadyCount = 0`

## Change vs earlier state
- `targetCountryCl`
  - improved materially from `8` to `29`
- `missingAliExpressSku`
  - improved materially from `991` to `970`
- `missingShippingCost`
  - unchanged at readiness scale
- `missingImportTax`
  - unchanged
- `missingTotalCost`
  - unchanged
- `strictMlChileReadyCount`
  - unchanged at `0`

## Verdict
P18 materially improved funnel entry coverage, but it did not move the strict ML Chile funnel past the shipping-cost wall.

The blocker did not move downstream. It stayed at:
- `missing_shipping_cost_true_supplier_side`
