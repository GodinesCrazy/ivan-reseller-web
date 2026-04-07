# Phase 3A — Mercado Libre Chile International Pilot Runbook

## Objetivo
Ejecutar 1 publicacion internacional controlada en MLC con evidencia verificable, sin abrir rollout masivo.

## Pre-checklist (GO / NO-GO)
1. `programVerification.verified=true` y `programResolved` en `foreign_seller_verified` o `international_candidate` con confirmacion manual.
2. `requestedMode=international` y `publishIntent=pilot` en preflight canónico.
3. `internationalReadiness.allowed=true`.
4. `complianceReadiness.status=pass` (no `review_required` / `blocked`).
5. `returnsReadiness.ready=true` y `communicationReadiness.communicationReady=true`.
6. `pilotReadiness.pilotAllowed=true`.
7. `pilotReadiness.evidence.securityFlags.activeMercadoLibrePublications < maxActivePilotPublications`.
8. Redis/queues/workers/eventFlow en estado ready.
9. Evidencia externa reciente de cuenta (verificacion < 24h).
10. Confirmacion manual registrada cuando aplique (`pilotManualAck=true`).
11. Existe `PilotLaunchApproval` persistente valido (decision=`approved`, no expirado, no consumido).
12. La categoria del SKU esta en `PilotCategoryAllowlist` para `marketplace=mercadolibre` + `siteId=MLC`.
13. No existe `PilotControlState` bloqueante (`aborted`, `rollback_requested`, `rollback_completed`).

## Ejecucion segura
1. Consultar verificacion de cuenta:
   - `GET /api/marketplace/mercadolibre/program-verification?requestedMode=international`
2. Crear/validar approval persistente:
   - `POST /api/marketplace/mercadolibre/pilot-approvals`
   - `GET /api/marketplace/mercadolibre/pilot-approvals?productId=:id`
3. Confirmar allowlist de categoria:
   - `GET /api/marketplace/mercadolibre/pilot-category-allowlist?siteId=MLC`
   - `PUT /api/marketplace/mercadolibre/pilot-category-allowlist/:categoryKey` (si falta habilitacion)
2. Ejecutar dry-run obligatorio (no publica):
   - `GET /api/products/:id/publish-preflight?marketplace=mercadolibre&requestedMode=international&publishIntent=dry_run`
3. Evaluar readiness de piloto:
   - `GET /api/products/:id/publish-preflight?marketplace=mercadolibre&requestedMode=international&publishIntent=pilot&pilotManualAck=true`
4. Si GO, ejecutar aprobacion piloto controlada:
   - `POST /api/publisher/approve/:id` con `marketplaces:["mercadolibre"]`, `publishMode:"international"`, `publishIntent:"pilot"`, `pilotManualAck:true`.
5. Verificar que el intento quedo en ledger:
   - `GET /api/marketplace/mercadolibre/pilot-ledger?productId=:id`
6. Monitorear post-publicacion minima:
   - `GET /api/marketplace/mercadolibre/pilot-post-publish/:id`

## Rollback / Abort
1. Marcar estado de control del piloto:
   - `POST /api/marketplace/mercadolibre/pilot-control/:id` con `state=aborted` o `rollback_requested`.
2. Si el listing queda activo con riesgo operativo o de policy: pausar/cerrar inmediatamente en ML.
3. Verificar ledger de abort/rollback:
   - `GET /api/marketplace/mercadolibre/pilot-ledger?productId=:id`
4. Congelar nuevos pilotos (`mlPilotModeEnabled=false`) hasta analisis.
5. Re-ejecutar dry-run antes de cualquier reintento.

## Evidencia minima a guardar
1. Snapshot de `programVerification` y `pilotReadiness` (JSON completo).
2. `preflight.blockers/warnings/nextAction` previos al publish.
3. Request usado (`publishIntent`, `requestedMode`, `pilotManualAck`).
4. Resultado de publicacion (listing id/url o error).
5. Verificacion post-publicacion (estado listing, moderacion, shipping truth).
6. `approvalId` consumido y timestamp `consumedAt`.
7. Snapshot de allowlist (categoryKey, enabled, notes).
8. Estado de control (`ready/aborted/rollback_*`) y razon.
9. Ledger final con resultado (`assessment_only|blocked|enqueued|published|aborted|failed|rollback_*`).

## Criterio NO-GO inmediato
- `programResolved` en `unknown`, `blocked` o `local` para intento internacional.
- `complianceReadiness.status != pass`.
- `pilotReadiness.pilotAllowed=false`.
- workers/event flow no listos.
- evidencia externa ausente o stale.
