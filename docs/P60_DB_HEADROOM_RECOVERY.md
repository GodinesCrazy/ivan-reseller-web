# P60 — DB Headroom Recovery

Date: 2026-03-24  
Sprint: P60 — Runtime Recovery + Listing Stability

## Objective

Recover PostgreSQL connection headroom so live monitoring scripts can run.

## DB Consumers Inspected

| Consumer | Location | Status |
|----------|----------|--------|
| Local terminals | Workspace | type-check, vitest — both completed; no long-running server |
| Railway production API | Remote | Likely running; uses DATABASE_URL; PRISMA_CONNECTION_LIMIT not confirmed in deploy |
| Prisma Studio | Unknown | Not detected in workspace |
| Workers / cron | Railway | Possible; not inspected |
| Scripts (p50, p49, check-ml) | Local | Use shared prisma; run on-demand |

## Actions Taken

1. **Minimal connectivity test:** Created `scripts/p60-db-connectivity-test.ts` — uses `connection_limit=1`, runs `SELECT 1`.
2. **Test result:** FAIL — `FATAL: sorry, too many clients already` even with single-connection attempt.
3. **p50-monitor with PRISMA_CONNECTION_LIMIT=3:** FAIL — same error.
4. **Conclusion:** Postgres server (Railway) has zero available connection slots. Saturation is on the server side, not local.

## Root Cause

- **Railway Postgres** (yamabiko.proxy.rlwy.net) is at or over `max_connections`.
- Consumers are likely: deployed API (default pool ~10), possibly workers/cron, previous script runs or stale connections.
- `PRISMA_CONNECTION_LIMIT` on the **production API** (Railway env) is likely not set; default pool uses more connections.
- Local scripts cannot "free" remote connections; only remote consumers or server config can.

## Classification

**db_headroom_not_restored**

- No headroom recovered.
- Cannot run any DB-dependent script (p50, p49, check-ml) until connections are freed.

## Required Operator Actions

1. **Railway dashboard:** Set `PRISMA_CONNECTION_LIMIT=8` on the backend service so the API uses fewer connections.
2. **Restart API:** Restart the Railway backend to drop existing connections and apply the new limit.
3. **Or:** Temporarily stop the API so scripts can run (not recommended for production).
4. **Or:** Upgrade Railway Postgres plan for higher `max_connections`.
5. **After headroom:** Re-run `npx tsx scripts/p60-db-connectivity-test.ts` to verify; then run p50-monitor.
