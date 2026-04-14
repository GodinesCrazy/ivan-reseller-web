# CJ Dropshipping — de autenticación válida a proveedor operativo (plan técnico y fases)

Este documento resume el **estado del módulo CJ** en Ivan_Reseller_Web, las **capacidades ya cubiertas**, los **huecos** respecto a un ciclo completo de dropshipping, y la **hoja de ruta por fases**. Incluye lo implementado en código en esta iteración: **motor de oportunidades opcional con CJ**, **reintentos 429 con backoff**, y **eliminación de POST legacy en smoke** (las pruebas negativas siguen en `cj-api:diagnose-500`).

---

## 1. Mapa de capacidades actuales (backend `cj-ebay` + adapter)

| Capacidad de negocio | Estado | Implementación / notas |
|----------------------|--------|-------------------------|
| Autenticación (`getAccessToken`, refresh) | **Listo** | `CjSupplierHttpClient.postUnauthenticated`, credenciales `cj-dropshipping` / env `CJ_API_KEY` |
| Verificación ligera de token | **Listo** | `verifyAuth` → `GET setting/get` |
| Búsqueda de catálogo | **Listo** | `searchProducts` → `GET product/listV2` (query: `page`, `size`, `keyWord`, extras vía `productQueryBody`) |
| Detalle producto + variantes | **Listo** | `getProductById` → `GET product/query?pid=`, `GET product/variant/query?pid=` |
| Stock por variante (`vid`) | **Listo** | `getStockForSkus` → `GET product/stock/queryByVid?vid=` (entrada = **vid**, no SKU libre) |
| Precio / costo unitario | **Parcial** | Variantes: `variantSellPrice` en `product/variant/query`. Listado: `listPriceUsd` derivado de `sellPrice`/`nowPrice` en listV2 (puede ser rango; se toma primer número). **Cotización envío US:** `POST logistic/freightCalculate` vía `quoteShippingToUs` / `quoteShippingToUsReal` |
| Creación de orden | **Listo** | `createOrder` → `POST shopping/order/createOrderV2` (payload oficial + `platformToken`) |
| Confirmación de orden | **Listo** | `confirmOrder` → `PATCH shopping/order/confirmOrder` |
| Pago balance | **Listo** | `payBalance` → `POST shopping/pay/payBalance` |
| Estado de orden | **Listo** | `getOrderStatus` → `GET shopping/order/getOrderDetail?orderId=` |
| Tracking | **Listo (vía mismo endpoint)** | `getTracking` mapea `trackNumber`, `logisticName`, `trackingUrl` desde `getOrderDetail` |
| Orquestación CJ → eBay (vertical aislada) | **Listo (feature flag)** | `ENABLE_CJ_EBAY_MODULE`, fulfillment, checkout, sync tracking, rutas `/api/cj-ebay/*` |
| Rate limit / QPS | **Reforzado** | Throttle **~1,1 s** entre llamadas en adapter; **429** con backoff exponencial (`CJ_429_BASE_BACKOFF_MS`, `CJ_429_MAX_RETRIES`); cliente marca `CJ_RATE_LIMIT` explícito |
| Llamadas GET-only mal usadas como POST | **Corregido en adapter** | No quedan `POST setting/get` / `POST product/query` en código de producción del adapter |
| Pruebas negativas POST | **Script dedicado** | `npm run cj-api:diagnose-500` (comparación POST incorrecto vs GET) |
| Smoke CI/local | **Solo GET documentado** | `npm run cj-api:smoke` — sin POST legacy |

---

## 2. Faltantes exactos (respecto a “proveedor principal del ecosistema”)

Estos puntos **no están resueltos** solo con el módulo CJ aislado; requieren producto + más código transversal.

1. **Publicación genérica (no solo vertical CJ→eBay)**  
   El flujo global del repo sigue muy acoplado a **AliExpress** (validación pre-publish, URLs, SKUs). CJ como fuente para **Mercado Libre / Amazon / eBay genérico** exige mapear `pid`/`vid`, imágenes, y reglas de listado por marketplace.

2. **Motor de compra único multi-proveedor**  
   Hoy coexisten **AliExpress (Affiliate + Dropshipping + scraper)** y **CJ (API 2.0)** sin un **orquestador único** que elija proveedor por reglas de negocio (margen, stock, plazo, riesgo).

3. **Costo y plazo “tierra adentro” unificados**  
   Oportunidades con CJ usan precio de listado; el **envío CJ a destino final** requiere `freightCalculate` por **vid** y cantidad — costoso en QPS si se hace por cada fila del listado. Falta **estrategia de caché** y **cotización perezosa** en UI.

4. **Resolución SKU → vid**  
   `getStockForSkus` asume strings que son **vid**. Falta tabla o servicio de resolución **SKU CJ → vid** si el resto del sistema trabaja con SKU.

5. **Frontend transversal (fuera de `cj-ebay`)**  
   Oportunidades y research ahora entienden `sourceMarketplace: 'cjdropshipping'` en tipos; falta **UX** (badge, copy, deep link verificado al catálogo CJ) y **acciones** (abrir vertical CJ→eBay, importar a listing CJ).

