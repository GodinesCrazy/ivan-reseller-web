# CJ → eBay — publicación desde frontend (informe)

**Fecha:** 2026-04-13  
**Alcance:** flujo end-to-end operable desde UI (Opportunities / Product Research) hacia draft/listing eBay con metadata CJ persistida y enlace a postventa.

---

## 1. Resumen ejecutivo

Se implementó un **pipeline HTTP único** `POST /api/cj-ebay/opportunities/ebay-pipeline` que encadena **evaluate → draft** (y **publish** opcional) reutilizando `cjEbayQualificationService` y `cjEbayListingService`. En **Opportunities** y **Product Research** hay acciones **“Draft eBay (CJ)”** visibles solo si el módulo CJ eBay está habilitado (`VITE_ENABLE_CJ_EBAY_MODULE`) y la fila es **CJ** con `productId`.

Se resolvió **variantId** en servidor cuando el producto tiene **una sola variante**; si hay **varias variantes**, se devuelve **400 `MULTIPLE_CJ_VARIANTS`** hasta que el cliente envíe `variantId` (vid o SKU).

Para **órdenes eBay** ingestadas por `marketplace-order-sync`, si el **SKU de línea** coincide con `cj_ebay_listings.ebaySku`, el `Order` legacy recibe **`supplier: 'cj'`** y **`supplierMetadata`** con `cjProductId`, `cjVid`, `cjEbayListingId`, etc., de modo que no dependa solo de heurísticas sobre URLs AliExpress.

**Veredicto:** **GO CONDICIONAL** — el draft y la metadata están listos; la publicación directa desde el mismo botón no se forzó (el UI crea **draft**; publish sigue en `/cj-ebay/listings` o vía API con `publish: true` si el entorno lo permite).

**Estimación hacia 100% operativo del flujo CJ→eBay end-to-end:** **~82%** (sube con: selector de variante en UI, publicación en un solo paso donde `BLOCK_NEW_PUBLICATIONS=false`, y validación en sandbox/producción con credenciales reales).

---

## 2. Estado previo

- Existían `POST /api/cj-ebay/evaluate`, `/listings/draft`, `/listings/publish` pero **no** había acción de producto en Opportunities/Research.
- `variantId` era obligatorio en evaluate/draft; muchas filas CJ en discovery solo tenían **pid**.
- `upsertOrderFromEbayPayload` enlazaba por `marketplaceListing` (Product legacy); los listings CJ publicados **no** crean esa fila, así que las ventas quedaban **sin mapeo CJ** en `Order`.

---

## 3. Qué se implementó

| Área | Cambio |
|------|--------|
| Backend | `cj-ebay-variant-resolution.ts` — resolución vid/sku / multi-variante |
| Backend | `cj-ebay-opportunity-pipeline.service.ts` — orquestación evaluate → draft → publish opcional |
| Backend | `POST /api/cj-ebay/opportunities/ebay-pipeline` + schema Zod |
| Backend | `marketplace-order-sync.service.ts` — match `cj_ebay_listings` por `ebaySku` |
| Frontend | Opportunities: badge **CJ**, botón **Draft eBay (CJ)** |
| Frontend | Product Research: mismo patrón + enlace “CJ catálogo” |
| Tipos | `OpportunityItem.cjVariantId` opcional en backend types |
| Tests | Jest: `cj-ebay-variant-resolution.test.ts` |
| Docs | Este informe |

---

## 4. Flujo frontend → backend → eBay

1. Usuario en **Opportunities** o **Product Research** con fila `sourceMarketplace === 'cjdropshipping'` y `productId`.
2. Clic en **Draft eBay (CJ)** → `POST /api/cj-ebay/opportunities/ebay-pipeline` con:
   - `productId`, `quantity` (1), `destPostalCode` opcional (UI usa `90210` si región **US** en Opportunities/Research).
   - `variantId` opcional (`cjVariantId` en tipos backend cuando se wiree desde pipeline de oportunidades).
3. Servidor: `getProductById` → `resolveCjVariantKeyForPipeline` → `evaluate` → si **APPROVED**, `createOrUpdateDraft`.
4. Publicación: por defecto **no**; opcional `publish: true` en JSON (respetando `BLOCK_NEW_PUBLICATIONS`).

