# P58 Execution Report

Date: 2026-03-24  
Sprint: P58 — Controlled Commercial Proof Path

## Objective

Resume the controlled commercial path and capture the first real MercadoLibre buyer order, or leave the system in a clean monitored state with exact operational watch instructions.

## Outcome

**B.** System left in clean monitored state. No real buyer order; no supplier purchase attempted. Exact operational watch instructions documented.

## Commands Run

| Command | Result |
|---------|--------|
| `backend npm run type-check` | PASS |
| `npx tsx scripts/check-ml-chile-controlled-operation-readiness.ts 1` | FAIL — DB connection limit (too many clients) |
| `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` | FAIL — DB connection limit (too many clients) |

## Section Status

| Section | Status | Notes |
|---------|--------|-------|
| Controlled Listing Status Recheck | PARTIAL | Last known: under_review/waiting_for_patch (P50). Live recheck blocked. |
| First Order Watch | DONE | Path documented; no order; monitored_no_order_yet |
| Supplier Purchase Attempt | PARTIAL | Not attempted (no order). Path and blocker taxonomy documented. |
| Proof Ladder Progression | DONE | Stage: listing_active_no_order_yet |
| Lightweight UI Watchlist | DONE | No new blockers |

## Real Proof

### Controlled listing state

- listingId=MLC3786354420, productId=32690
- Last live (P50): under_review, sub_status=["waiting_for_patch"]
- Public permalink: HTTP 200
- Local: PUBLISHED, isPublished=true

### Order result

- None. monitored_no_order_yet.

### Supplier purchase result

- Not attempted (no order).

### Furthest proof-ladder stage

- `listing_active_no_order_yet`

## Remaining Blockers

1. **Listing review state:** MercadoLibre listing drifted to under_review / waiting_for_patch. Needs resolution before full sellability.
2. **DB connection limit:** PostgreSQL "too many clients" blocked live script execution. May indicate pool exhaustion from other processes; operator should run scripts when DB is less loaded.
3. **No buyer order:** No real order to progress the commercial path.

## Operational Watch Instructions

1. Resolve or clear `waiting_for_patch` on MLC3786354420.
2. Periodically run `POST /api/orders/sync-marketplace` (or use Orders page sync).
3. When DB is available, run `p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` to capture current state.
4. If order appears: fulfillment auto-triggers; capture aliexpressOrderId, blocker if any.
5. Manual backstops: `POST /api/orders/:id/mark-manual-purchased`, `POST /api/orders/:id/submit-tracking`.

## Next Step

**Highest-leverage:** Resolve MercadoLibre `waiting_for_patch` review state on MLC3786354420 so the listing is active_and_sellable, then continue monitored order polling via sync-marketplace until the first real buyer order appears.
