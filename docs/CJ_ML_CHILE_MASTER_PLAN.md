# CJ → ML Chile — Master Plan (MVP)

## Scope

Vertical aislado para vender productos CJ Dropshipping en Mercado Libre Chile.
No toca CJ→eBay USA, legacy AliExpress, ni legacy ML.

## Regla de oro MVP

**Solo productos con warehouse Chile confirmado** (`startCountryCode === 'CL'` en respuesta de `freightCalculate` con `destPostalCode=7500000`). Sin warehouse CL → `NOT_VIABLE` (fuera de scope, no REJECTED).

## Arquitectura

```
backend/src/modules/cj-ml-chile/
  adapters/cj-ml-chile-supplier.adapter.ts  — re-export createCjSupplierAdapter (mismo CJ API v2)
  schemas/cj-ml-chile.schemas.ts            — validación Zod
  services/
    cj-ml-chile-config.service.ts           — settings por usuario
    cj-ml-chile-pricing.service.ts          — motor CLP/IVA/FX
    cj-ml-chile-qualification.service.ts    — probe warehouse + evaluate
    cj-ml-chile-listing.service.ts          — draft / publish / pause
    cj-ml-chile-alerts.service.ts           — gestión alertas
    cj-ml-chile-profit.service.ts           — resumen financiero
    cj-ml-chile-trace.service.ts            — trazabilidad por correlationId
    cj-ml-chile-system-readiness.service.ts — health checks
  cj-ml-chile.constants.ts
  cj-ml-chile.routes.ts

frontend/src/pages/cj-ml-chile/
  CjMlChileModuleGate.tsx   — bloquea si VITE_ENABLE_CJ_ML_CHILE_MODULE != 'true'
  CjMlChileLayout.tsx       — nav emerald, 7 secciones
  CjMlChileOverviewPage.tsx
  CjMlChileProductsPage.tsx — search → preview → evaluate → draft
  CjMlChileListingsPage.tsx — gestión listings con CLP/FX
  CjMlChileOrdersPage.tsx   — import + fulfillment status
  CjMlChileAlertsPage.tsx   — alertas open/ack/resolve
  CjMlChileProfitPage.tsx   — KPIs financieros + snapshots
  CjMlChileLogsPage.tsx     — traces por correlationId
```

## DB (prefijo `cj_ml_chile_*`)

| Modelo Prisma                 | Tabla                              | Uso                                      |
|-------------------------------|------------------------------------|------------------------------------------|
| CjMlChileAccountSettings      | cj_ml_chile_account_settings       | fee%, buffers, flags por usuario         |
| CjMlChileProduct              | cj_ml_chile_products               | snapshot producto CJ                     |
| CjMlChileProductVariant       | cj_ml_chile_product_variants       | variante/SKU                             |
| CjMlChileShippingQuote        | cj_ml_chile_shipping_quotes        | resultado freightCalculate (confidence)  |
| CjMlChileProductEvaluation    | cj_ml_chile_product_evaluations    | decision + pricing snapshot              |
| CjMlChileListing              | cj_ml_chile_listings               | listing ML activo/draft                  |
| CjMlChileOrder                | cj_ml_chile_orders                 | orden ML importada                       |
| CjMlChileOrderEvent           | cj_ml_chile_order_events           | timeline eventos                         |
| CjMlChileTracking             | cj_ml_chile_tracking               | tracking CJ→ML                           |
| CjMlChileAlert                | cj_ml_chile_alerts                 | alertas operacionales                    |
| CjMlChileProfitSnapshot       | cj_ml_chile_profit_snapshots       | snapshot financiero manual/auto          |
| CjMlChileExecutionTrace       | cj_ml_chile_execution_traces       | traza por request/correlationId          |

## Modelo financiero

```
landedCostUsd  = (supplierCostUsd + shippingUsd) × 1.19   // IVA 19% importaciones bajo valor
mlFeeUsd       = listPriceUsd × mlcFeePct / 100           // defecto 12%
mpPaymentUsd   = listPriceUsd × mpPaymentFeePct / 100     // defecto 5.18%
incidentUsd    = landedCostUsd × incidentBufferPct / 100  // defecto 2%
netProfitUsd   = listPriceUsd − landedCostUsd − mlFeeUsd − mpPaymentUsd − incidentUsd
listPriceCLP   = round(listPriceUsd × fxRate)             // entero, sin decimales
```

- **IVA 19%** sobre producto + envío (Ley 21.271, régimen < UF 41 Chile).
- **FX**: `fxService.convert(1,'USD','CLP')` — TTL 1h. Tasa + timestamp persistidos en cada evaluación.
- **Si FX no disponible**: evaluación BLOQUEADA (nunca hardcodeada).
- **CLP**: `Decimal(18,0)` en DB — cero decimales por definición del peso chileno.

## Estados listing

`DRAFT → PUBLISHING → ACTIVE | FAILED | PAUSED | ARCHIVED | NOT_VIABLE`

## Feature flags

| Variable                         | Entorno  | Defecto |
|----------------------------------|----------|---------|
| `ENABLE_CJ_ML_CHILE_MODULE`      | Railway  | `false` |
| `VITE_ENABLE_CJ_ML_CHILE_MODULE` | Vercel   | (no set)|

