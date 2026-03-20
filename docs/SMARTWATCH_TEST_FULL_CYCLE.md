# Smartwatch — ciclo autónomo dropshipping (Mercado Libre Chile)

**Rol:** QA + profit safety + pipeline real  
**Objetivo:** Validar el flujo **normal del sistema** (tendencias → research → validación → publicación) con restricciones estrictas, **sin inyección manual de URL** (no usar `single-article-to-publish` para este test).

---

## Reglas del test

| Regla | Implementación |
|--------|----------------|
| Tipo de producto | Título debe coincidir con **smartwatch** / **smart watch** (regex) |
| Coste proveedor unitario | ≤ **10 USD** (`costUsd` del affiliate + filtro) |
| Proveedor + envío API a **CL** | `supplierUnitUsd + shippingUsd` ≤ **15 USD** (post `getProductInfo`) |
| Destino | `targetCountry: CL`, marketplace **mercadolibre**, sitio **MLC** |
| Validación pre-publicación | Solo **`SAFE`** con **envío desde API** (sin fallback de envío) |
| Margen neto | ≥ **15%** respecto al precio de venta usado en evaluación |
| APIs | Reales: Affiliate/research, AliExpress Dropshipping `getProductInfo`, ML publish |
| Listings activos previos | **0** para el `userId` (aborta Stage 1 si hay activas) |

**Stages 9–15** (compra real, fulfillment, profit API) son **operador + tiempo**; este repo automatiza hasta **Stage 8**.

---

## Stage map

| Stage | Qué hace el backend |
|-------|----------------------|
| **1** | Cuenta `marketplace_listings` activas del usuario; `active-listings-risk-scan` dry-run; credenciales **Dropshipping** + **Mercado Libre** |
| **2** | **Trend:** `getTrendingKeywords` (muestra en reporte). **Research:** `findOpportunitiesWithDiagnostics` con query `smart watch`, `marketplaces: ['mercadolibre']`, sin mocks en el finder |
| **3–5** | Por cada candidato filtrado: `createProduct` (CL), `evaluatePrePublishValidation` con `ignoreValidationDisabled: true`, exige SAFE + envío API + márgenes + topes de coste |
| **6** | Primer candidato que pasa; guarda **SKU** en `product.aliexpressSku` |
| **7** | `publishProduct` → MLC |
| **8** | Lectura `marketplace_listings` para el producto |
| **9** | Esperar compra (Chile) — **manual** |
| **10** | Validar orden en ML + DB — **manual / webhooks** |
| **11** | `placeOrder` Dropshipping — **automático al cumplir orden** |
| **12–14** | Alternativas / tracking — ver servicios existentes (`order-fulfillment`, Phase 48) |
| **15** | `GET /api/finance/real-profit` con JWT — **manual** |

---

## Cómo ejecutarlo

### Railway / producción

Variables recomendadas (además de las habituales):

```env
PRE_PUBLISH_REJECT_RISKY=true
PRE_PUBLISH_SHIPPING_FALLBACK=false
BLOCK_NEW_PUBLICATIONS=false
MERCADOLIBRE_SITE_ID=MLC
```

### Endpoint interno

`POST /api/internal/smartwatch-mlc-constrained-cycle`  
Header: `x-internal-secret: <INTERNAL_RUN_SECRET>`

**Body JSON:**

| Campo | Descripción |
|--------|-------------|
| `userId` | Opcional; si falta, primer usuario activo |
| `dryRun` | `true` → solo Stage 1–2 y lista de candidatos (sin crear producto) |
| `validateOnly` | `true` → crea producto, pre-publish OK, **no publica** en ML |
| `credentialEnvironment` | `production` \| `sandbox` (opcional) |

### NPM (desde `backend/`)

```bash
INTERNAL_RUN_SECRET=xxx npm run internal:smartwatch-mlc-cycle:dry
INTERNAL_RUN_SECRET=xxx npm run internal:smartwatch-mlc-cycle:validate
INTERNAL_RUN_SECRET=xxx npm run internal:smartwatch-mlc-cycle
```

Opcional: `MLC_USER_ID`, `MLC_CREDENTIAL_ENV`, `BASE_URL`.

---

## Reporte de ejecución (rellenar tras correr)

### Stage 1 — Validación

| Check | Resultado |
|--------|-----------|
| Listings activas usuario | |
| Risk scan dry `scanned` | |
| Dropshipping conectado | |
| ML listo | |

### Stage 2 — Descubrimiento

| Campo | Valor |
|--------|--------|
| Hits tendencia “smartwatch” | |
| Candidatos tras filtro coste+título | |
| Query research | `smart watch` |

### Stages 3–6 — Producto elegido

| Campo | Valor |
|--------|--------|
| `productId` | |
| Título | |
| `aliexpressUrl` | |
| `aeProductId` (pre-publish) | |
| `aliexpressSkuId` | |
| `supplierUnitUsd` | |
| `shippingUsd` | |
| `listingSalePrice` (elegido) | |
| `netProfit` | |
| Margen % (`netProfit/sale`) | |
| Clasificación | debe ser **SAFE** |

### Stages 7–8 — Publicación

| Campo | Valor |
|--------|--------|
| `listingId` | |
| `listingUrl` | |
| Estado listing DB | |

### Stages 9–11 — Post-compra (operador)

| Campo | Valor |
|--------|--------|
| ML order id | |
| Order DB id | |
| `placeOrder` / `aliexpressOrderId` | |

### Stage 15 — Profit

| Campo | Valor |
|--------|--------|
| Respuesta `real-profit` | |
| Línea test ≥ 0 | |

---

## Condiciones de fallo (sistema no listo)

- Cualquier candidato **sin stock / SKU / envío a CL / coste envío API**
- **RISKY** o **UNPROFITABLE** o **UNSHIPPABLE** en la evaluación aceptada
- `supplierUnitUsd > 10` o `supplierUnitUsd + shippingUsd > 15` en el escenario elegido
- Margen neto &lt; 15%
- `BLOCK_NEW_PUBLICATIONS=true` u OAuth ML / DS inválido

---

## Código relevante

- `backend/src/services/smartwatch-constrained-cycle.service.ts` — orquestación
- `backend/src/api/handlers/smartwatch-constrained-cycle.handler.ts` — HTTP
- `backend/src/services/pre-publish-validator.service.ts` — `evaluatePrePublishValidation` (+ `supplierUnitUsd`, `shippingUsd`, `aliexpressSkuId` en resultado)
- `backend/src/services/opportunity-finder.service.ts` — research

---

## Notas

- Si **no hay candidatos** que cumplan título + **≤10 USD** + validación CL estricta, el ciclo termina en Stage 2 o 3–6 sin publicar: es **esperado** bajo reglas de cero riesgo.
- Para relajar solo el tope de coste proveedor habría que cambiar constantes en `smartwatch-constrained-cycle.service.ts` (no recomendado sin aprobación de negocio).

---

*Documento generado para el test smartwatch MLC; actualizar la tabla “Reporte de ejecución” tras cada corrida real.*
