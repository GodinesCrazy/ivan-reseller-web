# P16 AliExpress CL SKU Stock Forensics

## Objective
Determine whether `cl_sku_no_stock` was true supplier-side stock truth for Chile or a false negative caused by SKU parsing, normalization, or variant resolution.

## Fresh runtime evidence
- Command: `npm run forensic:ml-chile-sku-stock -- 1`
- Date: March 21, 2026
- Sample size: `8` Chile-admitted candidates

## Summary
- `rows = 8`
- `rawRowsWithSkuData = 8`
- `normalizedRowsWithSkuData = 8`
- `rowsWithAnyPositiveNormalizedStock = 8`
- `rowsWithAnyPositiveRawStockField = 8`

## What raw supplier truth showed
- Every sampled product exposed raw `ae_item_sku_info_dtos` rows.
- Every sampled product exposed at least one `sku_available_stock > 0`.
- Every sampled product exposed a positive `offer_sale_price`.

Representative evidence:
- Product `1005010571002222`
  - raw `sku_available_stock = 36`
  - raw `offer_sale_price = 1.19`
  - CL-SKU admission after fix: `admitted`
- Product `1005008644832335`
  - raw stocks included `13`, `24`, `181`
  - CL-SKU admission after fix: `admitted`
- Product `1005010777611498`
  - raw `sku_available_stock = 9`
  - raw `offer_sale_price = 6.99`
  - CL-SKU admission after fix: `admitted`

## P16 conclusion
`cl_sku_no_stock` was not the true blocker for the sampled Chile-admitted set.

The raw AliExpress Dropshipping payload did contain buyable positive-stock SKU rows for Chile-admitted products. The real failure was the product-info normalization path returning zeroed `stock` and `salePrice` in `info.skus`, which caused a false CL-SKU rejection.

## New blocker after correction
After the safe SKU mapping correction, the Chile-first strict funnel moved forward and the next blocker became:
- `missing_shipping_cost`

That is now the first truthful pre-sale blocker for the current admitted Chile candidate set.
