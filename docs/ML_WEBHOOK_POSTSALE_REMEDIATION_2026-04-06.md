# ML Webhook/Post-sale Remediation (2026-04-06)

## Current evidence (production)
- `GET https://ivan-reseller-backend-production.up.railway.app/api/webhooks/status`
  - `mercadolibre.configured=false`
  - `mercadolibre.eventFlowReady=false`
  - `mercadolibre.inboundEventSeen=false`
- DB evidence (`scripts/check-ml-webhook-proof-state.ts`):
  - `mercado_libre_webhook_events`: **0 rows**
  - `system_configs.key=webhook_event_proof:mercadolibre`: **absent**

## Exact root causes
1. **Secret not configured in runtime**
   - `webhook-readiness.service.ts` sets `mercadolibre.configured` from `WEBHOOK_SECRET_MERCADOLIBRE`.
   - Without this env var, readiness can never become configured.
2. **No inbound webhook evidence persisted**
   - No webhook ledger rows and no proof row in `system_configs`, so `eventFlowReady` remains false.
3. **Integration fragility before fix**
   - Signature validation depended on re-serialized JSON body, not guaranteed raw payload bytes.
   - Shared-secret missing path accepted webhook in production instead of hard-failing.

## Minimal fixes implemented (repo)
- `backend/src/app.ts`
  - Captures `rawBody` in `express.json(...verify)` for deterministic HMAC verification.
- `backend/src/middleware/webhook-signature.middleware.ts`
  - Hardened Mercado Libre signature parsing (`sha256=` and `v1=` token support).
  - In production, rejects shared-secret webhooks when secret is missing (`503 webhook_secret_missing`).
  - Exposes runtime flag `req.webhookSignatureVerified`.
- `backend/src/api/routes/webhooks.routes.ts`
  - Records Mercado Libre webhook proof at ingestion/queue stage using `req.webhookSignatureVerified`.
  - Records proof on duplicate inbound events as well.
- `backend/src/services/webhook-event-proof.service.ts`
  - Fixes proof level semantics when event is inbound but not cryptographically verified.
- `backend/src/services/mercadolibre-webhook-async.service.ts`
  - Uses runtime secret presence to mark `verified` instead of unconditional `true`.
- New diagnostics scripts:
  - `backend/scripts/check-ml-webhook-proof-state.ts`
  - `backend/scripts/check-ml-webhook-readiness.ts`

## External configuration required (exact)
These steps are **mandatory** outside the repo.

1. **Set Railway env vars in backend service**
   - Service: `ivan-reseller-backend`
   - Environment: `production`
   - Required:
     - `WEBHOOK_SECRET_MERCADOLIBRE=<strong-random-secret>`
     - `WEBHOOK_VERIFY_SIGNATURE=true`
     - `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true`
     - `ML_WEBHOOK_REQUIRE_ASYNC_QUEUE=true` (recommended strict production)
     - `SAFE_BOOT=false`
     - `REDIS_URL=<railway-redis-url>`
2. **Command examples**
   - `railway variable set WEBHOOK_SECRET_MERCADOLIBRE=<SECRET> -s ivan-reseller-backend -e production`
   - `railway variable set WEBHOOK_VERIFY_SIGNATURE=true WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true -s ivan-reseller-backend -e production`
   - `railway variable set ML_WEBHOOK_REQUIRE_ASYNC_QUEUE=true SAFE_BOOT=false -s ivan-reseller-backend -e production`
3. **Mercado Libre developer app**
   - App notifications URL:
     - `https://ivan-reseller-backend-production.up.railway.app/api/webhooks/mercadolibre`
   - Secret in ML app notification config must match `WEBHOOK_SECRET_MERCADOLIBRE`.

## Verification procedure (after deploy + external config)
1. Deploy backend with this remediation.
2. Validate status baseline:
   - `GET /api/webhooks/status` -> `mercadolibre.configured=true`
3. Trigger **real inbound event** from ML (controlled purchase/order update on real listing).
4. Re-check:
   - `GET /api/webhooks/status` -> `mercadolibre.inboundEventSeen=true`, `eventFlowReady=true`
   - DB:
     - `mercado_libre_webhook_events` has new rows (`received/queued/processed`)
     - `system_configs.webhook_event_proof:mercadolibre` exists with `inboundEventSeen=true`
5. Re-run candidate preflight (`productId=32714`) and verify postsale warnings are cleared or reduced to non-blocking expected warnings.

## Decision status (this snapshot)
- Candidate publication gate (`32714`): still `ready_to_publish`.
- ML webhook/post-sale automation gate: **NO-GO** until the external config + real inbound event evidence are completed.

