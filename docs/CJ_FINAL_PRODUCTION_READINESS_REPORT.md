# CJ — Informe final de preparación para producción

## 1) Resumen ejecutivo

Esta pasada cierra el **hardening financiero y operativo** del apartado CJ sobre lo ya entregado en Phases A–D.5: **guardrails adicionales para `payBalance`**, **política de allowlist / techo de precio / token de confirmación**, **endurecimiento BullMQ** en `supplier-postsale-sync` (reintentos, backoff, retención de fallos, logs de agotamiento de reintentos), **mapeo `cjVid`/logística ampliado a rutas no eBay** (blobs de supply/opportunity, `productData`), observabilidad de **429** en sync batch, script **read-only** de comprobación de guardrails, tests unitarios de política de pago, y documentación de cierre.

**Veredicto final: GO CONDICIONAL a producción del módulo CJ** (automatización postventa, discovery, colas) **con checklist operativa obligatoria** para el primer **pago real** y para Redis/BullMQ en runtime.

**Porcentaje estimado hacia “terminado real” del apartado CJ: ~92%**

El gap residual principal es **validación financiera de negocio** en cuenta CJ real (montos, límites, procedimiento de rollback/incidentes), no carencias de código del flujo técnico.

---

## 2) Estado previo

- Phase D.5: `paySupplierOrder` con `CJ_PHASE_D_ALLOW_PAY` + `executePay`, dry-run, idempotencia básica, audit `payAudit`, cola `supplier-postsale-sync`, resolver eBay→`cj_ebay_orders`.

Pendientes explícitos: pago real controlado con política explícita, retries BullMQ, mapping sin depender solo del vertical eBay, veredicto de producción.

---

## 3) Qué se implementó en esta pasada

| Área | Implementación |
|------|----------------|
| Pago | `cj-pay-safety.ts`: allowlist opcional (`CJ_PAY_ORDER_ID_ALLOWLIST`), techo `CJ_PAY_MAX_ORDER_USD`, confirmación opcional `CJ_PAY_REQUIRE_CONFIRM_TOKEN` + `CJ_PAY_CONFIRM_TOKEN`; integración antes de `payBalance`; outcome `payment_unsafe_to_execute`. |
| API | `POST .../supplier/pay` acepta `payConfirmToken`. |
| BullMQ | Cola `supplier-postsale-sync` con `defaultJobOptions` (attempts/backoff configurables), `removeOnFail` para inspección, logs `completed` / `failed` con `retriesExhausted`. |
| Sync batch | Contador `rateLimitedHits` y log de degradación por 429. |
| Mapping | Resolver: `order_metadata_supply` (blobs en metadata + `recommendedSupplierMeta`), `product_data` (JSON del Product). |
| Herramientas | `npm run cj-pay:guardrails-check` (solo lectura). |
| Tests | `cj-pay-safety.test.ts`. |

---

## 4) Resultado del pago controlado

- **Ejecución real de `payBalance`**: **no** se forzó en esta pasada automatizada (riesgo financiero y política de cuenta).
- **Evidencia técnica**:
  - Guardrails en cadena: `CJ_PHASE_D_ALLOW_PAY` + `executePay` + (opcional) allowlist + techo USD + token de confirmación.
  - Dry-run y eligibilidad siguen disponibles sin cargo.
  - Script `cj-pay:guardrails-check` valida política sobre un `Order` sin llamar a CJ pay.
- **Clasificación de outcomes** (implementados): `payment_success`, `payment_skipped_*`, `payment_blocked_guardrail`, `payment_ineligible_state`, `payment_failed`, **`payment_unsafe_to_execute`**.

Para un **primer pago real** en producción: definir allowlist acotada, `CJ_PAY_MAX_ORDER_USD`, activar `CJ_PAY_REQUIRE_CONFIRM_TOKEN` y rotar `CJ_PAY_CONFIRM_TOKEN` vía secreto de despliegue.

---

## 5) Estado final BullMQ / retries / DLQ / observabilidad

- **Retries**: `SUPPLIER_POSTSALE_JOB_ATTEMPTS` (default 5), **backoff exponencial** `SUPPLIER_POSTSALE_JOB_BACKOFF_MS` (default 60000).
- **“DLQ”**: no hay cola DLQ separada; **jobs fallidos retenidos** (`removeOnFail: 100`) para inspección en Redis/BullMQ (patrón alineado con minimizar superficie nueva).
- **Observabilidad**: logs de job `completed`, `failed` con `attemptsMade` / `retriesExhausted`; batch sync con `rateLimitedHits` y warning de degradación.

---

## 6) Estado final del mapping `cjVid` / logística

