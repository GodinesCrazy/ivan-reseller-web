# P59 — Live Commercial Watch Recovery

Date: 2026-03-24  
Sprint: P59 — Listing Stability Recovery

## Objective

After listing and DB stabilization, restore the ability to monitor the controlled commercial path.

## P59 Recovery Attempt

**Commands run:**
- `npm run type-check` — PASS
- `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` — FAIL (too many clients)

**Result:** Live monitoring was **not** restored in this sprint due to persistent Postgres connection exhaustion.

## DB Hardening Applied

- Scripts now use shared prisma (see P59_DB_STABILITY_HARDENING.md)
- This reduces connection usage when scripts run; does not fix an already-exhausted pool

## Conditions for Recovery

1. **DB capacity:** Postgres must have available connections. Operator should:
   - Stop server, Prisma Studio, and other DB consumers
   - Or set PRISMA_CONNECTION_LIMIT on server to free headroom
   - Or wait for idle connections to time out

2. **Re-run monitor:**
   ```
   npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420
   ```

3. **If listing still under_review:** Run reactivation first:
   ```
   npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
   ```

## Expected Outcomes When Recovery Succeeds

| Outcome | Meaning |
|---------|---------|
| monitored_no_order_yet | Listing state captured; no order; continue polling |
| order_ingested | Order exists; proceed to supplier purchase |
| supplier_purchase_* | Further along proof ladder |

## Watch Instructions (when no order exists)

1. Run `p50-monitor-ml-controlled-sale` to capture current listing state and order count
2. Call `POST /api/orders/sync-marketplace` (or use Orders page) to pull new ML orders
3. Check Control Center and Sales for proof ladder
4. If order appears: fulfillment auto-triggers; capture aliexpressOrderId or blocker

## Current Proof-Ladder Stage

**listing_active_no_order_yet** (unchanged; no new data)
