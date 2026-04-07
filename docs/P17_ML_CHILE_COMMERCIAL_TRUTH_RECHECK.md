# P17 ML Chile Commercial Truth Recheck

## Fresh readiness evidence
- Command: `npm run check:ml-chile-controlled-operation -- 1`
- Date: March 21, 2026

## Current values
- `targetCountryCl = 8`
- `missingAliExpressSku = 991`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `strictMlChileReadyCount = 0`

## Classification
- `targetCountryCl`
  - improved materially relative to the earlier zero baseline
- `missingAliExpressSku`
  - improved materially relative to the earlier near-total absence
- `missingShippingCost`
  - unchanged at readiness scale
  - blocked by supplier truth for the sampled admitted set
- `missingImportTax`
  - unchanged
  - blocked downstream of missing shipping cost
- `missingTotalCost`
  - unchanged
  - blocked downstream of missing shipping cost
- `strictMlChileReadyCount`
  - unchanged at `0`
  - blocked by shipping-cost truth first, then later strict commercial fields

## P17 verdict
P17 materially clarified the strict funnel, but it did not yet create a strict ML Chile candidate.

The first hard blocker is now explicitly:
- `missing_shipping_cost_true_supplier_side`
