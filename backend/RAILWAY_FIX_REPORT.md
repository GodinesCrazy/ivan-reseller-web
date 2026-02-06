# Railway Fix Report

## Root Cause

Railway crashes were caused by:

1. **Healthcheck depending on DB** ? `/health` returned 503 until DB was ready, causing Railway to kill the container during bootstrap
2. **`process.exit(1)` on missing env** ? Missing JWT_SECRET, DATABASE_URL, etc. triggered immediate exit instead of degraded mode
3. **Migrate failure blocked start** ? `prisma migrate deploy && node dist/server.js` prevented the server from starting when migrations failed
4. **JWT_SECRET required at parse** ? Zod schema required JWT_SECRET before boot, failing on parse and exiting

## Files Changed

| File | Changes |
|------|---------|
| `package.json` | `start:with-migrations`: use `;` instead of `&&` so server starts even if migrate fails; add `test-railway-ready` script |
| `railway.json` | `buildCommand`, `startCommand`, `healthcheckPath` as specified |
| `server.ts` | Bootstrap env logs; remove `process.exit(1)` for missing env; add exit reason logs |
| `app.ts` | `/health`: always 200 if Express is running (no DB check); `/ready`: 200 only if DB connected, 503 otherwise |
| `env.ts` | JWT_SECRET optional at parse; on critical Zod errors, use fallback and avoid `process.exit()` |
| `tsconfig.json` | `outDir`: `./dist`, `rootDir`: `./src` |
| `scripts/test-railway-ready.ts` | New script to verify `/health`, `/ready`, and `test-platform-commission` |

## New Boot Flow

1. `dotenv/config` and env validation (no exit on missing vars)
2. Express app created, `/health` and `/ready` registered first
3. HTTP server created and listens on `PORT` / `0.0.0.0` immediately
4. After listen callback: heavy bootstrap (DB, Redis, migrations) in background via `setImmediate`
5. `/health` returns 200 as soon as Express is up
6. `/ready` returns 200 only after DB connection is ready

## How to Deploy on Railway

1. **Build Command:** `npm install && npm run build`
2. **Start Command:** `npm run start:with-migrations`
3. **Healthcheck Path:** `/health`

Railway healthchecks `/health` and gets 200 once Express is listening. DB and migrations run afterward.

## Required Env Vars

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | PostgreSQL URL |
| `JWT_SECRET` | Yes | Min 32 chars; auth disabled if missing |
| `ENCRYPTION_KEY` | Optional | Falls back to JWT_SECRET if 32+ chars |
| `PORT` | Auto | Set by Railway |
| `REDIS_URL` | Optional | Defaults to localhost |
| `INTERNAL_RUN_SECRET` | Optional | For `/api/internal/*` and `test-railway-ready` |

If vars are missing, the server still starts in degraded mode. No `process.exit()` during boot.
