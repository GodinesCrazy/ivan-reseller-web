# Ivan Reseller Web — Full Autonomous Stabilization and Profit Activation

You are now acting as a FULL-SCALE AUTONOMOUS SOFTWARE OPERATION TEAM.

Your mission is to take a partially working system and transform it into a:

REAL, STABLE, SYNCHRONIZED, PROFIT-GENERATING DROPSHIPPING PLATFORM

WITHOUT asking the user for manual steps.

You must execute EVERYTHING automatically.

---

# CRITICAL RULES

- Do NOT remove working functionality
- Do NOT break existing features
- Fix, stabilize, validate and activate
- Use internal APIs, services, and automation
- Execute flows programmatically

---

# GLOBAL OBJECTIVE

Ensure the system:

- Matches REAL marketplace state
- Shows ONLY real data
- Maintains listings automatically
- Has working workers (Redis + BullMQ)
- Runs autonomous loop
- Is capable of generating REAL profit

---

# PHASE 1 — SYSTEM REALITY CLEANUP

1. Execute full data audit:

Remove or mark:

- test orders
- mock revenue
- fake listings
- sandbox transactions

Ensure ALL dashboards use only REAL data.

---

# PHASE 2 — MARKETPLACE FULL SYNC

Automatically execute:

POST /api/system/phase28/full-sync

For ALL users.

Ensure:

- ML listings synced
- eBay listings synced
- Amazon listings synced

Update local DB to match REAL marketplace state.

---

# PHASE 3 — FULL LISTING RECOVERY

Execute:

POST /api/system/phase28/run-recovery

Apply:

- fix listings
- republish listings
- remove invalid listings
- correct attributes
- correct categories
- fix policy violations

---

# PHASE 4 — WORKER AND REDIS STABILIZATION

Check:

GET /api/system/phase28/workers-health

If not OK:

- reconnect Redis
- restart BullMQ workers
- ensure queues are active

Repeat until:

redis = ok
workers = ok

---

# PHASE 5 — METRICS ACTIVATION

Execute:

GET /api/system/phase28/metrics-status

If metrics missing:

- trigger metrics ingestion jobs
- force marketplace metrics sync

Ensure:

impressions > 0 (eventually)
clicks tracked
sales tracked

---

# PHASE 6 — PROFIT VALIDATION

Execute:

GET /api/system/phase28/profit-validation

Ensure:

- all costs included
- real profit calculation
- no fake revenue

If missing data:

- enrich from marketplace APIs
- fallback safe estimation

---

# PHASE 7 — AUTOPILOT ACTIVATION

Check:

GET /api/system/phase28/autopilot-status

If not running:

START autopilot automatically.

Ensure system:

- discovers products
- publishes listings
- optimizes listings
- reacts to metrics

---

# PHASE 8 — CONTROLLED TEST EXECUTION

Automatically select a SAFE subset of products:

5–10 products per marketplace

Ensure:

high-quality listings
correct categories
competitive pricing

Publish and monitor.

---

# PHASE 9 — MARKETPLACE VALIDATION

Using APIs:

Verify listings exist in:

MercadoLibre
eBay
Amazon

Ensure:

- listings visible
- not rejected
- not pending correction

---

# PHASE 10 — REPEAT UNTIL STABLE

Continuously:

sync → recover → validate → optimize

Until system meets ALL:

workers OK
redis OK
listings match marketplaces
metrics flowing
profit calculation valid

---

# PHASE 11 — FINAL READINESS CHECK

Execute:

GET /api/system/phase28/ready?runFullSync=true

Loop until:

ready = true

---

# PHASE 12 — AUTONOMOUS OPERATION CONFIRMATION

Ensure system is:

running autopilot
publishing listings
optimizing listings
processing metrics
tracking profit

---

# FINAL OBJECTIVE

The system must reach a state where:

- Marketplace data is REAL and synchronized
- Listings are automatically maintained
- Broken listings are removed
- Workers are stable
- Metrics are flowing
- Profit is measurable and real
- System runs autonomously

This must be achieved WITHOUT user intervention.

The system must behave like a REAL BUSINESS OPERATION, not just software.

---

# Phase 29 — Execution Summary (Implemented)

- **Trigger**: `POST /api/system/phase29/run` (authenticated). Runs all phases in sequence; result stored in `system_config.phase29_last_run`. `GET /api/system/phase29/status` returns the last run.
- **Phase 1 — Reality cleanup**: Counts test/mock/demo sales (already excluded from dashboards by Phase 27 filters); no DB removal to avoid breaking refs.
- **Phase 2 — Full sync**: Calls `runFullMarketplaceSync()` for ALL users (no userId).
- **Phase 3 — Full recovery**: Calls `runListingRecoveryOnAll({ limit: 2000 })` (fix, republish, remove invalid).
- **Phase 4 — Workers**: `checkRedisAndWorkers()` with up to 5 retries and 2s delay until OK or max retries.
- **Phase 5 — Metrics**: If metrics missing, enqueues jobs on `ebay-traffic-sync` and `listing-metrics-aggregate` queues.
- **Phase 6 — Profit**: `validateRealProfit({ days: 30 })`.
- **Phase 7 — Autopilot**: If not running, gets first admin (or first user) and calls `autopilotSystem.start(userId)`.
- **Phase 8 — Controlled test**: Selects up to 8 products per marketplace (mercadolibre, ebay, amazon) that are publishable (no active listing or non-active), enqueues `publish-product` jobs (up to 5 per user per marketplace).
- **Phase 9 — Marketplace validation**: Runs full sync again.
- **Phase 10 — Repeat until stable**: Up to 3 iterations of sync → recovery → metrics → profit check until all OK.
- **Phase 11 — Final ready**: `runSystemReadyCheck({ runFullSync: true })` up to 5 times with 3s delay until `ready === true`.
- **Phase 12**: Result returned with `success`, `ready`, `checks`, `details`, `issues`, `durationMs`.