---

## 5. Persistencia metadata supplier CJ

- **Draft/listing vertical:** sin cambio de esquema; `draftPayload` en `cj_ebay_listings` ya incluye `cjProductId`, `cjVariantKey`, quote, evaluación, etc.
- **Order legacy (sync eBay):** `supplierMetadata` JSON con:
  - `mappingSource: 'ebay_line_sku_cj_ebay_listing'`
  - `sourceMarketplace: 'cjdropshipping'`
  - `cjEbayListingId`, `cjProductId`, `cjVid`, `cjSku`, `ebaySku`, `evaluationId`, `shippingQuoteId`
- **Postventa CJ vertical:** sin cambio; el flujo oficial sigue siendo **`cj_ebay_orders`** + `POST /api/cj-ebay/orders/import` por SKU.

---

## 6. Futura venta / postventa

- **Ruta recomendada (CJ module):** importar orden eBay en `cj-ebay` → `place` / `confirm` / `pay` / tracking (ya documentado en runbooks existentes).
- **Ruta legacy Order:** si el sync crea `Order` con `supplier` + `supplierMetadata`, los servicios que lean `supplierUrl` / AliExpress deben tratar **supplier `cj`** según contrato Phase D (`supplierFulfillmentService` ya detecta URLs CJ).

---

## 7. Archivos modificados / nuevos

**Nuevos**

- `backend/src/modules/cj-ebay/services/cj-ebay-variant-resolution.ts`
- `backend/src/modules/cj-ebay/services/cj-ebay-opportunity-pipeline.service.ts`
- `backend/src/modules/cj-ebay/__tests__/cj-ebay-variant-resolution.test.ts`
- `docs/CJ_EBAY_FRONTEND_PUBLISHING_REPORT.md`

**Modificados**

- `backend/src/modules/cj-ebay/schemas/cj-ebay.schemas.ts`
- `backend/src/modules/cj-ebay/cj-ebay.routes.ts`
- `backend/src/services/marketplace-order-sync.service.ts`
- `backend/src/services/opportunity-finder.types.ts`
- `frontend/src/pages/Opportunities.tsx`
- `frontend/src/pages/ProductResearch.tsx`

---

## 8. Migraciones

**Ninguna** nueva en esta pasada (solo lógica y uso de columnas existentes `orders.supplier`, `orders.supplierMetadata`).

---

## 9. Pruebas ejecutadas

| Comando | Resultado |
|---------|-----------|
| `npx jest src/modules/cj-ebay/__tests__/cj-ebay-variant-resolution.test.ts` | PASS (4 tests) |
| `npm run type-check` (backend) | OK |
| `npm run build` (frontend) | OK |

*No se ejecutó publicación eBay real contra producción en esta pasada* (depende de credenciales y `BLOCK_NEW_PUBLICATIONS`).

---

## 10. Resultado GO / GO CONDICIONAL / NO-GO

**GO CONDICIONAL:** acción UI + pipeline + persistencia draft + enriquecimiento de Order por SKU; falta validación operativa en entorno con CJ+eBay reales y UX para elegir variante cuando hay múltiples SKUs CJ.

---

## 11. Porcentaje hacia 100% y riesgos residuales

- **~82%** del flujo end-to-end (UI → draft → datos persistidos → venta mapeable).
- **Riesgos:** multi-variante sin selector; `destPostalCode` fijo en UI para US; doble modelo **Order legacy vs `cj_ebay_orders`** (operadores deben saber qué pantalla usar); publicación bloqueada por flag global.

---

## 12. Qué falta para publish “en un clic”

1. `publish: true` desde UI (opcional) cuando `BLOCK_NEW_PUBLICATIONS` sea false en el entorno.
2. Campo UI o modal para **variantId** cuando el API devuelve `MULTIPLE_CJ_VARIANTS`.
3. Prueba controlada en sandbox: crear draft → publish → simular orden eBay → verificar `cj_ebay_orders` o `orders.supplierMetadata`.
