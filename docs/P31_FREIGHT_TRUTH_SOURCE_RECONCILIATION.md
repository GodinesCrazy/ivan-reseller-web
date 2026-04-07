# P31 Freight Truth Source Reconciliation

Date: 2026-03-22

## Canonical publish-time shipping truth contract for ML Chile

P31 defined the publish-time ML Chile contract as:

- `product.targetCountry = CL`
- `product.shippingCost` present and internally consistent
- `productData.mlChileFreight.freightSummaryCode = freight_quote_found_for_cl`
- `productData.mlChileFreight.selectedServiceName` present
- `productData.mlChileFreight.selectedFreightAmount` present
- `productData.mlChileFreight.selectedFreightCurrency` present
- `productData.mlChileFreight.checkedAt|observedAt|auditedAt` present and fresh

## Exact code path fixed

### 1. Canonical freight contract helper

Added `resolveCanonicalMlChileFreightTruth(...)` in:

`backend/src/services/pre-publish-validator.service.ts`

This helper now verifies:

- target country is `CL`
- summary code is `freight_quote_found_for_cl`
- selected service, amount, and currency exist
- persisted freight timestamp is fresh
- normalized freight amount matches top-level `shippingCost`

### 2. Strict publish preparation now requires canonical freight truth

`prepareProductForSafePublishing(...)` now:

- resolves canonical persisted freight truth for MercadoLibre Chile
- fails honestly if persisted freight truth is absent, stale, or inconsistent
- passes the validated freight contract into the preventive supplier audit

### 3. Original supplier validation now consumes canonical freight truth

`validateCandidate(...)` in:

`backend/src/services/preventive-supplier-validation.service.ts`

now uses the persisted ML Chile freight truth for the original supplier instead of relying on:

- `minShippingCostFromApi(info)`
- `shippingInfo.availableShippingMethods`
- `normalizedShippingMethodCount`

Observed runtime proof from the retest:

```text
[PREVENTIVE-SUPPLIER] Using persisted ML Chile freight truth for original supplier validation
shippingUsd=2.99
selectedServiceName=CAINIAO_FULFILLMENT_STD
```

### 4. Controlled ML Chile publish no longer waits on fallback supplier mining

For the controlled ML Chile path with canonical freight truth already ready, P31 now skips alternative supplier search in the preventive audit. This preserves strictness on the chosen original supplier and avoids re-opening unrelated seller-mining work.

## Reconciliation result

The freight contradiction was resolved.

The live validator now accepts the canonical persisted ML Chile freight contract as real shipping truth for the original supplier.
