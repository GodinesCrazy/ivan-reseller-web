# P29 Execution Report

Date: 2026-03-22
Mission: first controlled MercadoLibre Chile sale readiness and real-profit proof staging

## Final Outcome

P29 did not attempt a live sale.

P29 did:

- select the single best controlled-sale candidate
- verify real publication readiness constraints
- identify the exact pre-publication blockers
- document the supplier-purchase proof path
- define the released-funds / realized-profit proof boundary
- apply a safe publish-path fix so MercadoLibre no longer receives internal category slugs as `category_id`

Final system state:

`ready_for_controlled_sale_pending_human_execution`

## Exact Candidate Decision

- primary candidate: `32690`
- backup candidate: `32691`

Reason:

- both belong to `userId=1`
- both are unpublished, `VALIDATED_READY`, and Chile-freight-enabled
- `32690` has the lowest landed cost in the live strict-ready unpublished user scope
- `32690` has a simpler low-risk profile than `32637`

## Exact Publication Diagnosis

### Candidate-side truth

Candidate `32690` has:

- `status = VALIDATED_READY`
- `targetCountry = CL`
- `shippingCost = 2.99`
- `importTax = 0.80`
- `totalCost = 5.01`
- `finalPrice = 25.00`
- `aliexpressSku = 12000051835705515`
- real freight summary `freight_quote_found_for_cl`

### Code-side issue found and fixed

Before P29, the MercadoLibre publish path could forward internal category slugs like `desk_organization` as if they were MercadoLibre category IDs.

P29 fixed that in:

- `backend/src/modules/marketplace/marketplace-publish.service.ts`

New behavior:

- values matching a MercadoLibre-style category id pattern are preserved
- non-MercadoLibre category hints are nulled for MercadoLibre publish requests
- the publisher must then predict a valid marketplace category instead of sending the internal slug

### Exact remaining pre-publication blockers

- `ENABLE_ML_PUBLISH` runtime value is `null`
- `WEBHOOK_SECRET_MERCADOLIBRE_configured` runtime value is `false`

Therefore:

- auth/runtime is usable
- candidate readiness exists
- publication is not operator-authorized yet
- inbound order handling is `manual_or_polling_partial`, not `automation_ready`

## Supplier Purchase Path Diagnosis

Classification:

`purchase_path_partially_ready`

What is ready:

- MercadoLibre order ingestion via webhook or `POST /api/orders/sync-marketplace`
- automatic fulfillment attempt through `orderFulfillmentService.fulfillOrder`
- automatic `createSaleFromOrder` after real `PURCHASED`
- manual recovery via `POST /api/orders/:id/mark-manual-purchased`
- manual tracking submission via `POST /api/orders/:id/submit-tracking`

What is not yet proven:

- a real production `PURCHASED` AliExpress supplier order for Chile
- Chile checkout realism when `rut_no` is required

## Command Evidence

### 1. `backend npm run type-check`

Result:

- `tsc --noEmit`
- status: success

This was run before analysis and again after the publish-path fix; both succeeded.

### 2. `backend npm run check:ml-chile-controlled-operation -- 1`

Exact high-signal output:

- `initialHasAccessToken=true`
- `initialHasRefreshToken=true`
- `authState=access_token_present`
- `runtimeUsable=true`
- `oauthReauthRequired=false`
- `coverage.strictMlChileReadyCount=16`
- blockers:
  `no_ml_chile_released_funds_profit_proof`
  `no_real_mercadolibre_order_with_supplier_purchase_proof`

Interpretation:

- presale auth is no longer the blocker
- freight is no longer the blocker
- project state is already in post-sale proof territory

### 3. Runtime env gate check

Exact output:

```json
{
  "ENABLE_ML_PUBLISH": null,
  "WEBHOOK_SECRET_MERCADOLIBRE_configured": false
}
```

Interpretation:

- live MercadoLibre publish remains safety-blocked
- webhook automation remains unconfigured

### 4. Candidate scope check for user `1`

Top unpublished strict-ready Chile candidates ordered by lowest `totalCost`:

1. `32690` -> `5.01`
2. `32685` -> `5.99`
3. `32691` -> `6.02`

### 5. `backend npx tsx scripts/check-first-real-profit-readiness.ts 1`

Exact output:

- `commerciallyValidCompletedSales=0`
- `realPurchasedOrders=0`
- blockers:
  `No commercially valid production sale with payout executed.`
  `No production sale currently qualifies for realized-profit proof.`
  `No real PURCHASED order proves automatic supplier purchase on a non-test AliExpress item.`

Important scope note:

- this script is a post-sale proof diagnostic, not the authoritative strict-ready counter used in P28/P29
- it scans a bounded unpublished candidate window and is useful here because it confirms the post-sale blockers, not because it supersedes the P28 strict-ready total

## Final Readiness Statement

The system is ready for a tightly controlled single-candidate MercadoLibre Chile sale once the operator explicitly enables publication.

It is not yet correct to claim:

- real MercadoLibre commercial proof
- supplier purchase proof
- released-funds proof
- realized-profit proof

## Exact Remaining Blockers

- `ENABLE_ML_PUBLISH` not enabled
- `WEBHOOK_SECRET_MERCADOLIBRE` not configured
- no real MercadoLibre order with supplier purchase proof
- no released-funds production proof
- no realized-profit proof
