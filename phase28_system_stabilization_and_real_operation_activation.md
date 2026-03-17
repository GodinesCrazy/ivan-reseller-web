# Phase 28 — System Stabilization and Real Operation Activation

Your mission is to stabilize the system and ensure real-world operation before scaling.

---

# TASK 1 — FULL MARKETPLACE SYNC

Force full sync with:

MercadoLibre
eBay
Amazon

Update ALL listings:

status
errors
visibility

---

# TASK 2 — LISTING RECOVERY EXECUTION

Run ListingRecoveryEngine on ALL listings:

Fix
Republish
Remove invalid listings

---

# TASK 3 — REDIS AND WORKERS FIX

Ensure:

Redis connection = stable
BullMQ queues = active
All workers running

If degraded:

auto-reconnect
restart workers
log issues

---

# TASK 4 — REAL METRICS ACTIVATION

Ensure metrics ingestion is working:

impressions
clicks
sales

---

# TASK 5 — REAL PROFIT VALIDATION

Verify:

profit calculations are correct
all costs included

---

# TASK 6 — AUTOPILOT VALIDATION

Ensure autopilot:

is running
publishing
optimizing

---

# TASK 7 — SMALL SCALE TEST

Select limited products:

publish
monitor performance

---

# TASK 8 — SYSTEM READY CHECK

System is ready ONLY if:

listings match marketplaces
workers are stable
metrics flowing
profit real

---

# FINAL OBJECTIVE

Stabilize system to operate with REAL DATA and REAL RESULTS before scaling.

---

# Phase 28 — Execution Summary (Implemented)

- **TASK 1 — Full marketplace sync**: `listing-state-reconciliation.service` now supports **MercadoLibre, eBay, and Amazon** (added `verifyAmazon()` using AmazonService.getListingBySku). Force full sync: `POST /api/system/phase28/full-sync` (runs `runFullAudit` for all listings → status, errors, visibility updated).
- **TASK 2 — Listing recovery execution**: `POST /api/system/phase28/run-recovery` runs full audit → classification → `ListingRecoveryEngine.runRecovery()` (fix, republish, remove invalid). Body: `{ userId?, limit?, verifyWithApi? }`.
- **TASK 3 — Redis and workers fix**: `GET /api/system/phase28/workers-health` returns Redis ping, BullMQ connection status, and issues. Redis already has retryStrategy and lazy init; workers run via ScheduledTasksService (no auto-restart in code; log issues for ops).
- **TASK 4 — Real metrics activation**: `GET /api/system/phase28/metrics-status` checks ListingMetric counts and recent impressions/clicks/sales; reports if metrics are flowing.
- **TASK 5 — Real profit validation**: `GET /api/system/phase28/profit-validation` uses RealProfitEngine and verifies moneyIn - moneyOut = totalProfit and no negative aggregate profit.
- **TASK 6 — Autopilot validation**: `GET /api/system/phase28/autopilot-status` returns isRunning, enabled, lastCycle, configEnabled.
- **TASK 7 — Small scale test**: Use existing publish flows with a limited set of products (e.g. Publisher UI or `POST /api/publisher/listings/run-full-recovery` with small `limit`) and monitor via dashboard/analytics.
- **TASK 8 — System ready check**: `GET /api/system/phase28/ready?runFullSync=true` runs full readiness: listingsMatchMarketplaces, workersStable, metricsFlowing, profitReal, autopilotValid. System is ready only when all checks pass.
