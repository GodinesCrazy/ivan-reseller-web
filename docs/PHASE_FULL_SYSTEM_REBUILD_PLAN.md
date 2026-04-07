# PHASE FULL SYSTEM REBUILD PLAN

Date: 2026-03-20
Objective: transform Ivan Reseller into a real-data-only, zero-inconsistency, intuitive, synchronized, autonomous SaaS
Basis: verified live production behavior, frontend browser automation, internal diagnostics, and code audit

## Final Target

The rebuilt system must satisfy all of the following:

- every dashboard metric is traceable to one backend source of truth
- every backend readiness claim is backed by a real live check
- listing state in UI, DB, and marketplace is identical
- order state in UI, DB, and marketplace is identical
- profit includes product, shipping, marketplace fee, and payment fee
- autopilot can run without manual intervention
- connector failures are visible, not hidden by safe fallbacks
- no default credentials and no plaintext secrets in local or deployed environments

## Phase 0 - Containment

Priority: P0
Revenue impact: prevents account takeover, false confidence, and bad purchasing decisions

### Fixes

1. Rotate all secrets currently present in local env files.
   - Includes OpenAI, eBay, MercadoLibre, PayPal, AliExpress, Stripe, SendGrid, scraper keys, and internal secret.

2. Remove `admin/admin123` from production immediately.
   - Force password reset.
   - Add first-login or password-rotation enforcement.

3. Freeze autopilot activation in UI and API until connector truth is repaired.
   - Current production shows `automationModeStatus=disabled` but Control Center still suggests readiness.

4. Add a production audit banner in admin UI.
   - Message: system in rebuild mode; metrics may be inconsistent; autonomous execution disabled.

### Acceptance criteria

- production default credentials rejected
- all rotated secrets replaced in Railway/Vercel and local secure storage
- autopilot buttons blocked behind real readiness gate

## Phase 1 - Truth Model Rebuild

Priority: P0
Revenue impact: removes contradictory metrics that currently mislead business decisions

### Problem

Verified contradictions:

- `products.published=171` while `inventory-summary.listingsTotal=0`
- Dashboard says `PUBLICADOS 0`
- Products page says `Datos reales` but still surfaces approved/published semantics that do not match active marketplace listings
- Control Center shows `507 Active listings` in funnel while other live endpoints show `0` active listings

### Fixes

1. Create a canonical entity-state contract:
   - `product.lifecycleStatus`
   - `listing.syncStatus`
   - `listing.marketplaceRealityStatus`
   - `order.fulfillmentStatus`
   - `sale.recognitionStatus`

2. Define one canonical meaning for each UI metric:
   - `Published products`
   - `Active listings`
   - `Reconciled listings`
   - `Delivered sales`
   - `Real profit`

3. Split product and listing concepts everywhere.
   - Product page currently mixes catalog count with marketplace count.
   - Rebuild widgets so `approved products` and `active marketplace listings` are never shown as equivalent.

4. Replace duplicated setup/auth/business status models with one integration state model:
   - `configured`
   - `authenticated`
   - `healthy`
   - `webhook_ready`
   - `operational`

5. Remove duplicate API rows in setup-status.
   - One row per API/integration only.

### Acceptance criteria

- same value for active listings in Dashboard, Products, Control Center, and publisher sync endpoints
- same value for real sales in Dashboard, Orders, Finance, and inventory summary
- no page labels a metric as “real” unless it is marketplace-validated or explicitly marked DB-only

## Phase 2 - Connector Reality Enforcement

Priority: P0
Revenue impact: restores actual sell-through capability

### Problem

Verified:

- eBay internal connection test fails
- `system/status.ebayConnected=false`
- setup still says marketplace setup complete
- webhook configuration is false for eBay, MercadoLibre, Amazon

### Fixes

1. Rebuild readiness logic to require successful live connector checks.
   - `marketplaceApi=ok` must not come from credential count alone.

2. Add per-marketplace operational probes:
   - eBay: account info, listing fetch, order fetch
   - MercadoLibre: me/profile, listing fetch, order fetch
   - Amazon: health only if truly enabled

3. Add webhook readiness to operational status.
   - Without webhook, connector may be `configured` but not `fully_operational`.

4. Store connector state snapshots with timestamps.
   - Make stale connector health visible in UI.

5. Add connector SLA page in Control Center.
   - last success
   - last failure
   - token expiry
   - webhook state
   - retry queue

