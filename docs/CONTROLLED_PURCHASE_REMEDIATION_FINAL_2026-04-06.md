# Controlled Purchase Remediation Final (2026-04-06)

## Scope
- Objective: move Mercado Libre Chile controlled purchase from `NO-GO` to operational readiness using minimal, safe remediations.
- Candidate: `productId=32714`.
- Constraints respected: no broad refactors, no non-essential product features.

## Code Changes Implemented
- `backend/src/services/pre-publish-validator.service.ts`
  - Added auto-refresh path for stale/inconsistent `mlChileFreight` truth before failing economics core.
  - Persists refreshed `shippingCost/importTax/totalCost` and `mlChileFreight/mlChileLandedCost` metadata.
- `backend/src/services/mercadolibre-image-remediation.service.ts`
  - Fixed canonical `human_review` branch so it no longer skips all legacy fallback remediation.
  - Added fallback generation path for required assets when canonical output is not publish-safe.
- `backend/src/services/webhook-readiness.service.ts`
  - Added credential-based fallback statuses so readiness does not hard-fail to `not_configured` when fast status path is empty/stale.

## Targeted Data/Schema Remediations
- Applied production DB schema migrations for pilot/webhook tables:
  - `mercado_libre_webhook_events`
  - `pilot_launch_approvals`
  - `pilot_category_allowlists`
  - `pilot_decision_ledgers`
  - `pilot_control_states`
- Candidate-specific physical package fix (`products.id=32714`):
  - `packageWeightGrams=80`
  - `packageLengthCm=1`
  - `packageWidthCm=1`
  - `packageHeightCm=1`
  - `maxUnitsPerOrder=1` (already aligned)

## Root Causes Confirmed
1. `blocked_images`
   - Canonical image pipeline could end in `human_review`, and legacy remediation was skipped.
   - In runtime where local pack paths were not valid, this left `publishSafe=false`.
2. `freight truth stale`
   - Preflight previously failed hard when `mlChileFreight.checkedAt` age exceeded threshold, without automatic refresh.
3. Pilot readiness endpoints
   - Endpoint paths are mounted; non-auth requests now return `401` (not `404`), confirming exposure.
   - Backing pilot tables were missing before DB remediation.
4. Post-sale readiness gaps
   - Production webhook status still reports Mercado Libre webhook as not configured and no inbound event proof.
   - This keeps `eventFlowReady=false` and connector mode in partial/manual state.

## Evidence Snapshot
- Production route existence probe:
  - `/api/sales/pending-purchases` -> `401`
  - `/api/marketplace/mercadolibre/pilot-approvals` -> `401`
  - `/api/marketplace/mercadolibre/pilot-category-allowlist` -> `401`
  - `/api/marketplace/mercadolibre/pilot-ledger` -> `401`
  - `/api/marketplace/mercadolibre/pilot-control/32714` -> `401`
  - `/api/marketplace/mercadolibre/pilot-post-publish/32714` -> `401`
- Candidate preflight rerun (`p95-preflight.json`):
  - `overallState=ready_to_publish`
  - `publishAllowed=true`
  - `blockers=[]`
  - warnings remain on webhook/event-flow/international mode.
- Webhook status endpoint:
  - `/api/webhooks/status` shows `mercadolibre.configured=false`, `eventFlowReady=false`.

## Decision
- **Operational publish gate for candidate 32714:** `GO` (preflight allows publish).
- **Full post-sale automation gate:** `NO-GO` until Mercado Libre webhook secret/config + inbound event proof are completed in production.

## Deploy + Revalidation Checklist
1. Deploy backend with current code changes.
2. Re-run production probes:
   - `/api/sales/pending-purchases`
   - pilot endpoints listed above
   - `/api/products/32714/publish-preflight?marketplace=mercadolibre&publishIntent=pilot`
3. Verify webhook readiness:
   - `/api/webhooks/status` must show `mercadolibre.configured=true`.
4. Generate first inbound Mercado Libre webhook event and confirm:
   - `eventFlowReady=true`
   - `mercadolibreConnectorAutomationReady=true` in preflight postsale block.

