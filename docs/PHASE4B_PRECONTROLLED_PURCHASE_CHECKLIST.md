# Phase 4B - Checklist Final Pre-Compra Controlada

## Objetivo
Ejecutar 1 compra real controlada con trazabilidad completa en UI y backend, sin operar a ciegas.

## 1) Precondiciones Técnicas (obligatorias)
- `frontend type-check` en PASS.
- `frontend build` en PASS.
- `backend build` en PASS.
- Webhook ML seguro activo (ledger + queue + idempotencia).
- Preflight canónico ML y guardas físicas habilitadas.
- Pilot approval persistente vigente para el candidato.
- Categoría del piloto en allowlist.

## 2) Precondiciones Operativas (obligatorias)
- Producto candidato con `publishIntent` explícito (`dry_run` o `pilot`).
- `requestedMode` y `modeResolved` coherentes.
- Blockers críticos en 0 para el candidato seleccionado.
- Runbook de abort/rollback conocido por operador.
- Evidencia de account/program verification reciente para ML.

## 3) Verificación UI antes de publicar
- `Products`: lifecycle canónico visible y consistente.
- `ProductPreview`: preflight/readiness/pilot/program verification visibles con blockers/warnings.
- `IntelligentPublisher`: fila pendiente muestra verdad operativa, lifecycle y guardas.
- `IntelligentPublisher` (listings): muestra lifecycle + `Order/Purchase/Tracking` evidence.
- `ControlCenter`: tabla `Listing -> Order -> Fulfillment Watch` visible.
- `Orders`: cada orden muestra trace `producto -> listing -> sync -> fulfillment`.

## 4) Flujo recomendado para compra controlada
1. Ejecutar `dry_run` en el producto candidato.
2. Revisar blockers/warnings/nextActions y evidence.
3. Confirmar approval persistente + allowlist + control state en `ready`.
4. Ejecutar `pilot` solo para 1 producto.
5. Verificar listing creado/moderación/estado activo.
6. Esperar orden entrante y validar `order ingested`.
7. Verificar avance de fulfillment (`pending -> in_progress -> proved`).
8. Confirmar tracking adjuntado y seguimiento post-publicación mínimo.

## 5) Criterio GO / NO-GO
### GO
- Sin blockers críticos en preflight/readiness/pilot.
- Approval válido no expirado.
- Allowlist válida para categoría.
- UI muestra trazabilidad completa en `IntelligentPublisher`, `Orders`, `ControlCenter`.

### NO-GO
- Frontend typecheck o builds fallan.
- Faltan approval/allowlist/control state.
- Bloqueadores críticos activos.
- No hay visibilidad de trace listing->order->fulfillment.

## 6) Abort / Rollback
- Marcar `aborted` o `rollback_requested` desde control de piloto.
- Registrar razón operativa y evidencia.
- Bloquear nuevos avances del mismo candidato hasta reconciliación.
- Revisar ledger de intento y estado post-publicación antes de reintentar.
