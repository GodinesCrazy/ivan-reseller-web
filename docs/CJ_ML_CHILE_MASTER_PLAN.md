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
