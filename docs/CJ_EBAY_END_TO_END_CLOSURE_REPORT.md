# CJ → eBay — cierre end-to-end (informe)

**Fecha:** 2026-04-13  
**Alcance:** multi-variante en UI, draft + publish desde frontend, metadata persistida, validación del puente Order↔CJ, QA.

---

## 1. Resumen ejecutivo

Se cerró el gap principal de **productos CJ multi-variante**: antes de llamar a `/api/cj-ebay/opportunities/ebay-pipeline`, el frontend obtiene variantes con **`GET /api/cj-ebay/cj/product/:cjProductId`** y, si hay más de una, muestra **`CjEbayVariantPickerModal`** para elegir **vid/SKU** explícitamente.

Se separó la UX en **“Crear draft eBay”** y **“Publicar en eBay”** (Opportunities y Product Research), con mensajes claros para **calificación no APPROVED**, **`BLOCK_NEW_PUBLICATIONS`** y **fallo de publish** (`publishSkippedReason`).

En backend, el **`draftPayload`** de `cj_ebay_listings` incluye ahora **`supplier`, `sourceMarketplace`, `mappingSource`, `mappingConfidence`, `cjVid`, `cjSku`** junto al resto del snapshot. El metadata de **`orders.supplierMetadata`** para sync eBay se centralizó en **`buildCjEbayBridgeSupplierMetadata`** con **`mappingConfidence: 'high'`** y prueba unitaria.

**Veredicto:** **GO CONDICIONAL** — el flujo UI→draft→publish opcional y el mapeo por SKU están listos; una **venta eBay real completa** sigue dependiendo de credenciales, entorno y política de publicación.

**Estimación hacia 100% operativo del flujo CJ→eBay end-to-end:** **~92%**.

---

## 2. Estado previo (~82–85%)

- Pipeline único y botones CJ sin selector de variante multi-SKU.
- Un solo botón tipo “draft”; publish principalmente desde Listings.
- Metadata de listing sin campos explícitos `mappingSource` / `supplier` en JSON de draft.
- `supplierMetadata` en Order ya existía pero sin helper testeado de forma aislada.

---

## 3. Qué se implementó

| Área | Detalle |
|------|---------|
| UI | `CjEbayVariantPickerModal` + `cjEbayVariantUtils` (clave y etiqueta por variante) |
| UI | Opportunities: flujo `startCjEbayPipelineFlow` → fetch producto → 1 variante auto / N variantes modal |
| UI | Product Research: misma lógica (`startCjEbayResearchFlow` / `executeCjEbayResearch`) |
| UI | Dos botones: draft (violeta) y publicar (ámbar); feedback según `publishSkippedReason` |
| Backend | `draftPayload` ampliado en `cj-ebay-listing.service.ts` |
| Backend | `marketplace-order-sync-cj-metadata.ts` + uso en `marketplace-order-sync.service.ts` |
| Tests | `marketplace-order-sync-cj-metadata.test.ts` + existentes variant resolution |
| Fix | `executeCjEbayResearch` depende de `region` para ZIP US (evita closure obsoleto) |

---

## 4. Selector de variantes

1. Si **`cjVariantId`** viene en el ítem (futuro pipeline oportunidades), se usa directo.  
2. Si no: **`GET /api/cj-ebay/cj/product/:pid`** (mismo adapter que evaluate).  
3. **0 variantes:** error claro.  
4. **1 variante:** `cjVariantKey(v)` = vid o SKU.  
5. **>1:** modal con `<select>`; al confirmar se envía **`variantId`** al pipeline.

---

## 5. Draft / publish desde UI

- **Crear draft:** `publish: false` en el pipeline.  
- **Publicar en eBay:** `publish: true`; el servidor respeta **`BLOCK_NEW_PUBLICATIONS`** (sin romper el borrador si evaluate+draft OK).  
- Toasts: éxito publicación solo si hay **`publish`** en respuesta y sin `publishSkippedReason` bloqueante; warning si bloqueo global; error si `PUBLISH_FAILED:*`.

La página **`/cj-ebay/listings`** sigue siendo el lugar para publicar/pausar filas ya creadas (comportamiento previo conservado).

