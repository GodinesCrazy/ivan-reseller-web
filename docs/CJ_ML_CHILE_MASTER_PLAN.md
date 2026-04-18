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

## Endpoints — actualizado 2026-04-17 (Fase C)

| Método | Path                                      | Descripción                                        |
|--------|-------------------------------------------|----------------------------------------------------|
| GET    | /api/cj-ml-chile/system-readiness         | Health (sin module gate)                           |
| GET    | /api/cj-ml-chile/overview                 | Conteos + KPIs                                     |
| POST   | /api/cj-ml-chile/cj/search                | Buscar productos CJ                                |
| POST   | /api/cj-ml-chile/preview                  | Evaluar sin persistir                              |
| POST   | /api/cj-ml-chile/evaluate                 | Evaluar + persistir en DB                          |
| GET    | /api/cj-ml-chile/ml/categories/suggest    | Sugerir categorías ML Chile por texto (ML API pública) |
| POST   | /api/cj-ml-chile/listings/draft           | Crear listing DRAFT (con categoryId real)          |
| POST   | /api/cj-ml-chile/listings/:id/publish     | Publicar en ML Chile (bloquea si categoryId=MLC9999) |
| POST   | /api/cj-ml-chile/listings/:id/reprice     | Recalcular precio con FX actual (actualiza ML si ACTIVE) |
| POST   | /api/cj-ml-chile/orders/import            | Import manual por ID                               |
| POST   | /api/cj-ml-chile/orders/:id/fetch-ml      | Fetch datos reales desde ML API                    |
| POST   | /api/cj-ml-chile/webhooks/ml              | Webhook ML (sin auth JWT — configurar en portal ML)|
| GET    | /api/cj-ml-chile/profit                   | KPIs financieros                                   |
| GET    | /api/cj-ml-chile/logs                     | Traces por correlationId                           |

---

## Auditoría fase B — 2026-04-17 (correcciones iniciales)

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

---

## Auditoría fase C — 2026-04-17 (elevación a pruebas controladas reales)

### Correcciones y funcionalidades añadidas

| # | Severidad | Cambio | Detalle |
|---|-----------|--------|---------|
| 1 | BUG CRÍTICO | `warehouseChileConfirmed` en routes.ts usaba `\|\| freight.quote.cost > 0` | Corregido a solo `=== 'CL'` — consistente con qualification.service.ts |
| 2 | GUARDRAIL | Publish bloqueado si `categoryId === 'MLC9999'` | Error claro: usar `/ml/categories/suggest` antes de publicar |
| 3 | FEATURE | Endpoint `GET /ml/categories/suggest?q=TITULO` | Llama ML Category Predictor API (no auth) — devuelve hasta 5 candidatos con probabilidad |
| 4 | FEATURE | UI category picker en Products page | El operador selecciona categoría antes de crear draft — categoryId pasa al draft automáticamente |
| 5 | FEATURE | Endpoint `POST /webhooks/ml` (sin auth JWT) | Recibe notificaciones ML → auto-importa orderId → trazable por correlationId |
| 6 | FEATURE | FX staleness en GET /listings y GET /listings/:id | Campos `fxStale: bool`, `fxAgeHours: number` — umbral 24h |
| 7 | UI | Badge "FX stale Nh" en ListingsPage | Listings con FX > 24h muestran badge amber + botón "Re-evaluar precio" destacado |
| 8 | FEATURE | Endpoint `POST /listings/:id/reprice` | Recalcula precio con FX actual, actualiza DB, actualiza ML API si ACTIVE |
| 9 | FEATURE | Endpoint `POST /orders/:id/fetch-ml` | Trae datos reales de la orden desde ML API — vincula listing, actualiza totalCLP |
| 10 | UI | OrdersPage mejorada | Botón "Fetch de ML", timeline expandible, next-step por status, webhook URL visible |
| 11 | CONSTANTE | `LISTING_REPRICED` trace step | Trazabilidad completa del reprice |

### Decisiones de diseño confirmadas

**`shipping.mode: 'not_specified'`** — DEFINITIVO para MVP CJ→ML Chile:
- `me2` (Mercado Envíos Full) requiere pre-shipment de stock al depósito ML → incompatible con dropshipping CJ directo al comprador.
- Con `not_specified`, el vendedor configura el envío en el portal ML post-publicación (envío personalizado / acuerdo con comprador).
- Esta es la única opción coherente para dropshipping directo en el MVP.

**categoryId** — RESUELTO operacionalmente:
- El operador usa `/ml/categories/suggest` para obtener sugerencias del ML Category Predictor (gratuito, sin auth).
- Selecciona la categoría antes de crear el draft.
- La categoría se persiste en `draftPayload.categoryId`.
- Publish bloquea si `categoryId === 'MLC9999'` (comodín vacío).

### Estado real del módulo — post-fase C

**Estado: C — Listo para pruebas controladas reales**

