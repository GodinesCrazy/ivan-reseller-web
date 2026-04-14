# CJ postventa global — Runbook corto

## Activar pago controlado (CJ `payBalance`)

1. **Entorno**: `CJ_PHASE_D_ALLOW_PAY=true` solo en despliegue donde se acepte cargo real.
2. **API**: `POST /api/orders/:id/supplier/pay` con cuerpo JSON:
   ```json
   { "executePay": true }
   ```
3. Sin `executePay: true`, la API **no** llama a `payBalance` (solo eligibilidad / audit).
4. **Dry-run** (sin cargo):
   ```json
   { "dryRun": true }
   ```
5. Revisar `supplierMetadata.cj.payAudit` en el `Order` para outcome (`payment_success`, `payment_blocked_guardrail`, `payment_unsafe_to_execute`, etc.).

### Guardrails opcionales (recomendado en producción)

- `CJ_PAY_ORDER_ID_ALLOWLIST` — lista de `Order.id` permitidos para pagar (si está vacío, no restringe por id).
- `CJ_PAY_MAX_ORDER_USD` — rechaza si el precio del pedido supera el techo.
- `CJ_PAY_REQUIRE_CONFIRM_TOKEN=true` + `CJ_PAY_CONFIRM_TOKEN` — la API debe enviar el mismo valor en `payConfirmToken` en el JSON.

Ejemplo de cuerpo con confirmación:

```json
{ "executePay": true, "payConfirmToken": "<valor del secreto de despliegue>" }
```

### Comprobar política sin pagar (read-only)

```bash
cd backend
# cmd: set CJ_PAY_CHECK_ORDER_ID=<cuid>
# PowerShell: $env:CJ_PAY_CHECK_ORDER_ID="<cuid>"
npm run cj-pay:guardrails-check
```

Opcional: `CJ_PAY_CHECK_CONFIRM_TOKEN` para validar el token contra `evaluateCjPayConfirmToken`.

## Ejecutar sync manual (status + tracking)

- **Script** (no requiere worker Redis en el mismo proceso):
  ```bash
  cd backend && npm run supplier-postsale:sync-once
  ```
- Con **BullMQ**: asegurar `REDIS_URL` y que el proceso de API/bootstrap haya iniciado `ScheduledTasksService` (cola `supplier-postsale-sync`).

## Revisar jobs fallidos

- Redis/BullMQ: inspeccionar cola `supplier-postsale-sync` en Redis Insight o CLI (nombre de job repetido: `supplier-postsale-sync-job`).
- Logs: buscar `[SUPPLIER-POSTSALE-SYNC] order sync failed` o `Scheduled Tasks: supplier post-sale sync job failed`.
- Reintentos: `SUPPLIER_POSTSALE_JOB_ATTEMPTS`, backoff `SUPPLIER_POSTSALE_JOB_BACKOFF_MS`; en log de `failed` aparece `retriesExhausted` cuando se agotan intentos.
- Jobs fallidos se retienen (`removeOnFail`) para inspección; no hay cola DLQ separada en esta fase.

## Desactivar temporalmente la postventa CJ automatizada

1. **Polling batch**: `SUPPLIER_POSTSALE_SYNC_ENABLED=false`.
2. **Pago**: no establecer `CJ_PHASE_D_ALLOW_PAY` (o `false`) y no enviar `executePay: true`.
3. **Emergencia**: detener workers / API o aislar Redis si la cola encola trabajo no deseado (procedimiento estándar de infra del proyecto).

## Incidente: demasiados 429 en CJ

- El adapter CJ ya aplica backoff; el batch añade jitter entre órdenes.
- Reducir frecuencia: `SUPPLIER_POSTSALE_SYNC_CRON` más espaciado o `SUPPLIER_POSTSALE_SYNC_BATCH` menor.

## Checklist producción (resumen)

| Debe estar encendido | Redis (`REDIS_URL`) para workers BullMQ; API con `ScheduledTasksService`; credenciales CJ válidas. |
|---------------------|-----------------------------------------------------------------------------------------------------|
| Apagado por defecto | `CJ_PHASE_D_ALLOW_PAY` (solo activar para ventana de pago); `CJ_PAY_REQUIRE_CONFIRM_TOKEN` según política. |
| Habilitar pago controlado | `CJ_PHASE_D_ALLOW_PAY=true` + allowlist/techo/token + `POST` con `executePay` y `payConfirmToken` si aplica. |
| Revertir / incidente | `SUPPLIER_POSTSALE_SYNC_ENABLED=false`; `CJ_PHASE_D_ALLOW_PAY=false`; escalar Redis/workers según runbook de infra. |
| Salud del módulo | `npm run cj-api:smoke`; `npm run supplier-postsale:sync-once`; revisar logs 429 y `rateLimitedHits` en batch. |

## Referencias

- Informe final: `docs/CJ_FINAL_PRODUCTION_READINESS_REPORT.md`
- Phase D.5: `docs/CJ_PHASE_D5_OPERATIONAL_HARDENING_REPORT.md`
- Phase D base: `docs/CJ_PHASE_D_IMPLEMENTATION_REPORT.md`