---

## 6. Metadata supplier CJ persistida

| Dónde | Contenido |
|-------|-----------|
| `cj_ebay_listings.draftPayload` | `supplier: 'cj'`, `sourceMarketplace: 'cjdropshipping'`, `mappingSource: 'cj_evaluate_listing_draft'`, `mappingConfidence: 'high'`, `cjProductId`, `cjVariantKey`, `cjVid`, `cjSku`, shipping, quote ids, etc. |
| `orders.supplierMetadata` (sync eBay por SKU) | `mappingSource: 'ebay_line_sku_cj_ebay_listing'`, `mappingConfidence: 'high'`, ids CJ, `ebaySku`, quote/eval links |

**Postventa CJ vertical:** sin cambio de contrato; sigue **`cj_ebay_orders`** + importación manual por `ebayOrderId` cuando el SKU matchea (ya documentado en el módulo).

---

## 7. Resultado prueba end-to-end

**Ejecutado en esta pasada (CI local):**

| Prueba | Resultado |
|--------|-----------|
| `npm run type-check` (backend) | OK |
| `npm run build` (frontend) | OK |
| Jest: `cj-ebay-variant-resolution.test.ts` | PASS |
| Jest: `marketplace-order-sync-cj-metadata.test.ts` | PASS |

**No ejecutado aquí:** venta eBay real + webhook/sync en producción (requiere cuentas y datos vivos). La cadena lógica **listing ACTIVE/PAUSED + línea eBay con mismo `ebaySku` → Order con `supplier: 'cj'`** queda cubierta por código y test del helper de metadata; el sync completo necesita payload eBay real o sandbox operado por el equipo.

**Qué faltaría para prueba 100% real:** orden de compra eBay en sandbox/prod contra listing publicado, luego `POST /api/cj-ebay/orders/import` o esperar sync, y ejecutar place/confirm/pay en CJ según runbook.

---

## 8. Archivos modificados / nuevos

**Nuevos**

- `frontend/src/lib/cjEbayVariantUtils.ts`
- `frontend/src/components/cj-ebay/CjEbayVariantPickerModal.tsx`
- `backend/src/services/marketplace-order-sync-cj-metadata.ts`
- `backend/src/__tests__/services/marketplace-order-sync-cj-metadata.test.ts`
- `docs/CJ_EBAY_END_TO_END_CLOSURE_REPORT.md`

**Modificados**

- `frontend/src/pages/Opportunities.tsx`
- `frontend/src/pages/ProductResearch.tsx`
- `backend/src/services/marketplace-order-sync.service.ts`
- `backend/src/modules/cj-ebay/services/cj-ebay-listing.service.ts`

---

## 9. Riesgos residuales

- **Carga extra:** un producto multi-variante implica **GET product** antes del pipeline (latencia + QPS CJ).  
- **Región US:** ZIP fijo `90210` en UI para cotización; otros países pueden requerir configuración explícita.  
- **Dos modelos de orden:** legacy `Order` vs `cj_ebay_orders` — el operador debe saber qué pantalla usar para postventa.  
- **Publish bloqueado:** con `BLOCK_NEW_PUBLICATIONS`, el usuario ve warning pero el borrador puede existir; no es fallo silencioso.

---

## 10. Veredicto final

**GO CONDICIONAL** — listo para operación controlada; validación final con venta simulada/real en el entorno del operador.

---

## 11. Porcentaje hacia 100%

**~92%** del flujo CJ→eBay end-to-end (UI multi-variante, draft, publish opcional, metadata rica, puente Order documentado y testeado en helper). El **8%** restante es principalmente **evidencia en sandbox/producción** (orden eBay real + import + checkout CJ).

---

## 12. Addendum (2026-04-14): credenciales CJ en web

La administración de la **CJ API Key** quedó integrada en **`/api-settings`** (misma capa que eBay/ML), con **test de conexión** y **máscara** en respuestas. Detalle: `docs/CJ_SETTINGS_AND_WEB_OPERATION_REPORT.md`. Esto sube la **operabilidad “desde la web”** del flujo; el porcentaje global del pipeline puede alinearse a **~94%** cuando se combine con validación manual en el entorno del operador.
