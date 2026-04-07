# P59 — DB Stability Hardening

Date: 2026-03-24  
Sprint: P59 — Listing Stability Recovery

## Objective

Reduce DB client exhaustion risk so monitoring scripts can run reliably.

## Changes Applied

### 1. Scripts Use Shared Prisma

**Before:** Each script created `new PrismaClient()`, doubling pool usage when services (using config prisma) were also loaded.

**After:** Scripts import `prisma` from `../src/config/database`:

| File | Change |
|------|--------|
| `scripts/p50-monitor-ml-controlled-sale.ts` | `import { prisma } from '../src/config/database'`; removed `new PrismaClient()` |
| `scripts/check-ml-chile-controlled-operation-readiness.ts` | Same |
| `scripts/p49-reactivate-ml-listing.ts` | Same |

**Effect:** One connection pool per process instead of two when scripts load marketplace/credentials services.

### 2. Env Documentation

**File:** `backend/env.local.example`

Added:
```
# Cap DB connections (avoids "too many clients" on shared Postgres, e.g. Railway). See database.ts.
# PRISMA_CONNECTION_LIMIT=8
```

**Action for operator:** Set `PRISMA_CONNECTION_LIMIT=8` (or lower) in production/env when using Railway or other low-connection Postgres.

### 3. Disconnect Patterns

Scripts already use `finally` with `prisma.$disconnect()`. No change needed. Shared prisma disconnect is correct for script exit.

## Unchanged (Existing Safeguards)

- `database.ts` already supports `PRISMA_CONNECTION_LIMIT` via `getEffectiveDatabaseUrl()`
- Server and config use singleton prisma
- RAILWAY_PRODUCTION_DEPLOY_VERIFICATION.md documents PRISMA_CONNECTION_LIMIT for deploy

## Operational Guidance

1. **When running monitoring scripts:** Stop or avoid running server, Prisma Studio, and other DB consumers simultaneously if connection limit is tight.
2. **Production:** Set `PRISMA_CONNECTION_LIMIT=8` (or 6–10) on API and any workers sharing the same DATABASE_URL.
3. **Scripts:** Run one at a time; they now share a single pool when using config prisma.

## Verification

- Backend `npm run type-check`: PASS
- Script changes: Applied
- Live run of p50-monitor: Still failed (DB already exhausted at run time; hardening reduces future risk)
