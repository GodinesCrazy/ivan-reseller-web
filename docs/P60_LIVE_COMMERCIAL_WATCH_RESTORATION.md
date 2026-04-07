# P60 — Live Commercial Watch Restoration

Date: 2026-03-24  
Sprint: P60 — Runtime Recovery + Listing Stability

## Objective

Restore the ability to monitor the controlled listing commercially.

## P60 Attempt

**Commands:**
- `npx tsx scripts/p60-db-connectivity-test.ts` — FAIL
- `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` — FAIL

**Result:** Live watch **not** restored. Both blocked by Postgres connection exhaustion.

## Order Watch Flow (when available)

1. **p50-monitor:** Fetches ML item status, recent orders, runs sync, reports internal orders and proof-ladder stage.
2. **sync-marketplace:** `POST /api/orders/sync-marketplace` — requires running API (also DB-dependent).
3. **Proof ladder:** Derived from latest order and sale in p50 output.

## Current State

| Metric | Value |
|--------|-------|
| order count | Unknown (no fetch) |
| internal mercadolibre: orders | Unknown |
| proof-ladder stage | listing_active_no_order_yet (unchanged; last known) |

## Honest Stop

**monitored_no_order_yet** — as last known. No new data; watch not restored.

## When DB Recovers

1. Run `p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`
2. If API is up: call `POST /api/orders/sync-marketplace` or use Orders page
3. Capture order count, internal orders, furthestStage from p50 output
