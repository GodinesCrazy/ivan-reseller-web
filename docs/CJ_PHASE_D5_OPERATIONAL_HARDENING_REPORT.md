# CJ Phase D.5 — Operational Hardening Report

## 1) Resumen ejecutivo

Se cerró una **Phase D.5 operacional** sobre la postventa global CJ: endurecimiento de **pago** (guardrails + idempotencia básica + auditoría), **polling/resync** neutral vía servicio batch y **cola BullMQ** dedicada, reducción de fragilidad en **mapeo `cjVid`/logística** mediante resolución desde `cj_ebay_orders` cuando el `Order` enlaza un pedido eBay, más scripts y documentación operativa.

**Resultado: GO** para hardening operacional base, con **NO-GO explícito** para considerar “pagos de producción sin supervisión” hasta validar `payBalance` en entorno financiero controlado.

**Progreso estimado hacia “terminado real” del apartado CJ: ~88%**

---

## 2) Estado previo

- Phase D base: `supplierFulfillmentService`, endpoints `/api/orders/:id/supplier/*`, modelo `Order.supplier*`.
- `paySupplierOrder` llamaba siempre a `payBalance` si se invocaba.
- No había job neutral de resync CJ sobre `Order` global (el worker `fulfillment-tracking-sync` cubre flujo AliExpress → marketplaces).
- `cjVid`/logística dependían casi siempre de `supplierMetadata.cj` explícito o de scripts de smoke.

---

## 3) Qué se implementó realmente

### 3.1 Pago (`paySupplierOrder`)

- Requiere **`CJ_PHASE_D_ALLOW_PAY=true`** en entorno **y** cuerpo **`{ "executePay": true }`** en `POST /api/orders/:id/supplier/pay` para ejecutar `payBalance`.
- Sin `executePay`: solo **eligibilidad** / dry-run lógico (`payment_skipped_no_execute_flag`).
- Con `dryRun: true`: solo lectura de estado CJ (`getOrderDetail`), sin cargo (`payment_dry_run_eligibility`).
- **Idempotencia**: si el pedido ya está pagado en BD o el estado remoto indica pago/fulfillment, se devuelve `payment_skipped_already_paid` sin llamar a `payBalance`.
- **Auditoría** en `supplierMetadata.cj.payAudit` (timestamps, outcome, flags; sin secretos).

### 3.2 Polling / resync neutral

- Servicio `runSupplierPostsaleSyncBatch` (`supplier-postsale-sync.service.ts`): para órdenes `supplier` CJ con `supplierOrderId`, aplica **status** y **tracking** mediante `supplierFulfillmentService` (misma lógica que la API).
- Filtros: cooldown mínimo entre polls por orden (`SUPPLIER_POSTSALE_MIN_INTERVAL_MS`), batch limitado, estados terminales configurables.

### 3.3 Cola durable (BullMQ)

- Cola **`supplier-postsale-sync`** registrada en `scheduled-tasks.service.ts`, cron por defecto `*/15 * * * *` (`SUPPLIER_POSTSALE_SYNC_CRON`).
- Reutiliza Redis/BullMQ existente; si Redis no está disponible, el scheduler no arranca la cola (mismo patrón que el resto del proyecto).

### 3.4 Mapeo `cjVid` / logística

- Nuevo resolver `resolveCjSupplierMetadataForCreate`: si faltan campos en metadata, intenta **`cj_ebay_orders`** vía `paypalOrderId` (`ebay:…` o `phase-d-cj:<ebayOrderId>:…`) + `variant.cjVid` + `listing.shippingQuote.serviceName`.
- Persiste `mappingConfidence` / `mappingSource` en `supplierMetadata.cj`.

### 3.5 Scripts

- `npm run supplier-postsale:sync-once` — batch manual sin levantar worker.
- `npm run cj-api:phase-d5-pay-dry-run` — dry-run de pago sobre un `orderId` existente.
- Smoke Phase D actualizado: sin `CJ_PHASE_D_ALLOW_PAY` ejecuta **pay en dry-run** explícito.

### 3.6 Tests

- Unit tests para `extractEbayOrderIdFromPaypalRef`.

---

## 4) Guardrails de pago

| Condición | Comportamiento |
|-----------|----------------|
| Sin `executePay` | No se llama `payBalance`; outcome `payment_skipped_no_execute_flag` |
| `dryRun: true` | Solo estado remoto; `payment_dry_run_eligibility` |
| `executePay: true` y `CJ_PHASE_D_ALLOW_PAY` ≠ true | HTTP 403; audit `payment_blocked_guardrail` |
| Estado no pagable | HTTP 400; `payment_ineligible_state` |
| Ya pagado | `payment_skipped_already_paid` |

