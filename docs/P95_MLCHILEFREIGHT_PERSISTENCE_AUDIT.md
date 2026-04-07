# P95 — ML Chile Freight Persistence Audit

## Product: 32714

## Why mlChileFreight Was Missing

**Root cause**: The product 32714 was created via `p92-staging-candidate-setup.ts` (evidenced by `p92StagingCandidate: true` in metadata). The P92 staging script creates product rows and runs basic enrichment, but it does **not** invoke the full freight-quoting path that persists `mlChileFreight` into `productData`.

The `mlChileFreight` field is only populated when one of these code paths runs:
1. `forensic-ml-chile-freight-quotes.ts` — batch forensic script
2. `run-ml-chile-destination-first-enrichment.ts` — enrichment batch
3. The original P95 recovery script `p95-recover-ml-chile-freight-32714.ts`

Product 32714 did not go through any of these paths before P94 attempted preventive preparation.

## Blocker Classification

| Category | Status |
|---|---|
| Freight quote not fetched | ✅ This was the blocker — no freight quote had been executed for this product |
| Freight quote fetched but not persisted | N/A |
| Persistence schema mismatch | N/A |
| Earlier step not executed | ✅ P92 staging did not include freight truth enrichment |

## Code Path Analysis

### Where the check happens
`pre-publish-validator.service.ts` line 945–955:

```typescript
const persistedMlChileFreightTruth =
  marketplace === 'mercadolibre' && shipCountry === 'CL'
    ? resolveCanonicalMlChileFreightTruth(product, shipCountry)
    : null;

if (marketplace === 'mercadolibre' && shipCountry === 'CL' && !persistedMlChileFreightTruth?.ok) {
  return {
    ok: false,
    message: `persisted ML Chile freight truth is not ready for publish: ${persistedMlChileFreightTruth?.reason || 'unknown reason'}`,
  };
}
```

### What `resolveCanonicalMlChileFreightTruth` requires
- `metadata.mlChileFreight` must exist as an object
- `freightSummaryCode === 'freight_quote_found_for_cl'`
- `targetCountry === 'CL'`
- `selectedServiceName` present
- `selectedFreightCurrency` present
- `selectedFreightAmount >= 0` and finite
- Timestamp present and not older than 72 hours
- `shippingCost` column matches freight truth within $0.01 tolerance

## Conclusion

The blocker was **"earlier step not executed"** — the product's freight truth had never been fetched and persisted. The P95 recovery script fixes this by:
1. Calling `calculateBuyerFreight` from AliExpress Dropshipping API
2. Selecting the best freight option via `selectMlChileFreightOption`
3. Computing landed cost via `calculateMlChileLandedCost`
4. Persisting both `mlChileFreight` and `mlChileLandedCost` into `productData`
5. Updating `shippingCost`, `importTax`, `totalCost` columns
