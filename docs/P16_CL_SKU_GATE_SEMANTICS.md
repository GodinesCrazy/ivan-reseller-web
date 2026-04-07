# P16 CL-SKU Gate Semantics

## Goal
Audit whether the current `cl_sku_no_stock` emission logic matched raw supplier truth.

## Gate behavior before P16
- Chile-support gate admitted products correctly after P15.
- CL-SKU gate rejected all sampled products as `cl_sku_no_stock`.
- This created the appearance that Chile-buyable stock did not exist.

## Root cause
The gate itself was not the main bug.

The upstream `getProductInfo()` SKU shape was under-resolved:
- raw Dropshipping payload had real `sku_available_stock`
- raw payload had real `offer_sale_price`
- normalized raw SKU data preserved that truth
- returned `info.skus` lost that truth and surfaced `stock = 0`, `salePrice = 0`

Because the CL-SKU gate reads normalized product info, it correctly rejected what it saw, but what it saw was wrong.

## Safe correction implemented
Updated `backend/src/services/aliexpress-dropshipping-api.service.ts` so `getProductInfo()` now prefers normalized raw SKU rows derived from `ae_item_sku_info_dtos` before falling back to weaker manual mapping.

This preserves:
- `skuId`
- `stock`
- `salePrice`
- strict fail-closed behavior for unknown shipping cost

## Post-fix truth
Runtime forensics now show:
- sampled rows with raw positive stock are admitted by the CL-SKU gate
- `cl_sku_no_stock` no longer dominates the sampled Chile-first set
- the funnel now fails later on `missing_shipping_cost`

## Verdict
- `cl_sku_no_stock` semantics: correct after upstream mapping fix
- pre-P16 blocker classification: false negative caused by under-resolved SKU truth
- post-P16 blocker classification: corrected
