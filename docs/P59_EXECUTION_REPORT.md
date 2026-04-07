# P59 Execution Report

Date: 2026-03-24  
Sprint: P59 — Listing Stability Recovery + Runtime DB Stability

## Objective

Stabilize (1) listing sellability and (2) runtime observability. Only after that resume the first real buyer-order proof path.

## Outcome

**B.** Exact remaining blockers isolated. Listing recovery and DB hardening prepared; live execution blocked by Postgres connection exhaustion.

## Section Status

| Section | Status | Notes |
|---------|--------|-------|
| ML Listing Drift Audit | PARTIAL | No fresh API state (DB blocked); last known: under_review/waiting_for_patch |
| Waiting_for_patch Recovery | PARTIAL | Path documented; p49 script exists; execution blocked |
| Postgres Connection Exhaustion Audit | DONE | Cause: multiple PrismaClient pools exceeding max_connections |
| DB Stability Hardening | DONE | Scripts use shared prisma; env doc added |
| Live Commercial Watch Recovery | FAILED | Monitor still fails; DB exhausted |

## Commands Run

| Command | Result |
|---------|--------|
| `npm run type-check` | PASS |
| `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` | FAIL — too many clients |
| Permalink fetch | HTTP 200 |

## Real Proof

### Exact current listing state

- **From API:** Unknown — live check blocked.
- **Last known (P50):** under_review, sub_status=["waiting_for_patch"]
- **Permalink:** HTTP 200

### Whether waiting_for_patch was cleared

- **No.** No recovery script was run (DB blocked). P49 script is ready for re-run when DB is available.

### Exact DB connection issue found

- Multiple PrismaClient instances: scripts created own client + services used config client = 2 pools per script run.
- Total connections exceeded Postgres max_connections (Railway).
- PRISMA_CONNECTION_LIMIT not set; default pool size per client ~10.

### Whether live monitoring was restored

- **No.** p50-monitor still fails with "too many clients".

### Exact current proof-ladder stage

- **listing_active_no_order_yet** (unchanged)

## Hardening Delivered

1. **p50-monitor-ml-controlled-sale.ts:** Uses shared prisma from config
2. **check-ml-chile-controlled-operation-readiness.ts:** Uses shared prisma
3. **p49-reactivate-ml-listing.ts:** Uses shared prisma
4. **env.local.example:** PRISMA_CONNECTION_LIMIT documented

## Remaining Blockers

1. **Postgres connection exhaustion:** Pool still exhausted; operator must free connections (stop server/Studio, set PRISMA_CONNECTION_LIMIT, or wait for timeout).
2. **Listing under_review:** Last known state; requires p49 reactivation when DB available.
3. **No live commercial watch:** Monitoring scripts cannot run until DB has capacity.

## Next Step

**Highest-leverage:** Free Postgres connections (stop API server and other DB consumers, or set PRISMA_CONNECTION_LIMIT=8 on server). Then run `p49-reactivate-ml-listing.ts 32690 MLC3786354420` to clear waiting_for_patch, followed by `p50-monitor-ml-controlled-sale.ts` to confirm listing state and order watch.
