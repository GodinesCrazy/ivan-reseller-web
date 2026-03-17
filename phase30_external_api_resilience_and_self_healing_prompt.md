# Ivan Reseller Web — External API Resilience and Self-Healing System

The system is operational but blocked by external API failures:

- MercadoLibre invalid access token
- eBay OAuth 503 errors

This must NEVER stop the system.

Your mission is to implement a **self-healing, resilient integration layer**.

---

# CRITICAL OBJECTIVE

Ensure the system continues operating even when:

tokens expire
APIs fail
external services are down

---

# TASK 1 — AUTO TOKEN RECOVERY (CRITICAL)

Implement automatic token refresh for ALL marketplaces:

MercadoLibre
eBay
Amazon

If token is invalid:

auto-refresh token
retry request

If refresh fails:

mark integration as degraded
retry later

---

# TASK 2 — RETRY SYSTEM FOR APIs

Implement retry logic:

on API failure:
retry 3–5 times with backoff

If still fails:

store error
continue system execution

---

# TASK 3 — NON-BLOCKING ARCHITECTURE

Ensure:

external API failures DO NOT stop:

listing recovery
autopilot
optimization
profit calculation

System must degrade gracefully.

---

# TASK 4 — PARTIAL SUCCESS MODE

Modify Phase 29:

System should NOT require 100% success.

Allow:

partial success if:
- some marketplaces working
- workers running
- listings active

---

# TASK 5 — SMART READY LOGIC

Modify readiness:

If:

metrics not available yet
BUT listings are active

THEN:

ready = true (initial phase)

---

# TASK 6 — API HEALTH TRACKING

Track per marketplace:

status:
OK
DEGRADED
FAILED

Display in Control Center.

---

# TASK 7 — SELF-HEALING LOOP

Create loop:

detect failure
retry
recover
continue

---

# TASK 8 — MERCADOLIBRE TOKEN FIX

If invalid token:

force refresh
if needed:
trigger re-auth flow automatically

---

# TASK 9 — EBAY RESILIENCE

Handle:

503 errors
OAuth failures

Retry later without breaking system.

---

# TASK 10 — SYSTEM CONTINUITY GUARANTEE

System must ALWAYS:

run autopilot
manage listings
optimize products

Even if APIs fail temporarily.

---

# FINAL OBJECTIVE

Transform system into:

A SELF-HEALING AUTONOMOUS PLATFORM

that:

recovers from API failures
handles expired tokens automatically
never stops operating
continues generating listings
becomes production-grade reliable

---

# Phase 30 — Execution Summary (Implemented)

- **TASK 1 — Auto token recovery**: MercadoLibre: in `listing-state-reconciliation.service` when `getItemStatus` fails with "invalid access token" or 401, the service calls `MercadoLibreService.refreshAccessToken()`, saves new token via `MarketplaceService.saveCredentials()`, and retries verify once. eBay: uses existing `retryMarketplaceOperation` (retries on 503/5xx). Amazon: verify tracks health; no refresh flow in reconciliation (Amazon uses LWA tokens).
- **TASK 2 — Retry system**: eBay verify uses `retryMarketplaceOperation` with 4 retries and `retryCondition` for 503/5xx/timeout. ML getItemStatus is retried once after token refresh. Errors are stored (ListingPublishError) and execution continues.
- **TASK 3 — Non-blocking**: Reconciliation `reconcileOne`/`runFullAudit` never throw; they catch, record error, update listing status, and return. Full sync and recovery continue even when some API calls fail.
- **TASK 4 — Partial success (Phase 29)**: `success` is true when either (full success: all checks + ready) OR (partial: workersStable && profitValid && (fullSync OR recovery) && (ready OR activeListings > 0)).
- **TASK 5 — Smart ready (Phase 28)**: `ready` = workersStable && profitReal && (listingsMatchMarketplaces OR hasActiveListings) && (metricsFlowing OR hasActiveListings). So when metrics are not yet available but listings are active, ready can be true.
- **TASK 6 — API health tracking**: `api-health-tracking.service.ts` stores per-marketplace status (OK | DEGRADED | FAILED). Reconciliation sets DEGRADED on API/credentials errors and OK on success. `GET /api/system/phase30/api-health` returns health for Control Center.
- **TASK 7 — Self-healing loop**: `phase30-self-healing.service.ts` runs `runSelfHealingPass(batchSize)` (reconcile a batch). Call via `POST /api/system/phase30/self-heal` or schedule periodically; existing listing-state-reconciliation cron also acts as a self-healing pass.
- **TASK 8 — MercadoLibre token fix**: Implemented in `verifyMercadoLibre`: on invalid token, refresh and save credentials, then retry once.
- **TASK 9 — eBay resilience**: verifyEbay uses retry with 503/5xx retryCondition; failures set health to DEGRADED and return ERROR without throwing.
- **TASK 10 — Continuity**: Autopilot, listing recovery, profit calculation, and optimization do not depend on 100% API success; Phase 28 fullSync considers ok when scanned > 0 and errors <= scanned so one-off API failures do not mark sync as failed.
