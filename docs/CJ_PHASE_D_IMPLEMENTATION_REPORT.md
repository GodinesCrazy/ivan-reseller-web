# CJ Phase D Implementation Report

## 1) Resumen ejecutivo

Se implementó una **capa postventa neutral por proveedor** sobre el modelo `Order` interno, reutilizando el adapter CJ ya validado (`createOrder`, `confirmOrder`, `payBalance`, `getOrderStatus`, `getTracking`) sin duplicar su lógica HTTP.

Resultado de esta pasada: **GO** para Phase D base.

- Existe orquestación global (`supplierFulfillmentService`) desacoplada de `cj-ebay`.
- Se integró al modelo interno con campos `supplier*` en `orders`.
- Se expusieron endpoints globales en `orders.routes` para create/confirm/pay/status/tracking.
- Se ejecutaron pruebas reales CJ (create + confirm + status + tracking) con datos reales y control de riesgo para `pay`.

**Progreso estimado hacia “terminado real” del apartado CJ (post Phase A–D): ~78%**

- Incluye auth, catálogo/stock, oportunidades/deep quote, vertical `cj-ebay`, y ahora postventa global base + modelo `Order`.
- Falta principalmente: `pay` validado en producción controlada, jobs de resync/polling, colas durables, y mapeo de `cjVid`/logística desde catálogo global sin heurísticas.

---

## 2) Estado previo

- `cj-ebay` ya tenía flujo postventa vertical operativo (place/confirm/pay/status/tracking).
- El modelo `Order` legacy estaba orientado a AliExpress (`aliexpressOrderId`) y no tenía contrato neutral de supplier.
- No existía una capa compartida para postventa multi-supplier reutilizable por todo el ecosistema.

---

## 3) Qué se implementó realmente

### 3.1 Capa neutral de fulfillment por proveedor

Se creó:

- `backend/src/services/supplier-fulfillment.types.ts`
- `backend/src/services/supplier-fulfillment.service.ts`

Contrato implementado:

- `createSupplierOrder`
- `confirmSupplierOrder`
- `paySupplierOrder`
- `getSupplierOrderStatus`
- `getSupplierTracking`

Implementación actual:

- `supplier = cj` (real, usando `createCjSupplierAdapter` y métodos oficiales ya existentes).
- Otros proveedores quedan explícitamente extensibles en el contrato.

### 3.2 Integración con Order interno

Se agregó soporte neutral en `Order`:

- `supplier`
- `supplierOrderId`
- `supplierStatus`
- `supplierPaymentStatus`
- `supplierTrackingNumber`
- `supplierTrackingUrl`
- `supplierLogisticName`
- `supplierSyncAt`
- `supplierMetadata`

Además:

- `supplierFulfillmentService.getSupplierTracking` sincroniza tracking a `Sale` (si existe y no tenía tracking), para mantener consistencia postventa.

### 3.3 Integración en flujo general

En `order-fulfillment.service.ts`:

- Se añadió detección de supplier (`order.supplier` o heurística por URL).
- Si `supplier = cj`, el flujo usa la capa neutral (`createSupplierOrder`) y mantiene `Order` consistente (`status = PURCHASED` al crear orden proveedor).
- Si no, conserva el flujo existente de AliExpress (compatibilidad intacta).

### 3.4 Endpoints globales (no verticales)

En `backend/src/api/routes/orders.routes.ts`:

- `POST /api/orders/:id/supplier/create`
- `POST /api/orders/:id/supplier/confirm`
- `POST /api/orders/:id/supplier/pay`
- `GET /api/orders/:id/supplier/status`
- `GET /api/orders/:id/supplier/tracking`

Todos operan sobre `Order` y retornan resultado normalizado + snapshot actualizado del pedido interno.

### 3.5 Script de prueba real Phase D

Se creó:

- `backend/scripts/cj-phase-d-postsale-smoke.ts`
- script npm: `cj-api:phase-d-smoke`

Este smoke:

1. Genera una orden interna temporal `supplier=cj`.
2. Ejecuta create/confirm/status/tracking contra CJ real.
3. Usa fallback de auto-descubrimiento de `cjVid` + `logisticName` vía APIs reales cuando no hay datos de `cj-ebay` mapeados.
4. Deja `pay` protegido por flag `CJ_PHASE_D_ALLOW_PAY=true`.

---

## 4) Contrato de fulfillment por proveedor

Salida normalizada (`SupplierOrderSnapshot`):