| Fuente | Confianza | Notas |
|--------|-----------|--------|
| `supplierMetadata.cj` | high | Explícito. |
| Blobs supply/opportunity/`recommendedSupplierMeta` | medium | Claves flexibles: `cjVid`, `logisticName`, `cjFreightMethod`, etc. |
| `product.productData` (`cj`, `supplierCj`) | low | Catálogo global sin vertical eBay. |
| `cj_ebay_orders` + paypalOrderId | medium | Vertical eBay. |

---

## 7) Archivos modificados / nuevos

- Nuevo: `backend/src/services/cj-pay-safety.ts`
- Nuevo: `backend/src/services/__tests__/cj-pay-safety.test.ts`
- Nuevo: `backend/scripts/cj-pay-guardrails-check.ts`
- Editados: `supplier-fulfillment.service.ts`, `supplier-fulfillment.types.ts`, `cj-order-supplier-metadata.resolver.ts`, `supplier-postsale-sync.service.ts`, `scheduled-tasks.service.ts`, `orders.routes.ts`, `package.json`, `.env.example`
- Docs: este informe; actualización de `docs/CJ_POSTSALE_RUNBOOK.md`

---

## 8) Variables de entorno nuevas o refinadas

- `CJ_PAY_ORDER_ID_ALLOWLIST` — opcional; si se define, solo esos `Order.id` pueden pagar.
- `CJ_PAY_MAX_ORDER_USD` — opcional; rechaza si `order.price` supera el techo.
- `CJ_PAY_REQUIRE_CONFIRM_TOKEN` / `CJ_PAY_CONFIRM_TOKEN` — opcional; segundo factor para API.
- `SUPPLIER_POSTSALE_JOB_ATTEMPTS` / `SUPPLIER_POSTSALE_JOB_BACKOFF_MS` — BullMQ.

---

## 9) Pruebas ejecutadas

- `npm run type-check`
- `npx eslint` (archivos de servicio tocados)
- `npx jest src/services/__tests__/cj-pay-safety.test.ts`
- `npm run cj-api:smoke` (regresión CJ)
- `npm run supplier-postsale:sync-once` (batch real; 429 posible con backoff)

---

## 10) Riesgos residuales

- **Financiero**: `payBalance` sigue siendo irreversible en el proveedor; la mitigación es **política + allowlist + montos + secrets rotacionales**, no solo código.
- **Redis**: sin Redis, la cola no corre; el script `supplier-postsale:sync-once` sigue siendo vía de respaldo operativa.
- **429 CJ**: persisten bajo carga; el sistema degrada con backoff y métricas de batch, no elimina el límite de tasa del proveedor.

---

## 11) Veredicto final

**GO CONDICIONAL**

- **GO** para uso productivo de: auth, discovery, deep quote, postventa global (create/confirm/status/tracking), sync programado, runbooks.
- **Condiciones** para considerar el **primer pago real** aceptable: entorno aprobado, allowlist/techo/token activados según política, y persona responsable que monitoree la primera ejecución.

Un **NO-GO** solo aplicaría si en producción no se pudiera cumplir: Redis para jobs críticos, credenciales CJ válidas, o política de pagos explícita; no por fallos del diseño actual del flujo técnico.

---

## 12) Porcentaje final estimado

**~92%** hacia “terminado real” del apartado CJ; el **8%** restante es principalmente **validación de negocio en dinero real**, **monitorización/alertas externas** (PagerDuty, etc., si se desea) y **extensión de mapping** para más orígenes de publicación si aparecen nuevos canales.

**Addendum (2026-04-14 — v1):** la **CJ API Key** puede administrarse desde **`/api-settings`** con test de conexión y sin exponer la clave completa al cliente; ver `docs/CJ_SETTINGS_AND_WEB_OPERATION_REPORT.md`. Esto refuerza el requisito de **credenciales válidas** sin cambiar el veredicto **GO CONDICIONAL** sobre el primer pago real.

**Addendum (2026-04-14 — v2, commit `c809b37`):** corregido bug de **estado contradictorio en tarjeta CJ** (`/api-settings`). La tarjeta ya no muestra "Sesión activa / Configurado y funcionando" simultáneamente con "APIkey is wrong" al probar la conexión. Tras el parche: clave inválida detectada → badge **"Clave inválida"** (rojo) + card body **"Error de configuración"**; clave válida → badge **"API activa"** (verde). Ver `docs/CJ_SETTINGS_FALSE_ACTIVE_ROOT_CAUSE_AND_FIX_REPORT.md` para el análisis completo.

---

## Checklist operativa final (resumen)

Ver detalle en `docs/CJ_POSTSALE_RUNBOOK.md` (sección actualizada).
