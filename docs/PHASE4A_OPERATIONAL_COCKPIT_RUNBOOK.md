# Phase 4A Operational Cockpit Runbook

## Objetivo
Operar una publicación controlada (especialmente MLC pilot) desde UI con estado canónico, sin depender de supuestos.

## Superficies clave
- `Products`:
  - Ahora muestra un único `Lifecycle canónico` por fila.
  - Expone blocker principal y evita doble lectura `status + truth`.
- `ProductPreview` (Mercado Libre):
  - Cockpit operativo con:
    - `requestedMode`, `publishIntent`, `pilotManualAck`
    - `publishAllowed`, `overallState`, `channelCapability`, `modeResolved`
    - readiness: compliance / returns / communication
    - program verification, pilot readiness, approvals, ledger, post-publish
    - control state (`ready`, `aborted`, `rollback_requested`, `rollback_completed`)
- `IntelligentPublisher`:
  - Por producto pendiente: selección explícita de `publishMode`, `publishIntent`, `pilotManualAck`.
  - `dry_run` permitido para diagnóstico controlado incluso si hay blocker operativo.

## Flujo recomendado para prueba real controlada
1. Abrir `Products` y elegir candidato con lifecycle más cercano a `Ready`.
2. Entrar a `ProductPreview` (ML) y ajustar:
   - `requestedMode = international` (si aplica piloto internacional)
   - `publishIntent = pilot` o `dry_run`
3. Revisar blockers/warnings del cockpit:
   - si `publishAllowed=false`, no avanzar a publicación real.
4. Validar en cockpit:
   - `program verification` coherente
   - `pilot readiness` sin blockers críticos
   - `control state = ready`
5. Enviar a `IntelligentPublisher`.
6. Aprobar con parámetros explícitos en la fila:
   - marketplaces
   - `publishMode`
   - `publishIntent`
   - `pilotManualAck` cuando corresponda
7. Revisar `pilot ledger` y `post-publish` para evidencia y seguimiento.
8. Si aparece inconsistencia grave:
   - usar control state `aborted` o `rollback_requested`.

## Railway / deploy checklist mínimo
- Backend service:
  - build: `npm ci && npm run build`
  - start: `npm run start`
  - healthcheck: `/health`
- Frontend service:
  - build: `npm ci && npm run build`
  - start: `npm run start`
  - definir `VITE_API_URL` si frontend y backend no comparten origin/proxy.
- Variables operativas:
  - backend: DB/Redis/credenciales ML
  - frontend: `VITE_API_URL` (si aplica), `VITE_SOCKET_URL` (si aplica)

## Criterio operativo rápido (GO / NO-GO)
- GO:
  - `publishAllowed=true`
  - sin blockers críticos en readiness/pilot
  - approval y allowlist coherentes
  - control state `ready`
- NO-GO:
  - `publishAllowed=false`
  - blocker de compliance/returns/communication
  - approval faltante/expirado
  - control state en `aborted` o `rollback_*`
