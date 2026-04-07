# ML Chile Controlled Purchase Closeout - 2026-04-07

## Evidence snapshot
- Production webhook status (`GET /api/webhooks/status`):
  - `mercadolibre.configured=false`
  - `mercadolibre.eventFlowReady=false`
  - `mercadolibre.inboundEventSeen=true`
  - `proofLevel=inbound-event-seen`
- DB proof state (`npx tsx scripts/check-ml-webhook-proof-state.ts` at 2026-04-07T01:28:53Z):
  - `mercado_libre_webhook_events`: no rows
  - `system_configs.webhook_event_proof:mercadolibre`: present (`inboundEventSeen=true`, `eventFlowReady=false`)
- Inbound probe sent to production webhook returns `200 {"success":true}` and now persists proof (`inbound-event-seen`).

## Root blockers still open
1. `WEBHOOK_SECRET_MERCADOLIBRE` is not configured in production runtime.
2. Inbound evidence exists, but not cryptographically verified (`verified=false`), so `eventFlowReady` remains false.
3. Railway CLI session is not authenticated in this environment (`railway whoami` => Unauthorized), so env/deploy cannot be applied directly from this session.

## What was executed directly in this run
- Revalidated production endpoints:
  - `/api/webhooks/status` => 200 (ML still false/false)
  - `/api/sales/pending-purchases` => 401 (exposed, not 404)
  - pilot endpoints => 401 (exposed, not 404)
- Re-ran webhook proof DB diagnostic.
- Sent controlled inbound probe to `/api/webhooks/mercadolibre`.
- Restored candidate product `32714` sale price to maintain publishability:
  - `suggestedPrice=14.2`, `finalPrice=14.2` (updated at `2026-04-07T00:16:04.732Z`).
- Re-ran preflight script; `p95-preflight.json` now shows:
  - `overallState=ready_to_publish`
  - `publishAllowed=true`
  - `blockers=[]`

## Exact external steps required (manual)
### 1) Railway authentication
- Run: `railway login`
- Verify: `railway whoami` returns your account (not Unauthorized).

### 2) Set backend production env vars
Service: `ivan-reseller-backend`  
Environment: `production`

Commands:
- `railway variable set WEBHOOK_SECRET_MERCADOLIBRE=<YOUR_STRONG_SECRET> -s ivan-reseller-backend -e production`
- `railway variable set WEBHOOK_VERIFY_SIGNATURE=true WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true -s ivan-reseller-backend -e production`
- `railway variable set ML_WEBHOOK_REQUIRE_ASYNC_QUEUE=true SAFE_BOOT=false -s ivan-reseller-backend -e production`
- `railway variable set REDIS_URL=<PRODUCTION_REDIS_URL> -s ivan-reseller-backend -e production`

### 3) Mercado Libre developer app notification config
- Field: Notifications/Webhook URL
  - Value: `https://ivan-reseller-backend-production.up.railway.app/api/webhooks/mercadolibre`
- Field: Shared secret / signature secret
  - Value: exact same string used in `WEBHOOK_SECRET_MERCADOLIBRE`.

### 4) Deploy backend
- Deploy updated backend release after env vars are set.
- Verify runtime commit/version:
  - `GET https://ivan-reseller-backend-production.up.railway.app/api/version`

## Post-deploy verification checklist
1. `GET /api/webhooks/status` must show `mercadolibre.configured=true`.
2. Trigger a real ML inbound event (controlled order/update).
3. Re-check `GET /api/webhooks/status` => `inboundEventSeen=true` and `eventFlowReady=true`.
4. Run `npx tsx backend/scripts/check-ml-webhook-proof-state.ts`:
   - ledger has rows
   - proof row exists
5. Confirm candidate preflight still:
   - `ready_to_publish`
   - `publishAllowed=true`
   - no blockers.

## Run snapshot (2026-04-07, second closeout pass from IDE)
- Railway CLI:
  - Installed: `railway 4.29.0`
  - Authenticated: **NO** (`railway whoami` => `Unauthorized`)
  - Token in env: **NO** (`RAILWAY_TOKEN` / `RAILWAY_API_TOKEN` absent)
  - Login attempt from this session: `railway login` and `railway login --browserless` both fail with `Cannot login in non-interactive mode`.
- Production endpoint revalidation (after git push deploy):
  - Runtime version: `sha=71bf20e`, `buildTime=2026-04-07T01:27:23`
  - `GET /api/webhooks/status` => `200` with `configured=false`, `eventFlowReady=false`, `inboundEventSeen=true`.
  - `GET /api/sales/pending-purchases` => `401` (exposed).
  - Pilot endpoints (`pilot-approvals`, `pilot-category-allowlist`, `pilot-ledger`, `pilot-control`, `pilot-post-publish`) => `401` (exposed).
- DB evidence revalidation:
  - `mercado_libre_webhook_events` remains empty.
  - `webhook_event_proof:mercadolibre` present with:
    - `inboundEventSeen=true`
    - `proofLevel=inbound-event-seen`
    - `eventFlowReady=false`
- Candidate `32714` was restored to publishable price baseline (`suggestedPrice=14.2`, `finalPrice=14.2`), and preflight artifact remains `ready_to_publish` with no blockers.

## Run snapshot (2026-04-07, final webhook closeout pass from Codex)

### What was done directly
- Confirmed Railway linkage and runtime metadata:
  - Project: `ivan-reseller`
  - Environment: `production`
  - Service: `ivan-reseller-backend`
  - Runtime commit: `47c852ef6b4c8db2dc03fd9f279a55465210010d` (`GET /api/version`)
