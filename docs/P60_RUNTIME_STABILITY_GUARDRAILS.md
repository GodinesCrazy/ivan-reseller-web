# P60 — Runtime Stability Guardrails

Date: 2026-03-24  
Sprint: P60 — Runtime Recovery + Listing Stability

## Objective

Document the exact runtime guardrails required to avoid recurrence of Postgres connection exhaustion.

## Guardrails (Grounded)

### 1. Connection Limits

| Component | Requirement |
|-----------|-------------|
| Railway backend API | Set `PRISMA_CONNECTION_LIMIT=8` (or 6–10) in Railway env vars |
| Any worker/cron sharing DATABASE_URL | Set `PRISMA_CONNECTION_LIMIT=6` (or lower) |
| Local scripts | Inherit from env; use `PRISMA_CONNECTION_LIMIT=3` when running scripts if API is also connected |

**Rationale:** Railway Postgres (free/hobby) typically has `max_connections=20`. API (10) + script (10) = 20, at limit. Capping both leaves headroom.

### 2. One-Script-at-a-Time Guidance

- Run only one monitoring script (p50, p49, check-ml) at a time.
- Scripts use shared prisma and disconnect on exit; parallel runs = multiple processes = multiple pools.
- Do not run p50 while p49 is running, or while Prisma Studio is open.

### 3. Server / Studio Concurrency Guidance

| Scenario | Guidance |
|----------|----------|
| Running monitoring scripts locally | Prefer API stopped, or ensure PRISMA_CONNECTION_LIMIT on API is low (6–8) |
| Prisma Studio | Avoid running Studio when scripts need to run; Studio holds connections |
| API + script | Possible if both use capped limits and total < max_connections |

### 4. Worker / API Env Alignment

- All services using the same `DATABASE_URL` must set `PRISMA_CONNECTION_LIMIT`.
- Document in deploy checklist (see RAILWAY_PRODUCTION_DEPLOY_VERIFICATION.md).
- Restart services after changing env to apply new pool size.

### 5. Diagnostic Script

- `scripts/p60-db-connectivity-test.ts` — minimal `SELECT 1` with `connection_limit=1`
- Run before heavy scripts to verify headroom: `PRISMA_CONNECTION_LIMIT=1 npx tsx scripts/p60-db-connectivity-test.ts`
- If it fails, do not run p50/p49 until headroom is restored.

## Implementation Checklist

- [ ] Set `PRISMA_CONNECTION_LIMIT=8` on Railway backend service
- [ ] Restart Railway backend to apply
- [ ] Add to deploy/runbook: "Before running p50/p49, ensure DB connectivity test passes"
- [ ] Document in RAILWAY_PRODUCTION_DEPLOY_VERIFICATION.md if not already present
