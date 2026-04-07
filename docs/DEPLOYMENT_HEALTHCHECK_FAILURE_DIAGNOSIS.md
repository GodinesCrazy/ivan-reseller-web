# Diagnosis: Deployment Healthcheck Failure

Date: 2026-03-24  
Log: logs.1774328427839.log

## Summary

**Build:** OK — Docker build, npm ci, tsc, Prisma generate completed.  
**Healthcheck:** FAIL — `/health` never returned 200; all 21 attempts "service unavailable" over ~12 minutes.

## What Happened

1. Image built and pushed to Railway registry
2. Container started (implied by "Starting Healthcheck")
3. Healthcheck path: `/health`, timeout: 720s (12 min)
4. Every attempt: "service unavailable"
5. Result: "1/1 replicas never became healthy" → deployment failed

## Likely Causes

### 1. Process crash during startup (most likely)

The bootstrap (`server-bootstrap.js`) starts a minimal HTTP server and responds 200 to `/health`. Then it loads the full server (`require('./server')`). If the full server crashes or exits during load, the process dies and healthchecks fail.

**Possible triggers:**
- `validateJwtSecret()` — no longer exits, but worth confirming
- `envSchema.parse()` — can throw; env has fallbacks
- DB connection — "too many clients" could cause Prisma to fail; `connectWithRetry` might hang or throw
- Redis connection — lazy; unlikely to block bootstrap
- Missing/invalid env vars — e.g. `ENCRYPTION_KEY` (needs 32+ chars)

### 2. Database connection exhaustion

From P59/P60: Postgres is saturated ("too many clients"). When the new replica starts, it competes for connections. If Prisma can't connect, startup may fail or hang.

**Action:** Set `PRISMA_CONNECTION_LIMIT=8` on the Railway backend service to reduce pool size and avoid saturating Postgres.

### 3. Port binding

Railway injects `PORT`. The app uses `process.env.PORT || 4000` and listens on `0.0.0.0`. Unlikely to be wrong, but ensure no hardcoded port overrides `PORT`.

### 4. Memory / OOM

Heavy dependencies (Puppeteer, Chromium) can cause OOM on small instances. Check Railway metrics for memory usage. If the process is killed by OOM, it would stop before healthchecks succeed.

## Diagnostic Steps

1. **Railway logs**
   - Open the failed deployment → Logs
   - Look for `[BOOT] Health listening on port` — if present, the bootstrap started
   - Look for `❌`, `ERROR`, `FATAL`, `process.exit`, `SIGKILL`, `OOM`

2. **Env vars**
   - `JWT_SECRET`: 32+ chars
   - `ENCRYPTION_KEY`: 32+ chars (or 64 for hex)
   - `DATABASE_URL`: valid Postgres URL
   - `PORT`: Railway sets this; do not override unless intended
   - `PRISMA_CONNECTION_LIMIT`: set to 8 to reduce DB pressure

3. **DB connections**
   - If Postgres is exhausted, the new replica can't connect
   - Set `PRISMA_CONNECTION_LIMIT=8` on backend
   - Restart the service to free old connections before redeploying

## Recommended Fixes

1. **Set PRISMA_CONNECTION_LIMIT**
   - Railway Dashboard → Backend service → Variables
   - Add `PRISMA_CONNECTION_LIMIT=8`
   - Redeploy

2. **Use start:with-migrations for first deploy**
   - If migrations are required, use `prisma migrate deploy && node dist/server-bootstrap.js`
   - Or keep `npm run start` if migrations are already applied

3. **Verify env vars**
   - JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL must be set and valid

4. **Check logs after redeploy**
   - Confirm `[BOOT] Health listening on port` appears
   - Confirm no immediate crash after "Loading server..."