- `supplier`
- `supplierOrderId`
- `internalOrderId`
- `status`
- `paymentStatus`
- `trackingNumber`
- `trackingUrl`
- `logisticName`
- `rawStatus`
- `syncAt`
- `metadata`

Notas:

- Para CJ, `rawStatus` refleja estado proveedor (`UNPAID`, etc.).
- `paymentStatus` se deriva de estado CJ y/o transición de confirm/pay.

---

## 5) Integración CJ al modelo de órdenes

La integración se hace en la tabla `orders` (modelo interno global), no en tablas verticales.

- `cj-ebay` sigue operando como vertical independiente.
- La capa neutral permite que futuros canales (e.g. marketplaces distintos de eBay) usen el mismo backend postventa cuando `supplier = cj`.

---

## 6) Archivos modificados

### Nuevos

- `backend/src/services/supplier-fulfillment.types.ts`
- `backend/src/services/supplier-fulfillment.service.ts`
- `backend/scripts/cj-phase-d-postsale-smoke.ts`
- `backend/prisma/migrations/20260413190000_order_supplier_postsale_phase_d/migration.sql`
- `docs/CJ_PHASE_D_IMPLEMENTATION_REPORT.md`

### Modificados

- `backend/prisma/schema.prisma`
- `backend/src/services/order-fulfillment.service.ts`
- `backend/src/api/routes/orders.routes.ts`
- `backend/package.json`
- `backend/.env.example`

---

## 7) Migraciones requeridas

Aplicada en esta pasada:

- `20260413190000_order_supplier_postsale_phase_d`

Comando ejecutado:

- `npx prisma migrate deploy`

Nota (Windows / Prisma): si `prisma generate` falla con **EPERM** al renombrar el query engine, probar:

- `npx prisma generate --no-engine` (solo tipos), o
- `set PRISMA_CLIENT_ENGINE_TYPE=binary` y luego `npx prisma generate`

No commitear credenciales ni paths sensibles en documentación.

---

## 8) Pruebas ejecutadas (evidencia)

### Validación técnica

- `npm run type-check` → **OK**
- `ReadLints` sobre archivos tocados → **sin errores**
- `npx eslint src/services/supplier-fulfillment.service.ts src/services/supplier-fulfillment.types.ts --max-warnings 0` → **OK**

### Regresión vertical CJ (no romper `cj-ebay`)

Comandos (mismas integraciones ya usadas en el repo):

- `npm run cj-api:smoke` → **OK** (smoke general CJ)
- `npm run cj-api:deep-quote-smoke` → **OK** (deep quote / oportunidades)

### Prueba real externa CJ (Phase D)

Comando:

- `npm run cj-api:phase-d-smoke`

Resultado real observado:

- **Create supplier order (CJ)**: OK, se obtuvo `supplierOrderId` real.
- **Confirm supplier order**: OK.
- **Get supplier order status**: OK (`UNPAID` en esta corrida).
- **Get supplier tracking**: OK (sin tracking aún, estado pendiente).
- Se observó una degradación controlada por **429** en una lectura de estado/tracking con backoff existente del adapter.
- `paySupplierOrder` quedó **omitido intencionalmente** en la corrida por seguridad financiera (flag `CJ_PHASE_D_ALLOW_PAY` en `false`).

Ajuste de contrato CJ en create global: las líneas de `createOrder` ya no envían `storeLineItemId` con el id interno de `Order` (campo opcional; el vertical `cj-ebay` sigue enviando `storeLineItemId` desde `lineItemRef` cuando aplica).

---

## 9) GO / NO-GO

**GO** para Phase D base:

1. Existe capa postventa reusable por proveedor.
2. CJ opera create/confirm/pay/status/tracking desde esa capa (pay disponible vía endpoint/script y guardado por flag en smoke).
3. `Order` interno quedó integrado con campos `supplier*`.
4. No se rompió el vertical `cj-ebay` (sin cambios destructivos en su flujo).
5. Hubo pruebas reales contra API CJ.
6. Informe final documentado.

---

## 10) Pendiente para “terminado real” final CJ

- Activar y validar corrida real con `paySupplierOrder` en entorno controlado con saldo autorizado (`CJ_PHASE_D_ALLOW_PAY=true`).
- Job periódico neutral para polling/re-sync (`status`/`tracking`) por proveedor.
- Colas/retries persistentes multi-supplier (BullMQ) para postventa global.
- Resolver selección de `cjVid` desde catálogo de publicación global (sin depender de metadata manual/script).
- Extender la misma capa neutral a otros proveedores para completar multicanal end-to-end.
