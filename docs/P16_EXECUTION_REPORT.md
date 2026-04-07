# P16 Execution Report

## Sprint scope
P16 was a narrow supplier-stock forensics sprint for the ML Chile lead path.

It did not broaden into:
- post-sale automation
- new marketplaces
- new suppliers
- weaker validation

## What changed
- Added `backend/scripts/forensic-ml-chile-sku-stock.ts`
- Added npm entrypoint `forensic:ml-chile-sku-stock`
- Corrected SKU truth propagation in `backend/src/services/aliexpress-dropshipping-api.service.ts`
- Added focused regression file `backend/src/utils/p16-cl-sku-stock-forensics.test.ts`

## What P16 proved
### Proven false blocker
`cl_sku_no_stock` was a false negative for the sampled Chile-admitted candidate set.

### Proven root cause
Raw AliExpress Dropshipping SKU rows contained real positive stock and positive sale price, but the returned `getProductInfo().skus` shape zeroed that truth out before the CL-SKU gate executed.

### Proven post-fix behavior
After the SKU truth correction:
- Chile-support gate admits candidates
- CL-SKU gate admits candidates
- the strict ML Chile funnel now fails on `missing_shipping_cost`

## Current blocker hierarchy
1. `missing_shipping_cost`
2. `missing_import_tax`
3. `missing_total_cost`
4. no strict `VALIDATED_READY` candidate yet

## Notes on readiness diagnostics
`check:ml-chile-controlled-operation` still reports stale ML auth state (`credential_row_present_but_tokens_missing`) even though the dedicated ML runtime auth diagnostic already proved usable auth in earlier sprint work.

For P16, that auth discrepancy is secondary. The decisive new blocker is shipping-cost truth, not auth or SKU stock.