- ✅ Bug warehouseChileConfirmed corregido en routes.ts
- ✅ categoryId: selección guiada con ML Category Predictor, guardrail en publish
- ✅ shipping.mode: `not_specified` — decisión final documentada
- ✅ FX staleness: badge + guardrail + reprice action (sin auto-reprice)
- ✅ Webhook ML: endpoint listo, URL documentada para portal
- ✅ Orders: fetch-ml real, timeline, vinculación automática de listing
- ✅ Type-check backend: 0 errores
- ✅ Type-check frontend: 0 errores
- ✅ Prisma validate: ✅
- ✅ No rompe CJ→eBay USA ni legacy ML

### Limitaciones remanentes del MVP (honesto)

| Pendiente | Tipo | Qué falta |
|-----------|------|-----------|
| notification_url en portal ML | PORTAL — no código | Operador debe configurar en https://vendedores.mercadolibre.cl/notifications |
| shipping config post-publish | OPERACIONAL | Operador debe configurar envío en el listing ML luego de publicar |
| ML fee real por categoría | DATO | Hoy 12% default; fee real varía por categoría — verificar en ML fee table |
| Fulfillment CJ automático | FASE FUTURA | Hoy manual; órdenes requieren intervención para colocar en CJ |
| Multi-variante batch | FASE FUTURA | Hoy 1 variante por evaluación |
| Stock sync automático | FASE FUTURA | No hay sync de stock post-venta |

---

## Fase D — Products Screen Enrichment (2026-04-18)

**Estado: IMPLEMENTADO — pantalla Products elevada a panel de decisión comercial**

### Problema resuelto

La pantalla `CJ → ML Chile / Products` era un listado plano sin contexto visual, sin señal de stock clara, sin variante picker, sin estimado CLP y sin organización por viabilidad. Era claramente inferior al módulo `CJ → eBay USA / Products`.

### Qué se implementó

#### Backend (`/cj/search`)
- Ahora devuelve `operabilitySummary: { operable, stockUnknown, unavailable }` calculado en backend
- Ahora devuelve `fxRateCLPperUSD` y `fxRateAt` para estimado CLP en cards de búsqueda

#### Frontend (`CjMlChileProductsPage.tsx`)
- **Fix crítico**: campo imagen era `imageUrls` (incorrecto) → `mainImageUrl` (campo real del backend). Las imágenes no aparecían antes.
- **Grid de cards** 2–4 columnas reemplaza lista plana
- **Grouping por operabilidad**: "Con stock confirmado" / "Stock por confirmar" / "Sin stock" (collapsible)
- **Banner de estadísticas**: total de resultados por categoría + FX rate actual
- **Cards enriquecidas**: imagen lazy, título, precio USD (REAL), precio CLP estimado (ESTIMATED), StockBadge, badge WH Chile pendiente
- **Variant picker**: auto-fetch de `/cj/product/:id` al seleccionar producto, lista variantes operables primero, sin-stock collapsible, auto-selección de la primera variante con stock
- **Selected product panel**: imagen, título, precio USD+CLP, todos los badges, summary de variante seleccionada (label, costo REAL, stock, SKU)
- **Badges REAL / ESTIMATED / PENDING** en cada dato según su origen:
  - Precio CJ USD: REAL
  - CLP: ESTIMATED (FX)
  - Costo de variante: REAL
  - Envío CJ: REAL
  - ETA: REAL si warehouse CL confirmado, ESTIMATED si no
  - Warehouse Chile: PENDING en search, REAL/confirmado post-preview
- **ShippingRow**: costo USD, método, ETA con badge, país origen
- **PricingTable mejorada**: columna CLP con header ESTIMATED, filas bold en totales, FX line con badge

### Paridad con CJ → eBay USA

| Eje | eBay USA | ML Chile ANTES | ML Chile AHORA |
|-----|----------|----------------|----------------|
| Layout resultados | Grid cards | Lista plana | Grid cards ✅ |
| Grouping por stock | 3 tiers | Ninguno | 3 tiers ✅ |
| Imágenes en cards | ✅ | ✗ (bug de campo) | ✅ |
| Precio estimado en card | USD only | USD only | USD + CLP estimado ✅ |
| Variant picker | ✅ Auto | Manual SKU | ✅ Auto ✅ |
| Badges REAL/EST | ✅ | Parcial | ✅ Sistema completo |
| Stats banner | ✅ | ✗ | ✅ |
| WH badge en card | ✅ US/CN | ✗ | PENDING → REAL post-preview ✅ |
| Pricing breakdown | ✅ | ✅ | ✅ + CLP column |
| Risk score | ✅ | ✗ | ✗ (no aplica en MVP) |

**Paridad alcanzada en**: layout, variant picker, grouping, imágenes, badges, stats.

**Diferencias intencionales** (no son gaps, son correctas para ML Chile):
- WH no se detecta en search (sería una call por producto — demasiado caro); se muestra PENDING y se resuelve en preview
- Precios en CLP son siempre ESTIMATED (dependen de FX)
- Risk score numérico no implementado — la decisión es binaria APPROVED/REJECTED/NOT_VIABLE

