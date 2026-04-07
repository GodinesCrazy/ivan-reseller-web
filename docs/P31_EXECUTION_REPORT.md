# P31 Execution Report

Date: 2026-03-22
Mission: reconcile the ML Chile live pre-publish validator with canonical persisted freight truth and retest the controlled publish for candidate `32690`

## Outcome summary

P31 successfully reconciled the live validator with the canonical persisted ML Chile freight path.

The original contradiction is no longer the blocker.

The controlled publish retest still did not create a listing, but the exact blocker changed from missing shipping truth to fee-ledger financial incompleteness.

## Commands run

### 1. Type check

```text
backend npm run type-check
```

Output:

```text
> ivan-reseller-backend@1.0.0 type-check
> tsc --noEmit
```

### 2. Focused regression test

```text
backend npx jest src/services/__tests__/pre-publish-validator.service.test.ts --runInBand
```

Result:

```text
PASS src/services/__tests__/pre-publish-validator.service.test.ts
Tests: 11 passed, 11 total
```

### 3. Controlled-operation readiness check

```text
backend npm run check:ml-chile-controlled-operation -- 1
```

Key output:

```text
authState=access_token_present
hasAccessToken=true
hasRefreshToken=true
runtimeUsable=true
oauthReauthRequired=false
coverage.strictMlChileReadyCount=16
```

### 4. Controlled publish retest

```text
backend npx tsx scripts/p30-controlled-mlc-publish.ts 1 32690
```

Key runtime proof:

```text
[PREVENTIVE-SUPPLIER] Using persisted ML Chile freight truth for original supplier validation
shippingUsd=2.99
selectedServiceName=CAINIAO_FULFILLMENT_STD
```

Exact retest result:

```text
success=false
marketplace=mercadolibre
error=Product not valid for publishing: financial completeness is insufficient: missing_marketplaceFeeEstimate, missing_fxFeeEstimate
```

## Exact code path fixed

P31 changed the live path:

```text
MarketplaceService.publishProduct
-> prepareProductForSafePublishing
-> runPreventiveSupplierAudit
-> validateCandidate
```

from:

```text
original supplier shipping truth = minShippingCostFromApi(getProductInfo())
```

to:

```text
original supplier shipping truth = resolveCanonicalMlChileFreightTruth(product.productData + shippingCost)
```

Additional controlled-path refinement:

- ML Chile controlled publish now skips alternative supplier mining once the original supplier has canonical persisted freight truth ready for publish.

## Real proof

- exact contradiction found: the original live validator still depended on legacy `getProductInfo().shippingInfo` / `normalizedShippingMethodCount` instead of persisted `mlChileFreight`
- exact contradiction fixed: the retest log explicitly shows persisted freight truth being consumed for the original supplier
- exact publish retest result: `listingCreated=false`
- exact new blocker: `financial completeness is insufficient: missing_marketplaceFeeEstimate, missing_fxFeeEstimate`
- exact post-retest DB state: `isPublished=false`, `listings=[]`, `publications=[]`

## P31 verdict

Outcome achieved:

`B. prove the exact remaining blocker that still blocks listing creation after reconciliation`

The remaining blocker is no longer freight truth.
