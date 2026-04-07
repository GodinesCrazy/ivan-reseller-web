# P89 — MLC pricing canonicalization

## Canonical path (single source of truth)

**All Mercado Libre listing economics used for publish/preflight decisions are computed through:**

1. **`runPreventiveEconomicsCore`** — `backend/src/services/pre-publish-validator.service.ts`  
   - Resolves destination + language context from ML credentials.  
   - Enforces **persisted ML Chile freight truth** when `shipCountry === 'CL'` (same as publish).  
   - Runs **preventive supplier audit** (`runPreventiveSupplierAudit`).  
   - Builds **`calculatePreventiveProfit`** (fee intelligence for `mercadolibre` via `calculateFeeIntelligence`, import/tax including Chile landed-cost rules).  
   - Builds **`buildListingFeeLedger`** (auditable ledger lines, completeness / blocking reasons).  
   - Enforces **min net profit** and **min margin ratio** (`PRE_PUBLISH_MIN_NET_PROFIT`, `PRE_PUBLISH_MIN_MARGIN_RATIO`).

2. **`mlc-canonical-pricing.service.ts`** — maps the economics core result into a stable JSON shape for APIs/docs (`MlcCanonicalPricingAssessment`), without a second fee model.

3. **Persisted snapshot** — `prepareProductForSafePublishing` writes `productData.preventivePublish` including `listingSalePriceUsd`, `profitability`, `feeLedger`, `marketplace`, `shipCountry`.

## What this replaces / deprecates for ML decisions

- **Do not** use `evaluatePrePublishValidation` → `computeProfitAfterFees` / `costCalculator.calculate` as the authority for **prepare/publish**; that path is a lighter risk scan and can diverge.  
- **`publishToMercadoLibre`** still applies a legacy `priceUsd > totalCostMl` guard; the **authoritative** profitability gate is `runPreventiveEconomicsCore` inside `prepareProductForSafePublishing`.

## Failure reasons

Failures surface as **string messages** from `runPreventiveEconomicsCore` (e.g. freight truth, supplier audit, ledger incompleteness, profit/margin floors). Preflight repeats the same core and exposes them under `canonicalPricing.failureReasons` and `blockers`.
