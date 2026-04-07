# P14 Execution Report

## Sprint Scope

P14 stayed narrow:

- inventory the real AliExpress discovery surfaces
- replace generic seeds with a Chile-first supplier seed set
- run the new seed pass
- measure whether the strict ML Chile funnel finally receives admitted candidates

## Implemented Changes

### Chile Discovery Inventory And Seed Strategy

- Added a formal inventory of AliExpress discovery paths and classified them for Chile-first usefulness.
- Added a reusable ML Chile seed strategy utility with:
  - query inventory
  - title safety filtering
  - title/query alignment filtering
  - a controlled listing price derivation for future strict-funnel entry

### New Chile-First Discovery Seed Pass

- Added a new live script that:
  - starts from Affiliate search with `shipToCountry = CL`
  - confirms each result with Dropshipping `getProductInfo(... localCountry = 'CL')`
  - applies the Chile support gate
  - applies the CL-SKU gate
  - only then attempts strict ML Chile funnel entry

### Regression Protection

- Added focused tests for the seed strategy utility.

## Fresh Runtime Evidence

### ML Chile Auth Still Usable

Live command:

- `npm run check:ml-chile-auth-runtime -- 1`

Proof:

- `hasAccessToken = true`
- `hasRefreshToken = true`
- `tokenShapeValid = true`
- `runtimeUsable = true`
- `authState = access_token_present`
- `oauthReauthRequired = false`
- `usersMe.status = 200`
- `usersMe.country_id = CL`

### P14 Seed Pass

Live command:

- `npm run run:ml-chile-discovery-seed-pass -- 1 8`

Proof:

- `scannedAtDiscovery = 7`
- `admittedAfterChileSupportGate = 0`
- `admittedAfterClSkuGate = 0`
- `validated = 0`
- `discoveryGateSummaryByCode.no_destination_support_cl = 7`

### Broad Readiness

Live command:

- `npm run check:ml-chile-controlled-operation -- 1`

Proof:

- `targetCountryCl = 0`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 999`
- `strictMlChileReadyCount = 0`
- `mlSalesSummary.total = 0`
- `mlOrdersSummary.total = 0`

## What P14 Proved

P14 proved something narrower but more useful than the earlier generic failure:

- even a Chile-first AliExpress seed strategy built from Affiliate `shipToCountry = CL` still fails before strict enrichment
- the dominant blocker remains supplier-side `no_destination_support_cl`
- MercadoLibre auth is no longer the lead blocker

## Validation

- `npm run type-check` passed

Focused tests were added, but this sprint closes with type-check plus live discovery/runtime diagnostics as the verified execution signals.

## Final P14 Business Outcome

Outcome `B` was achieved:

- the new Chile-first seed strategy was implemented
- the current AliExpress discovery capability still cannot produce a Chile-supported seed that enters the strict ML Chile funnel