## Endpoints principales

| Método | Path                               | Descripción                         |
|--------|------------------------------------|-------------------------------------|
| GET    | /api/cj-ml-chile/system-readiness  | Health (sin module gate)            |
| GET    | /api/cj-ml-chile/overview          | Conteos + KPIs                      |
| POST   | /api/cj-ml-chile/cj/search         | Buscar productos CJ                 |
| POST   | /api/cj-ml-chile/preview           | Evaluar sin persistir               |
| POST   | /api/cj-ml-chile/evaluate          | Evaluar + persistir en DB           |
| POST   | /api/cj-ml-chile/listings/draft    | Crear listing DRAFT                 |
| POST   | /api/cj-ml-chile/listings/:id/publish | Publicar en ML Chile             |
| GET    | /api/cj-ml-chile/profit            | KPIs financieros                    |
| GET    | /api/cj-ml-chile/logs              | Traces por correlationId            |

## Lo que es REAL vs ESTIMADO

| Campo                    | REAL / ESTIMADO                             |
|--------------------------|---------------------------------------------|
| supplierCostUsd          | REAL — precio CJ en USD                     |
| shippingUsd              | REAL — freightCalculate CJ (si warehouse CL)|
| IVA 19%                  | REAL — modelo legal Chile                   |
| fxRate                   | REAL — servicio externo, TTL 1h             |
| listPriceUsd             | ESTIMADO — sugerido por motor; operador decide|
| mlFee 12%                | ESTIMADO — fee variable por categoría       |
| mpPaymentFee 5.18%       | ESTIMADO — fee Mercado Pago estándar        |
| profit                   | ESTIMADO hasta que la orden esté COMPLETED  |

## Límites MVP

- Solo 1 variante por evaluación (no multi-variante batch).
- No gestión de stock automática post-venta.
- No sincronización de precio ML si cambia FX.
- Fulfillment manual (órdenes requieren import manual por ID).
- No webhook ML Chile (notification_url pendiente de configurar en portal ML).

## Dependencias reutilizadas

- `createCjSupplierAdapter` — mismo adaptador CJ→eBay USA (CJ OpenAPI v2).
- `fxService` — servicio FX compartido (`src/services/fx.service.ts`).
- `buildMLChileImportFooter()` — footer legal desde `ml-chile-import-compliance.service.ts`.
- `api_credentials` — tabla compartida (ML token por `apiName='mercadolibre'`).
- `authenticate` middleware — mismo JWT.

---

## Auditoría final — 2026-04-17

### Correcciones aplicadas

| # | Severidad | Bug | Corrección |
|---|-----------|-----|-----------|
| 1 | CRÍTICO | Sidebar sin entrada CJ → ML Chile — módulo solo accesible por URL directa | Agregado `cjMlChileNavGroup` + `isCjMlChileModuleEnabled()` en `Sidebar.tsx` y `feature-flags.ts` |
| 2 | BUG | Warehouse Chile detection: `startCountryCode === 'CL' \|\| cost > 0` confirmaba CUALQUIER envío incluyendo CN | Corregido a solo `startCountryCode === 'CL'` en `cj-ml-chile-qualification.service.ts` (ambas ocurrencias) |
| 3 | BUG | Draft service: fallback FX hardcodeado `950` cuando la evaluación no tenía tasa guardada | Lanza error `FX_RATE_MISSING` explícito — fuerza re-evaluación del producto |
| 4 | BUG menor | Duplicate null-check `!listPriceCLP \|\| !listPriceCLP` (línea 73) | Corregido a `!listPriceCLP \|\| !listPriceUsd` |
| 5 | RIESGO | `listing_type_id: 'gold_special'` — requiere nivel de vendedor alto, fallará en cuentas nuevas | Cambiado a `'gold_pro'` (tipo estándar accesible en MLC) |
| 6 | RIESGO | `shipping.mode: 'me2'` — incompatible con dropshipping directo CJ→comprador | Cambiado a `'not_specified'` — el vendedor configura envío post-publicación |
| 7 | INFRA | Prisma client no regenerado tras agregar modelos `cj_ml_chile_*` | Ejecutado `prisma generate` — 0 errores TypeScript confirmados |

### Estado real del MVP — post-auditoría

**Estado: B — MVP técnico funcional con pricing/logística estimados**

- Arquitectura aislada: ✅ tablas `cj_ml_chile_*`, rutas `/api/cj-ml-chile/*`, páginas `/cj-ml-chile/*`
- Type-check backend: ✅ 0 errores
- Type-check frontend: ✅ 0 errores
- Prisma validate: ✅ schema válido
- No rompe CJ→eBay USA: ✅ cero contaminación
- No rompe legacy ML: ✅ re-usa solo adaptadores, no flujo de negocio

### Lo que sigue antes de publish real

1. **notification_url** en portal ML Chile para webhooks de órdenes (manual, no código)
2. **categoryId real** al crear draft — el operador debe investigar la categoría MLC correcta
3. **Shipping mode** — decidir si usar `me2` (requiere envío a ML) o gestión custom post-publicación
4. **Sincronización precio** si FX cambia más de X% — aún manual
5. **Fulfillment automático** — hoy las órdenes se importan manualmente por ID
