# P59 — Postgres Connection Exhaustion Audit

Date: 2026-03-24  
Sprint: P59 — Listing Stability Recovery

## Objective

Find why live scripts hit "too many clients already".

## Error Observed

```
FATAL: sorry, too many clients already
PrismaClientInitializationError: Invalid `prisma.product.findUnique()` invocation
```

## DB Client/Pool Configuration

### Config (backend/src/config/database.ts)

- **Shared prisma:** Singleton `PrismaClient` via `globalForPrisma` (dev) or fresh (production)
- **Connection limit:** Optional `PRISMA_CONNECTION_LIMIT` env appends `?connection_limit=N` to DATABASE_URL
- **Default:** If not set, Prisma uses default pool size (~10–13 connections per client)

### Scripts Audited

| Script | Before P59 | After P59 | Disconnect |
|--------|------------|-----------|------------|
| p50-monitor-ml-controlled-sale | `new PrismaClient()` | `prisma` from config | finally |
| check-ml-chile-controlled-operation | `new PrismaClient()` | `prisma` from config | finally |
| p49-reactivate-ml-listing | `new PrismaClient()` | `prisma` from config | finally |

### Root Cause: Multiple PrismaClient Instances

**Before hardening:** Each script created its own `new PrismaClient()`. Each PrismaClient opens its own connection pool (default ~10 connections). Additionally:

- Scripts import services (MarketplaceService, etc.) that use `prisma` from config
- Config prisma = another pool
- **Effect:** 1 script run = 2 pools = ~20 connections
- Railway Postgres often has `max_connections=20` on free tier
- If server (API) is also running = additional pool = over limit

### Other Contributing Factors

| Factor | Impact |
|--------|--------|
| Server running | API holds ~10 connections from shared prisma |
| Prisma Studio | If open, additional pool |
| Multiple script runs in parallel | Each added a full pool |
| No PRISMA_CONNECTION_LIMIT | Default pool size not capped |
| Leaked clients | Unlikely if scripts use finally/$disconnect; but early exit without disconnect could leak |

### Environment

- **Database:** Railway Postgres (yamabiko.proxy.rlwy.net)
- **Connection limit:** Not explicitly set in env; Postgres server limit unknown but "too many clients" indicates limit reached

## Classification

**Exact cause:** Multiple PrismaClient instances (scripts + config) consuming combined pool capacity, exceeding Postgres max_connections. No single leak identified; aggregate usage.

## Recommendations (see P59_DB_STABILITY_HARDENING.md)

1. Scripts use shared prisma from config — **DONE**
2. Set PRISMA_CONNECTION_LIMIT on all services sharing DATABASE_URL
3. Ensure no long-running processes (server, Studio) when running monitoring scripts, or increase Postgres connections
