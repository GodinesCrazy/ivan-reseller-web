# P16 Variant Mapping Forensics

## Goal
Determine whether product-to-SKU mapping was missing buyable Chile-capable variants.

## Compared layers
- raw supplier rows from `ae_item_sku_info_dtos`
- normalized rows from `normalizeAliExpressRawSkus(...)`
- returned product info rows from `getProductInfo(...).skus`
- CL-SKU gate outcome

## P16 finding
Variant mapping was losing commercial truth between raw supplier rows and `getProductInfo().skus`.

Before the fix:
- raw rows showed positive stock
- normalized raw rows showed positive stock
- returned `info.skus` showed zero stock and zero price
- CL-SKU gate therefore rejected the candidate

After the fix:
- returned `info.skus` now aligns with normalized raw rows
- CL-SKU gate admits the same products

## Example pattern
- Raw row:
  - `sku_id = 12000052855206453`
  - `sku_available_stock = 36`
  - `offer_sale_price = 1.18`
- Normalized raw row:
  - `stock = 36`
  - `salePrice = 1.18`
- Returned `info.skus` after fix:
  - `stock = 36`
  - `salePrice = 1.18`
- CL-SKU admission:
  - `code = admitted`

## Verdict
- Variant mapping was not selecting the wrong SKU family.
- The real defect was loss of stock/price truth during normalization into the returned product shape.
- P16 corrected that path safely without weakening strict validation.
