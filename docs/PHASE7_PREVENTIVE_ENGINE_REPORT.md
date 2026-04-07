# Phase 7 — Preventive Fulfillment & Safe Listing Engine

Date: 2026-03-20

## Goal

Shift the system from reactive fulfillment to preventive publication:

- no publish without real AliExpress SKU validation
- no publish without real destination shipping
- no publish with estimated shipping fallback
- no publish without real profit validation
- no cross-country assumptions

## Code Changes Executed

### 1. Safety-first defaults

File:
- `backend/src/config/env.ts`

Changes:
- `PRE_PUBLISH_MIN_MARGIN_RATIO` default raised from `0` to `0.10`
- `PRE_PUBLISH_SHIPPING_FALLBACK` default changed from `true` to `false`
- `PRE_PUBLISH_REJECT_RISKY` default changed from `false` to `true`

Effect:
- shipping fallback is now blocked by default
- low/zero-margin listings are blocked by default
- risky publish classifications are rejected by default

### 2. Preventive publish preparation engine

File:
- `backend/src/services/pre-publish-validator.service.ts`

Changes:
- added strict destination-country enforcement using marketplace destination
- added `prepareProductForSafePublishing(...)`
- added multi-supplier preventive validation integration
- added real tax-aware and fee-aware profitability calculation
- added `persistPreventivePublishPreparation(...)`
- kept legacy `evaluatePrePublishValidation(...)` for risk scans, but hardened country validation

Effect:
- the system now prepares a publish only after selecting a validated supplier
- real shipping from AliExpress API is mandatory
- total cost now includes supplier cost, shipping, taxes, marketplace fees, payment fees
- validated supplier, SKU, cost, stock, and fallback audit are persisted before publish

### 3. Publish path hard gate

File:
- `backend/src/services/marketplace.service.ts`

Changes:
- `publishProduct(...)` now calls `prepareProductForSafePublishing(...)`
- validated supplier and real cost data are persisted before any marketplace call

Effect:
- marketplace publishing is now blocked before reaching eBay / MercadoLibre / Amazon if supplier, shipping, or profit validation fails

### 4. Safe smartwatch pipeline aligned to the new gate

File:
- `backend/src/services/smartwatch-constrained-cycle.service.ts`

Changes:
- kept strict discovery filter for smartwatch <= 10 USD
- upgraded the pipeline to run the new preventive preparation gate before returning success

Effect:
- the controlled smartwatch -> MercadoLibre Chile path now uses the same strict gate as the real publish path

### 5. Multi-supplier validation service

File:
- `backend/src/services/preventive-supplier-validation.service.ts`

Changes:
- added ranked supplier audit using:
  - original AliExpress supplier
  - Affiliate API search
  - real Dropshipping API validation
- returns:
  - best supplier
  - fallback suppliers
  - rejected suppliers
  - supplier reliability score

Effect:
- a product is no longer treated as publishable based on a single stale source supplier

## Real Validation Executed

### Build / compile

Executed:
- `npm run type-check`
- `npm run build`

Result:
- both passed

### Local compiled backend

Executed:
- started compiled backend via `node dist/server-bootstrap.js`
- called `GET http://localhost:4000/api/internal/health`

Result:
- internal routes healthy
- preventive validation endpoints available

Notes:
- local Redis was not available on `localhost:6379`
- this did not block the Phase 7 validation path

## Real Data Audit

### Full catalog structural audit

Executed against real PostgreSQL data.

Result:

```json
{
  "totalProducts": 32650,
  "statusGroups": {
    "APPROVED": 31708,
    "PENDING": 772,
    "PUBLISHED": 167,
    "REJECTED": 3
  },
  "activeListings": 0,
  "listingGroups": {
    "ebay.failed_publish": 157,
    "mercadolibre.failed_publish": 351
  },
  "approvedOrPublishedCount": 31875,
  "withoutSku": 31874,
  "withoutTargetCountry": 31864,
  "withoutCosts": 31875,
  "withoutPreventiveMeta": 31875
}
```

Interpretation:
- there are currently `0` active listings, so there was no live inventory to reconcile as publish-safe
- nearly the entire `APPROVED + PUBLISHED` catalog still lacks preventive coverage from historical data
- Phase 7 fixes future publish safety, but the backlog remains structurally unsafe until revalidated

## Safe Test Pipeline Validation

### Controlled test requested

Requested flow:
- category: smartwatch
- max supplier cost: 10 USD
- marketplace: MercadoLibre Chile
- validate only, no real publish

Executed:
- `POST /api/internal/smartwatch-mlc-constrained-cycle`
- body: `{"validateOnly":true,"credentialEnvironment":"production"}`

Real result:

```json
{
  "success": false,
  "stoppedAt": "stage3to6",
  "message": "Ningún candidato pasó validación estricta (CL + stock + SKU + envío API + margen + topes de coste).",
  "stage1_activeListingsUser": 0,
  "stage1_dropshippingConnected": true,
  "stage1_mercadolibreReady": true,
  "stage2_discovery_count": 9,
  "stage2_candidatesAfterFilter": 1
}
```

Meaning:
- the new engine prevented publication
- no unsafe listing was created
- the system now prefers rejection over risky automation

## Rejected Product Evidence

### Candidate generated by the real smartwatch pipeline

Real product row created during validation:

```json
{
  "id": 32684,
  "status": "REJECTED",
  "title": "Watch Box Organizer For Men or Women，Watch Travel Case Portable Storage Watch Display Holder for Wristwatches and Smart Watches",
  "aliexpressUrl": "https://www.aliexpress.com/item/3256808321237552.html?...",
  "targetCountry": "CL"
}
```

This product was rejected before any marketplace publish occurred.

### Direct preventive supplier audit on the same real candidate

Executed:
- `runPreventiveSupplierAudit(...)` with:
  - real product title
  - real AliExpress URL
  - destination country `CL`

Real result:

```json
{
  "validatedSuppliers": 0,
  "fallbackSuppliers": 0,
  "searchedAlternatives": 20,
  "attemptedAlternativeValidation": 0,
  "validatedAlternativeCount": 0,
  "supplierReliabilityScore": 0,
  "originalSupplierPassed": false,
  "optimizedQuery": "watch box men women travel case",
  "rejectedSuppliers": [
    {
      "source": "original",
      "productId": "3256808321237552",
      "reason": "no AliExpress SKU with stock > 0 for this destination"
    }
  ]
}
```

Meaning:
- original supplier failed real Dropshipping validation
- no validated fallback supplier was found from the real affiliate search result set
- reliability score remained `0`
- the candidate was correctly blocked

### Direct preventive gate validation

Executed:
- `prepareProductForSafePublishing(...)` on product `32684`

Real result:

```json
{
  "success": false,
  "message": "Product not valid for publishing: no AliExpress SKU with stock > 0 for this destination"
}
```

Meaning:
- the real publish gate now blocks the exact failure class that previously caused downstream fulfillment incidents
- `SKU_NOT_EXIST` risk is now being stopped before publication in this tested path

## Accepted Products

Accepted in this validation run:
- `0`

Reason:
- the only candidate that passed the discovery and cost filter did not pass supplier/SKU validation for Chile

This is the correct preventive behavior.

## What Is Now Prevented

The new publish gate now blocks publication when any of the following is true:

- no AliExpress product id can be parsed
- no AliExpress Dropshipping credentials are available
- product target country conflicts with marketplace country
- no SKU exists for destination
- SKU has no stock
- shipping cost is not returned by AliExpress API
- real net profit is `<= 0`
- real margin is below configured minimum
- fallback supplier audit finds no valid supplier

## Remaining Backlog

Phase 7 fixes future publication safety, but it does not automatically clean the historical catalog.

Backlog still requiring controlled revalidation:

- `31874` approved/published products without stored SKU
- `31864` approved/published products without explicit target country
- `31875` approved/published products without stored real cost fields
- `31875` approved/published products without preventive metadata
- `508` historical failed publish rows across eBay and MercadoLibre

## Important Honesty Boundary

I did **not** claim a full external Dropshipping API audit across all `32,650` products.

What was verified with real data:
- full structural catalog audit in PostgreSQL
- real smartwatch discovery flow
- real AliExpress Dropshipping validation on the generated candidate
- real AliExpress Affiliate alternative-supplier search for that candidate
- real preventive publish gate rejection

What was **not** fully executed:
- `32,650` live AliExpress Dropshipping validations, one by one
- `32,650` multi-supplier external audits, one by one

Why:
- that would require tens of thousands of live external API calls and is not honest to imply as “completed” without actually spending that runtime and rate budget

## Phase 7 Status

Status: `SAFE GATE IMPLEMENTED`

Meaning:
- future publish attempts now have a preventive real-data gate in code
- the controlled real test product was blocked safely
- no unsafe product was published during validation

This does **not** yet mean:
- the historical catalog is clean
- the current approved backlog is publish-safe

## Final Assessment

Current state after Phase 7:

- safety over automation: `YES`
- invalid SKU prevented before publish: `YES`
- estimated shipping blocked by default: `YES`
- country-aware validation enforced: `YES`
- profit validation enforced before publish: `YES`
- safe smartwatch test publish succeeded: `NO`
- unsafe smartwatch candidate blocked: `YES`

## Recommended Next Strict Step

Before re-enabling any autonomous publishing:

1. run a controlled revalidation batch over the historical `APPROVED` / `PUBLISHED` catalog
2. downgrade or reject products that fail preventive validation
3. only then consider re-enabling automatic publication or scaling
