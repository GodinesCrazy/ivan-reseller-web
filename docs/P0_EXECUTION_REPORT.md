# P0 Execution Report

Date: 2026-03-20

## What was changed

P0 focused on truth recovery and hardening, not feature expansion.

Implemented:
- unsafe product-state reconciliation logic
- legacy listing artifact archival and live-truth exclusion
- webhook readiness as a first-class connector gate
- strict country/currency resolution for live publish paths
- richer truth surfaces for inventory and setup/readiness endpoints
- regression tests for truth reconciliation, webhook gating, and currency strictness

## Files modified in this P0 execution

Core backend:
- `backend/src/services/operational-truth.service.ts`
- `backend/src/services/webhook-readiness.service.ts`
- `backend/src/services/destination.service.ts`
- `backend/src/services/marketplace-context.service.ts`
- `backend/src/services/pre-publish-validator.service.ts`
- `backend/src/services/marketplace.service.ts`
- `backend/src/services/product.service.ts`
- `backend/src/services/phase28-stabilization.service.ts`
- `backend/src/services/real-profit-engine.service.ts`
- `backend/src/api/routes/dashboard.routes.ts`
- `backend/src/api/routes/analytics.routes.ts`
- `backend/src/api/routes/setup-status.routes.ts`
- `backend/src/api/routes/system.routes.ts`

Operational scripts:
- `backend/scripts/p0-reconcile-operational-truth.ts`
- `backend/scripts/audit-db-snapshot.ts`

Regression tests:
- `backend/src/__tests__/services/destination.service.test.ts`
- `backend/src/__tests__/services/operational-truth.service.test.ts`
- `backend/src/__tests__/services/webhook-readiness.service.test.ts`
- `backend/src/__tests__/services/product.service.test.ts`

## DB statuses reconciled

### Before

- `APPROVED = 1523`
- `PUBLISHED = 1`
- `LEGACY_UNVERIFIED = 30351`
- unresolved `legacyLinkedListings = 508`
- failed publish artifacts contaminating listing state = `508`

### After

- `APPROVED = 0`
- `PUBLISHED = 0`
- `LEGACY_UNVERIFIED = 31875`
- unresolved `legacyLinkedListings = 0`
- `archivedLegacyArtifacts = 508`
- `VALIDATED_READY = 0`

## Whether unsafe APPROVED and PUBLISHED rows were eliminated

Yes.

Verified by current DB snapshot:
- no remaining `APPROVED` rows
- no remaining `PUBLISHED` rows
- anomaly scan now returns:
  - `publishedSamples = []`
  - `approvedSamples = []`

## Whether legacy-linked listing contamination was removed from live truth surfaces

Yes.

Implemented:
- legacy-linked rows were archived to `archived_legacy_artifact`
- live inventory summary now counts only verified active listings
- control-center funnel active listing count now excludes legacy/failed residue

Verified:
- current DB snapshot shows `legacyLinkedListings = 0`
- archived legacy artifacts preserved for auditability: `508`
- local `GET /api/dashboard/inventory-summary?environment=production` returned:
  - `products.approved = 0`
  - `products.published = 0`
  - `listingsTotal = 0`
  - `listingTruth.legacyArtifacts = 508`
  - `listingTruth.failedPublish = 0`

## Whether webhook readiness is now a hard gate

Yes, for automation claims and setup truth.

Implemented:
- connector readiness now separates:
  - configured
  - authenticated
  - operational API reachable
  - webhook ready
  - event-flow ready
  - automation ready
- setup-status now blocks “ready” semantics when webhooks are absent
- readiness/autopilot evaluation now uses webhook readiness

Verified locally via real authenticated HTTP:
- `GET /api/setup-status` returned:
  - `setupRequired = true`
  - `automationReadyMarketplaceCount = 0`
  - `ebay.operationMode = manual_or_polling_partial`
  - `mercadolibre.operationMode = manual_or_polling_partial`
  - `amazon.operationMode = blocked`
  - all webhook flags `configured = false`

## Whether unsafe currency fallbacks were eliminated

Done for live publish-path resolution and strict mapping.

Implemented:
- strict marketplace destination resolver
- eBay site mappings:
  - US -> USD
  - GB -> GBP
  - DE/ES/FR/IT -> EUR
- MercadoLibre Chile -> CL / CLP
- unresolved marketplace/site contexts now fail closed in preventive publish validation
- `GB` normalization replaced unsafe `UK` internal country semantics in strict path

Verified:
- focused regression tests passed for strict destination mapping
- live publish path now blocks unresolved marketplace destination/currency context before publish validation proceeds

## Validation summary

### Passed

- `npm run type-check`
- `npm run build`
- focused Jest regression tests:
  - `destination.service.test.ts`
  - `operational-truth.service.test.ts`
  - `webhook-readiness.service.test.ts`
- real DB reconciliation executed
- real DB before/after snapshot captured
- local authenticated API validation:
  - `/api/setup-status`
  - `/api/dashboard/inventory-summary?environment=production`
  - `/api/finance/real-profit?environment=production`

### Partially validated

- `/api/system/readiness-report`
  - local request timed out twice after the refactor
  - code path was updated, but the endpoint was not fully re-verified over HTTP in this session

## What remains unresolved

- `VALIDATED_READY` remains `0`
- webhooks are still not configured for any marketplace
- eBay remains only partially operational because it is not automation-ready without webhook/event flow
- MercadoLibre remains partial/blocked
- Amazon remains not ready
- last real failed order remains `SKU_NOT_EXIST`
- fee completeness is still not internationally complete
- language enforcement is still incomplete
- policy handling is still incomplete

## Exact next P1 tasks

1. Make language a hard publish constraint.
2. Complete per-listing fee ledger and publish-time completeness threshold.
3. Finish webhook registration and event-flow proof for eBay and MercadoLibre.
4. Build a validated-catalog UI that exposes blocked reasons and publication context.
5. Prove one real `VALIDATED_READY` product and one controlled safe sale.
