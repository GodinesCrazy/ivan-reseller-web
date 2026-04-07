# P19 Targeted Chile Shipping Strategy

## Goal
Move from broad family-first discovery toward seller/logistics-targeted discovery for the ML Chile lead path.

## Implemented direction
The active ML Chile seed strategy remains shipping-rich-first and now explicitly supports seller/logistics targeting logic in code through:
- `backend/src/utils/ml-chile-seller-logistics-pattern.ts`
- `backend/src/utils/ml-chile-shipping-gate.ts`
- `backend/src/utils/ml-chile-seed-strategy.ts`

## Targeting order
1. seller/logistics patterns with richer Chile shipping truth
2. Chile destination acknowledgement
3. CL-buyable SKU truth
4. only then product-family suitability

## Safe seller/logistics hints to prioritize next
- seller/store info present and stable
- package info present
- logistics payload richer than only `delivery_time` + `ship_to_country`
- any ship-from or warehouse hints, if surfaced
- any explicit free-shipping or service/cost rows

## Patterns to deprioritize
Patterns already proven shipping-poor for Chile even after broader sampling:
- stationery-small
- light accessories
- beauty-small
when they still expose only destination acknowledgement and zero shipping methods

## P19 verdict
The seller/logistics-targeted strategy is now explicitly defined in architecture terms, but no shipping-rich seller/logistics pattern has yet been proven in live results.