### Acceptance criteria

- readiness fails if eBay live probe fails
- system status and setup status agree on connector state
- operators can see exact reason for degraded connector state

## Phase 3 - Listing State Reconciliation Rebuild

Priority: P0
Revenue impact: restores accurate inventory and marketplace publishing decisions

### Problem

Verified:

- `publisher/listings/sync-status.listingsActive=0`
- recent listing records exist but recent records are `failed_publish`
- some rows have eBay URLs but still carry `failed_publish`
- `lastReconciliationCronRun=null`

### Fixes

1. Create a full listing-reality reconciliation job that classifies each listing as:
   - `active_confirmed`
   - `inactive_confirmed`
   - `publish_failed`
   - `ghost_db_only`
   - `marketplace_only_missing_db`

2. Backfill all 508 marketplace listing records using real marketplace fetches.

3. For any record with marketplace URL but failed status:
   - recheck remote existence
   - normalize to actual remote state

4. Update product-level `published` only from confirmed active listings.

5. Persist reconciliation timestamp and source on each listing.

### Acceptance criteria

- active listing count validated from remote marketplaces
- no product marked published without at least one active confirmed listing
- no ghost DB-only listings remain

## Phase 4 - Supplier and Fulfillment Hardening

Priority: P0
Revenue impact: prevents failed purchases and hidden margin loss

### Problem

Verified:

- latest real order failed with `SKU_NOT_EXIST`
- AliExpress DS credentials exist, but backend env token presence is incomplete
- supplier stage can appear healthy while actual order execution is unsafe

### Fixes

1. Make SKU validation mandatory before publish.
   - validate SKU existence
   - validate stock
   - validate shipping to target destination
   - validate variant mapping

2. Add pre-publish supplier lock record:
   - supplier URL
   - supplier product id
   - selected SKU id
   - shipping quote
   - last validated at

3. Add fulfillment eligibility check before order processing.
   - If supplier SKU is stale, stop and mark `manual_intervention_required`, not generic failure.

4. Unify AliExpress credential source.
   - DB and env should not disagree on active runtime token strategy.

5. Add fallback supplier logic only if truly implemented.
   - If no real alternative supplier exists, remove UI claims about fallback.

### Acceptance criteria

- no order reaches purchase attempt without validated SKU
- place-order path rejects stale or invalid supplier references before money is at risk
- supplier runtime token source is deterministic

## Phase 5 - Financial Engine Correction

Priority: P0
Revenue impact: prevents underpricing and fake profitability

### Problem

Code audit verified:

- pricing defaults `shippingUsd` to `0` in important flows
- real profit engine can fall back to default shipping rather than actual quote data
- working capital degraded mode can allow purchases when real balance is unavailable

### Fixes

1. Remove zero-shipping default from publish and pricing decisions.
   - Shipping must be API-quoted or explicitly marked unknown.

2. Block publish when shipping quote is unknown for the target country.

3. Require real fee completeness for profit classification:
   - supplier cost
   - shipping
   - marketplace fee
   - payment fee

4. Mark profit as `estimated` vs `finalized`.
   - `estimated` before delivery/fee settlement
   - `finalized` after full cost capture

5. Remove permissive purchase mode when PayPal balance is unavailable.
   - Replace with operator override plus audit log.

### Acceptance criteria

- no listing is published using zero/unknown shipping unless explicitly flagged as operator override
- finance pages show fee completeness state
- profit cannot be shown as real if shipping or fees are missing

## Phase 6 - UX Rebuild

Priority: P1
Revenue impact: improves operator decision quality and reduces false actions

### Verified UX problems

- `/analytics` is 404 in production
- Dashboard mixes high-level narrative with low-trust contradictory metrics
- Products page uses “publicados” language while showing zero active listings and a huge catalog count
- Control Center says system readiness is strong while autonomy is disabled and active listings are zero
- pages contain duplicate status language for integrations
- information density is high, but decision clarity is low

### UX redesign actions

1. Replace current IA with a clearer operator model:
   - Overview
   - Listings
   - Orders
   - Profit
   - Integrations
   - Automation
   - Diagnostics

2. Remove or hide broken routes.
   - `/analytics` must either exist or disappear from navigation.

3. Introduce a `trust badge` model for widgets:
   - `marketplace-verified`
   - `db-only`
   - `estimated`
   - `stale`

