# P18 Execution Report

## Sprint scope
P18 was a narrow shipping-rich pattern discovery sprint for the ML Chile lead path.

It did not broaden into:
- post-sale automation
- new suppliers
- new marketplaces
- weaker validation

## Implemented changes
- Replaced the ML Chile seed strategy with a shipping-rich-first profile in `backend/src/utils/ml-chile-seed-strategy.ts`
- Added supporting tests in `backend/src/utils/ml-chile-shipping-rich-seed-strategy.test.ts`
- Added supporting utilities in `backend/src/utils/ml-chile-shipping-rich-seed-strategy.ts`
- Added an experimental shipping-rich pass runner in `backend/scripts/run-ml-chile-shipping-rich-pass.ts`
- Added the npm entrypoint in `backend/package.json`

## What P18 proved
- Broader AliExpress discovery can produce more Chile-supported and CL-SKU-buyable candidates.
- The strict funnel coverage improved:
  - `targetCountryCl` increased to `29`
  - `missingAliExpressSku` decreased to `970`
- But the tested shipping-rich-first families still produced:
  - `admittedAfterShippingCostGate = 0`
  - dominant blocker `missing_shipping_cost`

## P18 business conclusion
Shipping-rich candidates were not found in the tested broader AliExpress-first family set.

This is stronger evidence than P17 because the failure now holds beyond organizer/storage families and into:
- stationery-small
- light accessories
- craft-small
- beauty-small

## New blocker hierarchy
1. `shipping_rich_pattern_not_found`
2. `missing_shipping_cost_true_supplier_side`
3. `missing_import_tax_after_shipping`
4. `missing_total_cost_after_shipping`
5. no strict `VALIDATED_READY` candidate yet