---

## 5) Diseño de polling / resync

- Entrada: órdenes CJ con `supplierOrderId`, `userId`, no en estados terminales (configurable), y fuera de ventana de cooldown.
- Secuencia: `getSupplierOrderStatus` → pequeño delay aleatorio → `getSupplierTracking` (reduce ráfagas 429).
- Actualiza `Order`; tracking puede propagar a `Sale` como en Phase D.

---

## 6) Cola durable / retries

- Worker con **concurrencia 1** para el batch global.
- Fallos por orden se registran y el batch continúa.
- Reintentos de jobs BullMQ: patrón estándar del proyecto (repeat scheduler); ajuste fino de `attempts/backoff` por job queda como mejora futura.

---

## 7) Mejora de mapping `cjVid` / logística

- **Alta confianza**: `supplierMetadata.cj` completo.
- **Media confianza**: join `cj_ebay_orders` + variant + listing shipping quote.
- **Fallback**: mensaje de error guía a suministrar metadata o vincular convención de `paypalOrderId`.

---

## 8) Archivos modificados / nuevos

| Archivo |
|--------|
| `backend/src/services/cj-order-supplier-metadata.resolver.ts` |
| `backend/src/services/supplier-postsale-sync.service.ts` |
| `backend/src/services/supplier-fulfillment.service.ts` |
| `backend/src/services/supplier-fulfillment.types.ts` |
| `backend/src/services/scheduled-tasks.service.ts` |
| `backend/src/api/routes/orders.routes.ts` |
| `backend/scripts/cj-phase-d-postsale-smoke.ts` |
| `backend/scripts/supplier-postsale-sync-once.ts` |
| `backend/scripts/cj-phase-d5-pay-dry-run.ts` |
| `backend/src/services/__tests__/cj-order-supplier-metadata.resolver.test.ts` |
| `backend/package.json` |
| `backend/.env.example` |
| `docs/CJ_PHASE_D5_OPERATIONAL_HARDENING_REPORT.md` |
| `docs/CJ_POSTSALE_RUNBOOK.md` |

---

## 9) Variables de entorno nuevas / documentadas

- `CJ_PHASE_D_ALLOW_PAY` — ya existía; ahora combinada con `executePay` en API.
- `SUPPLIER_POSTSALE_SYNC_ENABLED` — default habilitado.
- `SUPPLIER_POSTSALE_SYNC_CRON` — default `*/15 * * * *`.
- `SUPPLIER_POSTSALE_SYNC_BATCH` — default 25.
- `SUPPLIER_POSTSALE_MIN_INTERVAL_MS` — default 120000.
- `SUPPLIER_POSTSALE_TERMINAL_STATUSES` — lista separada por comas.

---

## 10) Pruebas ejecutadas

| Comando | Resultado |
|---------|-----------|
| `npm run type-check` | OK |
| `npx eslint` (archivos tocados del servicio) | OK |
| `npx jest …cj-order-supplier-metadata.resolver.test.ts` | OK |
| `npm run supplier-postsale:sync-once` | OK — batch real contra CJ para órdenes elegibles (429 con backoff observado en logs) |
| `npm run cj-api:smoke` | OK — regresión auth/search/adapter |

**Pago real (`payBalance`)**: no ejecutado en esta pasada automatizada; el contrato queda listo con doble guardrail (env + `executePay`). Se recomienda primera corrida en sandbox/cuenta con límite o monto mínimo.

---

## 11) GO / NO-GO

- **GO**: guardrails de pago, resync batch, cola BullMQ, resolver de metadata, scripts, pruebas ejecutadas, vertical `cj-ebay` no alterado en su adapter.
- **NO-GO** para “producción financiera plena” sin: corrida controlada de `executePay` + `CJ_PHASE_D_ALLOW_PAY`, monitoreo de cola Redis, y política de incidentes (runbook).

---

## 12) Pendiente para “terminado real” CJ

- Validar **pago real** en entorno controlado y documentar montos/límites.
- Afinar **retries BullMQ** (attempts/backoff) y **DLQ** / alertas para jobs fallidos.
- Enriquecer mapping desde **publicaciones/oportunidades** no eBay cuando existan filas equivalentes.
- Reducir ruido de logs Prisma en scripts operativos (fuera del scope de esta pasada).