6. **Webhook / conciliación de pedidos**  
   Plan avanzado: alinear eventos CJ con `cj_ebay_orders` y con ledger interno si CJ es proveedor de otros canales.

---

## 3. Plan por fases (implementación real sobre el software)

### Fase A — Estabilización operativa (completada en esta iteración)

- Throttle + **reintento 429** en `CjSupplierAdapter` (configurable por env).
- **`OPPORTUNITY_CJ_SUPPLY_MODE`**: `off` | `merge` | `fallback` integrado en `opportunity-finder.service.ts`.
- Servicio **`cj-opportunity-supply.service.ts`**: CJ → filas compatibles con el pipeline de oportunidades (precio desde listV2, imágenes obligatorias para pasar filtros existentes).
- Tipos: `OpportunityItem.sourceMarketplace` incluye **`cjdropshipping`** (backend + frontend Opportunities / ProductResearch).
- Smoke: solo **GET** documentado; POST incorrecto relegado a **diagnose**.

### Fase B — Preferencia y fallback entre proveedores (siguiente implementación concreta)

1. **Config por usuario** (DB o `user_settings`): `preferredSupplySource: 'aliexpress' | 'cj' | 'auto'`, pesos para scoring.
2. **Capa única** `SupplyQuoteService` (nombre tentativo) que dado `title/query` + `targetCountry`:
   - consulta Affiliate (si preferido o paralelo),
   - consulta CJ (si `merge`/`fallback`/preferido),
   - devuelve candidatos normalizados: `{ supplier, unitCost, shippingEstimate, deliveryDaysBand, stockHint, externalIds }`.
3. **Dedup inteligente** (título + imagen hash + precio) entre AliExpress y CJ, no solo por `productId`.

### Fase C — Costos y tiempos de envío en oportunidades CJ

1. Para cada oportunidad CJ **seleccionada** (no para todas las filas del listado): llamar `quoteShippingToUsReal` o equivalente según región objetivo.
2. Persistir en metadatos de oportunidad: `cjVid`, `freightQuoteCachedAt`, `landedCostEstimate`.
3. Respetar QPS: cola o batch con spacing **≥ 1 s** entre llamadas CJ.

### Fase D — Ciclo post-venta global con CJ

1. Reutilizar `createOrder` / `confirmOrder` / `payBalance` / `getOrderDetail` desde un **servicio de fulfillment neutro** cuando `supplier=cj`.
2. Unificar tracking con el mismo modelo que ya usa `cj-ebay` para eBay USA.

### Fase E — Frontend

1. Badge **CJ** en listados de oportunidades cuando `sourceMarketplace === 'cjdropshipping'`.
2. Enlace a **módulo `cj-ebay`** si `ENABLE_CJ_EBAY_MODULE` y usuario tiene credenciales CJ.
3. Settings UI: `OPPORTUNITY_CJ_SUPPLY_MODE` equivalente (select merge/fallback/off) sin exponer API key.

---

## 4. Variables de entorno relevantes (sin secretos)

| Variable | Rol |
|----------|-----|
| `CJ_API_KEY` / `CJ_DROPSHIPPING_API_KEY` | API key CJ (nunca en frontend) |
| `ENABLE_CJ_EBAY_MODULE` | Expone `/api/cj-ebay/*` |
| `OPPORTUNITY_CJ_SUPPLY_MODE` | `off` (default), `merge`, `fallback` |
| `CJ_429_MAX_RETRIES` | Reintentos tras HTTP 429 (0–10, default 3) |
| `CJ_429_BASE_BACKOFF_MS` | Backoff inicial en ms (default 2000, dobla cada intento) |
| `CJ_DIAGNOSTIC_LOGS` | `1` / `true` — logs HTTP redactados + cuerpo respuesta (solo diagnóstico) |

---

## 5. Referencias de código (anclajes)

- Adapter CJ: `backend/src/modules/cj-ebay/adapters/cj-supplier.adapter.ts`
- Contrato: `backend/src/modules/cj-ebay/adapters/cj-supplier.adapter.interface.ts`
- Oportunidades + CJ: `backend/src/services/opportunity-finder.service.ts`, `backend/src/modules/cj-ebay/services/cj-opportunity-supply.service.ts`
- Vertical CJ→eBay: `backend/src/modules/cj-ebay/services/cj-ebay-fulfillment.service.ts`, `cj-ebay.routes.ts`
- Diagnóstico POST vs GET: `backend/scripts/cj-api-diagnose-500.ts`
- Informe histórico 500: `docs/CJ_API_500_DIAGNOSIS_REPORT.md`

---

## 6. Criterio de cierre de este documento

- **Mapa de capacidades** y **faltantes** definidos arriba.
- **Fase A** ejecutada en código: oportunidades pueden consumir CJ de forma controlada por env; QPS/429 mejor gestionados; smoke sin POST legacy.
- **Fases B–E** descritas como siguiente trabajo incremental real sobre el repo.

**GO** para continuar con Fase B (preferencia/fallback explícito y capa de cotización unificada) cuando producto confirme reglas de prioridad entre AliExpress y CJ.
