# CJ → ML Chile Local Stock Parity With CJ → eBay USA

Date: 2026-04-18

## Scope

Focused only on:

- `CJ → ML Chile`
- comparative audit against `CJ → eBay USA`
- search / shortlist / warehouse-aware logic / stock verification / products screen / evaluate gating

No unrelated verticals were changed.

## 1. Reference truth: how CJ → eBay USA resolves local destination stock

Canonical reference path observed in code:

- Search starts in `backend/src/modules/cj-ebay/cj-ebay.routes.ts`.
- Search ranking uses `inventoryTotal` only as an early seed.
- When search inventory is missing, the route probes live operability with:
  - `product/query`
  - `product/variant/query`
  - `product/stock/queryByVid`
- Top operable USA candidates are then probed with `logistic/freightCalculate` through `quoteShippingToUsWarehouseAware(...)`.
- USA-local promotion happens only when freight succeeds with `startCountryCode=US`.
- Product detail enrichment also uses `queryByVid` live stock.
- Qualification/evaluate uses the same live variant stock + freight path before final operability.

Decisive USA truth:

- `product/listV2` inventory is not the final truth
- `product/stock/queryByVid` is the live variant truth
- `freightCalculate(startCountryCode=US)` is the warehouse-local confirmation
- operative promotion is the combination of both

`getInventoryByPid` is not the decisive path in the current USA module.

## 2. Current-truth audit: what ML Chile was doing wrong or too weakly

Before this change, `CJ → ML Chile` was weaker in two important ways:

1. Search and fast verify trusted weak signals:
   - generic `inventoryTotal`
   - `product/variant/query` stock
   - no live `queryByVid` truth in the search verification path

2. Chile freight confirmation was not truly Chile-local:
   - ML Chile was calling the shared USA quote path
   - the shared adapter defaulted destination freight to `US`
   - so “warehouse Chile” detection was not actually proving `CL -> CL`

That meant ML Chile could surface stock that was global/CN/generic without having true evidence that the variant was locally operable for Chile.

## 3. Exact Chile local stock truth rule

A CJ product/variant can be treated as having real Chile-usable local stock only when at least one of these is true:

1. Search payload evidence:
   - there is a destination row with `countryCode=CL`
   - `verifiedWarehouse=true`
   - and positive local non-factory inventory:
     - `cjInventoryNum > 0`, or
     - `totalInventoryNum - factoryInventoryNum > 0`

2. Live strong verification:
   - the selected variant has positive live stock in `product/stock/queryByVid`
   - and `logistic/freightCalculate` succeeds with `startCountryCode=CL` and `endCountryCode=CL`

Otherwise:

- generic/global/China-only stock is not Chile-local
- it must be downgraded to `stock_unknown`, `global_only`, or `out_of_stock`
- it must not be promoted as ready-to-evaluate local Chile stock

## 4. What was implemented

Backend:

- Shared CJ adapter now preserves destination inventory rows from search payloads.
- Shared quote path now accepts `destCountryCode`, so Chile can stop inheriting `US`.
- New Chile-local stock service now seeds search truth, enriches detail with live `queryByVid`, and runs strong `CL -> CL` warehouse probes.
- ML Chile batch verify now uses live stock plus Chile-local freight proof.
- ML Chile preview/evaluate now uses the real Chile freight path.

Frontend:

- Products screen now distinguishes `Chile local` from `Solo stock global/CN`.
- Grouping and promotion follow the stronger local-stock truth.
- Global-only stock is no longer shown as effectively operable.

Validation script:

- `backend/scripts/validate-cj-ml-chile-local-stock-parity.ts`

USA no-regression smoke:

- `backend/scripts/cj-ebay-warehouse-aware-smoke.ts`

## 5. Real validation results

Primary queries executed:

- `wireless earbuds`
- `earbuds`
- `smartphone holder`
- `charger`
- `phone case`
- `ring`

Additional queries executed:

- `organizer`
- `adhesive hook`
- `drawer organizer`
- `storage basket`
- `desk organizer`
- `bracelet`
- `necklace`
- `watch`

Artifacts:

- `backend/cj-ml-chile-local-stock-parity-validation.json`
- `backend/cj-ml-chile-local-stock-parity-validation-extra.json`

Aggregate result across 14 live queries / 168 raw search hits:

- `beforeMainFlow = 0`
- `afterMainFlow = 0`
- `beforeReady = 0`
- `afterReady = 0`
- `beforeFalsePositives = 0`
- `afterFalsePositives = 0`
- `after fast verify global_only = 84`

For the six required queries, each query returned:

- `rawCount = 12`
- `before main flow = 0`
- `after main flow = 0`
- `after ready-to-evaluate = 0`
- strong verified samples resolved to `global_only`

Interpretation:

- The strengthened ML Chile path is now stricter and more honest.
- It is successfully refusing to promote global/CN-only stock as if it were Chile-local.
- But the real searches still did not produce a robust set of `chile_local` candidates.

## 6. Technical validation

Executed successfully:

- backend `npm run type-check`
- frontend `npm run type-check`
- frontend `npm run build`
- backend `npx prisma validate`
- backend `npx prisma generate`
- backend `npm run cj-api:smoke`

USA regression sanity:

- `npx tsx scripts/cj-ebay-warehouse-aware-smoke.ts`
- live result returned:
  - `keyword = wireless earbuds`
  - `productId = 1999395299549302785`
  - `variantId = 1999395299687714817`
  - `liveStock = 60`
  - `startCountryCode = US`
  - `fulfillmentOrigin = US`
  - `shippingUsd = 0`
  - `freightEvidence = freight_api_confirmed`

This confirms the reference USA path still resolves live stock plus USA warehouse-aware freight on a real sample.

## 7. Honest final state

The code is materially closer to real parity because ML Chile now follows the same stock-truth philosophy as USA.

But parity requires demonstrated live Chile-usable candidates, not only better classification logic.

The live validation did not produce that evidence.

## Final verdict

**PARITY NOT ACHIEVED**

What still blocks finalization:

- The updated ML Chile logic correctly filters out false local assumptions.
- However, the tested real searches still produced `global_only` rather than `chile_local`.
- So the repo now has stronger truth detection, but not demonstrated operational parity with `CJ → eBay USA`.