4. Redesign dashboard into three layers:
   - Revenue truth
   - Operational blockers
   - Automation state

5. Simplify terminology:
   - `approved products`
   - `published products`
   - `active listings`
   - `orders awaiting purchase`
   - `delivered sales`

6. Improve readability:
   - stronger contrast
   - fewer all-caps descriptions
   - clearer primary actions
   - less mixed Spanish/English in critical control surfaces

### Acceptance criteria

- no key page shows contradictory numbers for the same concept
- every KPI includes trust/source label
- no 404 page linked from primary operations nav

## Phase 7 - Data Cleanup and Migration

Priority: P1
Revenue impact: removes dead operational load and bad reporting

### Cleanup actions

1. Identify and purge test/fake/demo artifacts from production-facing views.
2. Reclassify failed/ghost listings after reconciliation.
3. Repair or archive 506 low-margin listings flagged by launch-readiness.
4. Review the 44 failed orders and assign root cause categories:
   - supplier invalid SKU
   - token/auth failure
   - shipping invalid
   - balance gate failure
   - marketplace sync issue

5. Recompute:
   - product published flags
   - active listing counts
   - sales summary
   - finance summary caches

### Acceptance criteria

- no production dashboard widget includes ghost or stale listing counts
- all failed orders have root cause category and remediation path

## Phase 8 - Automation Relaunch

Priority: P1
Revenue impact: moves system from control plane to operating business

### Fixes

1. Relaunch autopilot only after:
   - connector truth fixed
   - listing reconciliation complete
   - financial safeguards corrected
   - supplier validation enforced

2. Add a real autonomy gate:
   - active marketplace operational
   - supplier purchase operational
   - metrics flow operational
   - webhook readiness acceptable
   - no blocking alerts

3. Add autonomous cycle audit log:
   - discovery count
   - validated count
   - published count
   - synced orders
   - fulfilled orders
   - failed transitions

### Acceptance criteria

- autopilot can complete a real cycle without hidden manual steps
- each cycle emits auditable counts by stage

## Phase 9 - Deployment and Observability Upgrade

Priority: P1
Revenue impact: reduces downtime and hidden regressions

### Fixes

1. Expose Railway and Vercel build/deploy metadata inside admin diagnostics.
2. Add release health gates:
   - critical routes
   - connector probes
   - listing sync truth
   - order sync truth
   - finance truth

3. Add Redis/BullMQ visibility:
   - queue depth
   - active jobs
   - failed jobs
   - stalled jobs
   - retry counts

4. Persist `lastReconciliationCronRun` and worker heartbeat state.

### Acceptance criteria

- operators can see actual queue health without opening external dashboards
- release can be blocked automatically if truth checks fail

## Priority Order

1. Phase 0 - Containment
2. Phase 1 - Truth Model Rebuild
3. Phase 2 - Connector Reality Enforcement
4. Phase 3 - Listing State Reconciliation Rebuild
5. Phase 4 - Supplier and Fulfillment Hardening
6. Phase 5 - Financial Engine Correction
7. Phase 6 - UX Rebuild
8. Phase 7 - Data Cleanup and Migration
9. Phase 8 - Automation Relaunch
10. Phase 9 - Deployment and Observability Upgrade

## Revenue Impact Summary

### Highest positive impact

- Fixing connector truth and listing reconciliation
  - restores actual sellable inventory
- Fixing supplier SKU validation
  - avoids failed orders and refunds
- Fixing financial completeness
  - prevents underpricing and hidden loss
- Fixing UX contradictions
  - improves operator decisions and reduces bad actions

### Highest current revenue drag

- zero active listings despite large catalog
- failed eBay operational state
- failed real fulfillment on invalid SKU
- disabled autopilot
- misleading KPI surfaces that hide operational blockers

## Success Milestones

### Milestone A - Truth Safe

- no default credentials
- no plaintext secrets in active workflow
- no contradictory listing counts
- no broken main nav routes

### Milestone B - Commerce Safe

- connector probes pass for enabled marketplaces
- supplier SKU and shipping validation required
- real profit includes all mandatory costs

### Milestone C - Autonomous Safe

- autopilot enabled
- active listings > 0
- real metrics flowing
- successful end-to-end order sync and fulfillment path validated

## Final Rebuild Verdict

Current state: PARTIAL

Target state after phases above: READY

Target state after sustained operational proof and UX cleanup: MARKET LEADER candidate
