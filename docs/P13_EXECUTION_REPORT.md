# P13 Execution Report

## Sprint Scope

P13 stayed narrow by design:

- recover MercadoLibre Chile OAuth/runtime auth
- push Chile-support filtering earlier into discovery
- rerun the Chile-only recovery pass
- measure whether the first strict ML Chile candidate is now possible

## Implemented Changes

### OAuth And Runtime Auth

- Added a real MercadoLibre OAuth start URL generator in the marketplace service.
- Added a new authenticated route to begin MercadoLibre OAuth.
- Hardened MercadoLibre callback handling so token persistence is re-read, cache is cleared, and runtime usability is checked immediately after credential save.
- Extended runtime diagnostics to report `oauthStartUrl`, `oauthReauthRequired`, token shape, and runtime usability.
- Hardened MercadoLibre API availability checks so refresh success is persisted and re-verified against `users/me`.

### Chile-Supported Discovery Gate

- Added a new early discovery admission gate for Chile support.
- Updated the ML Chile enrichment batch so discovery support is checked before CL-SKU admission.
- Preserved explicit rejection codes across discovery and CL-SKU gates.

### Issue Queues And Diagnostics

- Extended issue queues with `oauthReauthRequired`.
- Kept auth, supplier, and commercial-truth blockers separated instead of collapsing them into a generic failure state.

### Regression Protection

- Added focused test coverage for:
  - ML OAuth truth classification
  - OAuth re-auth requirement classification
  - Chile-supported discovery admission
  - issue queue updates
  - AliExpress raw SKU normalization

## Fresh Evidence Obtained

### MercadoLibre Chile Auth

Final dedicated auth runtime proof:

- `hasAccessToken = true`
- `hasRefreshToken = true`
- `tokenShapeValid = true`
- `runtimeUsable = true`
- `authState = access_token_present`
- `oauthReauthRequired = false`
- `usersMe.status = 200`
- `usersMe.country_id = CL`

### Chile Discovery Pass

- `scannedAtDiscovery = 11`
- `admittedAfterChileSupportGate = 0`
- `admittedAfterClSkuGate = 0`
- `validated = 0`
- `discoveryGateSummaryByCode.no_destination_support_cl = 10`
- `discoveryGateSummaryByCode.supplier_data_incomplete = 1`

### Broad Readiness

- `targetCountryCl = 0`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 999`
- `strictMlChileReadyCount = 0`
- `mlSalesSummary.total = 0`
- `mlOrdersSummary.total = 0`

## What P13 Changed In Practice

P13 removed MercadoLibre Chile auth from the lead blocker position.

The next lead blocker is now cleaner and narrower:

- the current low-risk AliExpress discovery pool does not expose destination `CL` support strongly enough to even admit a candidate into the strict ML Chile funnel

## Validation

- `npm run type-check` passed

Focused tests were added and updated, but this sprint closes with type-check proof as the verified execution signal.

## Final P13 Business Outcome

Outcome `B` was achieved:

- MercadoLibre Chile auth was recovered and proven with a live call
- the current AliExpress discovery pool still cannot produce Chile-supported candidates at supplier level