- Confirmed Railway CLI auth limitation in this session:
  - `railway variable list -s ivan-reseller-backend -e production` => `Unauthorized. Please run railway login again.`
  - `railway login` / `railway login --browserless` => `Cannot login in non-interactive mode`
- Revalidated production webhook state and proof:
  - `GET /api/webhooks/status` => ML still `configured=false`, `verified=false`, `inboundEventSeen=true`, `eventFlowReady=false`
  - `npx tsx scripts/check-ml-webhook-readiness.ts --base-url=https://ivan-reseller-backend-production.up.railway.app`
    - `ledgerCounts=[]`, `latestEvents=[]`
    - `system_configs.webhook_event_proof:mercadolibre` updated (`proofLevel=inbound-event-seen`)
- Sent controlled probes to production webhook endpoint:
  - No signature => `200 {"success":true}`
  - Explicit invalid signature => `200 {"success":true}`
  - This confirms signature verification is effectively bypassed today in runtime config.
- Applied code fix locally (not deployed yet) to close false-success path:
  - File: `backend/src/api/routes/webhooks.routes.ts`
  - Mercado Libre webhook flow now enforces `persist ledger -> enqueue` (or explicit failure), returning:
    - duplicate ACK (`ok=true`, `duplicate=true`)
    - queue unavailable (`503`, `ok=false`, `error=queue_unavailable`)
    - ingest failure (`500`, `ok=false`, `error=ingest_failed`)
  - Validation:
    - `npm test -- backend/src/api/routes/__tests__/webhooks-mercadolibre-phase1.test.ts` => PASS (3/3)
    - `npm run type-check` => PASS

### Exact webhook target + secret to align now
- Notifications/Webhook URL (Mercado Libre app):
  - `https://ivan-reseller-backend-production.up.railway.app/api/webhooks/mercadolibre`
- Secret to use in both places (Railway + Mercado Libre app):
  - `BlZ10PysY7Wq4Scmj8pAD6irU1C4__w7UBWR3YQxAo5oNzXK3Ze-NzPqtQu5OMBT`

### Exact manual sequence (single external blocker: interactive Railway auth)
1. In an interactive terminal with browser access:
   - `railway login`
2. Set required vars in production backend:
   - `railway variable set WEBHOOK_SECRET_MERCADOLIBRE=BlZ10PysY7Wq4Scmj8pAD6irU1C4__w7UBWR3YQxAo5oNzXK3Ze-NzPqtQu5OMBT -s ivan-reseller-backend -e production`
   - `railway variable set WEBHOOK_VERIFY_SIGNATURE=true WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true -s ivan-reseller-backend -e production`
   - `railway variable set ML_WEBHOOK_REQUIRE_ASYNC_QUEUE=true SAFE_BOOT=false -s ivan-reseller-backend -e production`
   - `railway variable set 'REDIS_URL=${{Redis.REDIS_URL}}' -s ivan-reseller-backend -e production`
3. Verify vars:
   - `railway variable list -s ivan-reseller-backend -e production -k`
   - Must show:
     - `WEBHOOK_SECRET_MERCADOLIBRE=<same secret>`
     - `WEBHOOK_VERIFY_SIGNATURE=true`
     - `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true`
     - `ML_WEBHOOK_REQUIRE_ASYNC_QUEUE=true`
     - `SAFE_BOOT=false`
     - `REDIS_URL=redis://...` (not localhost)
4. Configure Mercado Libre app:
   - Portal: `https://developers.mercadolibre.com`
   - App -> Notifications
   - Set URL to `https://ivan-reseller-backend-production.up.railway.app/api/webhooks/mercadolibre`
   - Set shared secret exactly to `BlZ10PysY7Wq4Scmj8pAD6irU1C4__w7UBWR3YQxAo5oNzXK3Ze-NzPqtQu5OMBT`
5. Deploy backend update containing webhook fix:
   - `railway redeploy -s ivan-reseller-backend -y`
   - Or push latest `main` if GitHub auto-deploy is enabled.
6. Post-deploy checks:
   - `GET /api/version` should change commit hash.
   - `GET /api/webhooks/status` should show `mercadolibre.configured=true`.
   - Send one real signed ML notification (or a signed controlled event after secret alignment) and verify:
     - `verified=true`
     - `inboundEventSeen=true`
     - `eventFlowReady=true`
   - Re-run `npx tsx scripts/check-ml-webhook-readiness.ts --base-url=https://ivan-reseller-backend-production.up.railway.app`
     - `ledgerCounts` must include rows in `mercado_libre_webhook_events`
     - proof row must show `webhookVerified=true` and `eventFlowReady=true`

## Live update (2026-04-07T03:06Z)
- Railway login recovered:
  - `railway whoami` => authenticated.
- Vars applied in `ivan-reseller-backend` / `production`:
  - `WEBHOOK_SECRET_MERCADOLIBRE`
  - `WEBHOOK_VERIFY_SIGNATURE=true`
  - `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true`
  - `ML_WEBHOOK_REQUIRE_ASYNC_QUEUE=true`
  - `SAFE_BOOT=false`
  - `REDIS_URL` referenced to Railway Redis
- Redeploy executed:
  - deployment id `9e2b99cb-94e3-4dbc-a0b2-6b8662369dbc`
  - status `SUCCESS`
- Runtime checks:
  - invalid signature probe => `401` (rejected)
  - valid signed probe => `200`
  - `GET /api/webhooks/status` => `mercadolibre.configured=true`, `verified=true`, `inboundEventSeen=true`, `eventFlowReady=true`, `proofLevel=event-ready`
- DB evidence:
  - `system_configs.webhook_event_proof:mercadolibre` => present and updated with `webhookVerified=true`, `eventFlowReady=true`
  - `mercado_libre_webhook_events` => still empty in current runtime path
