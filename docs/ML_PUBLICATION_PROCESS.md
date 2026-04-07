# Proceso Completo de Publicación en Mercado Libre Chile
**Fecha:** 2026-04-04  
**Estado:** Validado en producción — MLC3838127822 activo

---

## Visión General

Cada artículo que entra al sistema debe pasar por este flujo antes de ser visible en ML Chile. Saltarse cualquier paso puede resultar en listings rechazados, bajo rendimiento, o banning del seller.

```
[Proveedor AliExpress]
        ↓
  1. INGESTA DE DATOS
        ↓
  2. PROCESAMIENTO DE IMÁGENES (AI bg removal)
        ↓
  3. VALIDACIÓN DE PACK
        ↓
  4. DATOS DE LISTING (precio, categoría, atributos)
        ↓
  5. PUBLICACIÓN
        ↓
  6. VERIFICACIÓN POST-PUBLISH
        ↓
  7. CICLO POST-VENTA (órdenes, fulfillment, tracking)
```

---

## PASO 1 — Ingesta de Datos del Proveedor

**Qué se obtiene:**
- `title` — título del producto (se sanitiza para ML: sin caracteres especiales, max 60 chars)
- `description` — descripción
- `images[]` — URLs de imágenes del proveedor (AliExpress CDN)
- `aliexpressPrice` (USD) — precio de costo
- `aliexpressSku` / `productId` — para hacer el pedido al dropshippear

**Regla:** Las URLs de imágenes del proveedor son SOLO para procesamiento interno. Nunca se publican directamente en ML.

---

## PASO 2 — Procesamiento de Imágenes (CRÍTICO)

**Servicio:** `backend/src/services/ml-portada-bg-removal.service.ts`  
**Script de referencia:** `backend/scripts/p49-process-all-images-clean.ts`

### Pipeline por imagen (Phase 0 AI bg removal):

```
URL AliExpress
    → fetchImageBuffer()          — descarga
    → sharp(buf).png()            — normaliza a PNG
    → new Blob([new Uint8Array(pngBuf)], { type: 'image/png' })
    → @imgly/background-removal-node (ONNX model: 'small')  — elimina fondo
    → trimAlpha()                 — recorta al bounding box del producto (alpha > 10)
    → sharp.resize(960, 960, { fit: 'inside' })  — escala SIN distorsión
    → canvas 1200×1200 blanco puro, producto centrado  — compose
    → JPEG q92                    — output final
```

### Reglas críticas de imagen:
| Regla | Por qué |
|-------|---------|
| Procesar TODAS las imágenes fuente | Una sola imagen = listing débil |
| `fit: 'inside'` siempre | `fit: 'fill'` distorsiona el producto |
| Canvas 1200×1200 blanco puro (#FFFFFF) | Requisito ML para portada |
| Gate: whitePct < 97% | Si >97% blanco = producto invisible, descartar |
| **NUNCA publicar URL raw de AliExpress** | ML detecta watermarks/logos → `under_review` → `inactive` → bloqueado permanente |

### Selección automática de portada:
- Calcular `whitePct` de cada imagen procesada
- Ordenar ASC por whitePct → **menor % blanco = más producto visible = mejor portada**

### Output:
- Archivos locales en `artifacts/ml-image-packs/product-{id}/gallery/`
- `img_0_processed.jpg`, `img_1_processed.jpg`, etc.
- El de menor whitePct va primero (portada)

---

## PASO 3 — Validación del Asset Pack

**Servicio:** `backend/src/services/mercadolibre-image-remediation.service.ts`  
**Función:** `inspectMercadoLibreAssetPack({ productId })`

Verificar que:
- `packApproved === true`
- Al menos 1 asset con `approvalState === 'approved'`
- `cover_main` asset existe y está aprobado

Si Phase 0 (ONNX) falla en todas las imágenes → el sistema cae automáticamente a Phase 1/2/3 (soft neutralization) como fallback.

---

## PASO 4 — Datos del Listing

### Precio:
```
precioAliexpress (USD) → markup × tipo_cambio → CLP
```
- Markup sugerido: 2.5x–3x sobre precio AliExpress
- El precio en ML debe estar en **CLP**
- Verificar que el margen cubra: costo AliExpress + shipping (~$4–8 USD) + comisión ML (~13%)

### Categoría:
- Obtener via `mlService.predictCategory(title, description)` → devuelve `categoryId`
- Verificar atributos requeridos de esa categoría en ML API:  
  `GET /categories/{category_id}/attributes?channel=marketplace`
- Los atributos `BRAND` y `MODEL` son requeridos en la mayoría de categorías

### Atributos obligatorios (mínimo):
```ts
attributes: [
  { id: 'BRAND', value: 'Genérico' },  // o marca real si se conoce
  { id: 'MODEL', value: 'descripción corta del modelo' },
]
```

### Shipping (dropshipping):
```ts
shipping: { mode: 'me2', freeShipping: false, handlingTime: 25 }
// handlingTime: 25 días = realista para dropshipping AliExpress → Chile
```

---

## PASO 5 — Publicación

**Método:** `mlService.createListing(mlProduct)` — solo para listings nuevos  
**Método actualización:** `mlService.replaceListingPictures(listingId, localPaths)` — para actualizar imágenes de listing existente

### Checklist pre-publish:
- [ ] Todas las imágenes procesadas por AI bg removal (locales, no URLs raw)
- [ ] `cover_main` es la imagen con menor whitePct
- [ ] Precio calculado y validado
- [ ] `categoryId` verificado
- [ ] Atributos `BRAND` y `MODEL` incluidos
- [ ] `shipping.handlingTime = 25` (honesto para dropshipping)
- [ ] No existe otro listing `active` para este producto en ML API (deduplication guard)

### Llamada:
```ts
const result = await mlSvc.createListing({
  title,           // sanitizado, max 60 chars
  description,
  categoryId,
  price,           // en CLP
  quantity: 10,
  condition: 'new',
  images: approvedLocalPaths,   // rutas locales SOLO
  shipping: { mode: 'me2', freeShipping: false, handlingTime: 25 },
  attributes: [
    { id: 'BRAND', value: 'Genérico' },
    { id: 'MODEL', value: '...' },
  ],
});
```

---

## PASO 6 — Verificación Post-Publish

Inmediatamente después de crear el listing:

```ts
const status = await axios.get(`https://api.mercadolibre.com/items/${listingId}`, {
  headers: { Authorization: 'Bearer ' + token }
});
```

### Estados esperados:
| status | sub_status | Acción |
|--------|-----------|--------|
| `active` | `[]` | ✅ Perfecto — listing listo |
| `active` | `["poor_quality_thumbnail"]` | ⚠️ Portada rechazada — regenerar con imagen diferente |
| `under_review` | cualquier | 🚨 ML moderation — causado por imágenes con watermarks/logos. Cerrar y republicar con imágenes limpias |
| `inactive` | `["not_modifiable"]` | 🚨 Bloqueado permanente — crear listing NUEVO, no recuperable |

### Acción si listing queda bloqueado:
1. `prisma.marketplaceListing.updateMany({ data: { status: 'superseded' } })` — marcar viejos como superseded
2. Crear listing nuevo con `createListing` — imágenes limpias únicamente
3. Nunca intentar `PUT status=active` en un listing `under_review` o `inactive`

---

## PASO 7 — Ciclo Post-Venta

Una vez que hay un pedido (`PAID`):

```
ML Order Sync (BullMQ, cada 10 min)
    → detecta orden nueva en ML API
    → crea registro en DB (status: PAID)
    → dispara fulfillment automático

Fulfillment:
    → busca SKU AliExpress del producto
    → compra en AliExpress DS API (setOrder)
    → actualiza status: PURCHASED

Tracking sync:
    → polling AliExpress por tracking number
    → cuando disponible: PUT /items/{id}/orders/{orderId}/feedback en ML
    → actualiza status: SHIPPED
```

**Credenciales requeridas:**
- ML: `accessToken`, `refreshToken`, `userId`, `siteId=MLC`
- AliExpress DS API: `appKey`, `appSecret`, `accessToken`, `refreshToken`

---

## Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|---------|
| "Unsupported format: " en ONNX | Buffer sin MIME type | `new Blob([new Uint8Array(pngBuf)], { type: 'image/png' })` |
| `item.attributes.missing_required: BRAND, MODEL` | Categoría requiere atributos | Agregar `attributes: [{id:'BRAND',...},{id:'MODEL',...}]` |
| `item.status.not_modifiable` | Listing bloqueado por ML moderation | Crear listing nuevo — no recuperable |
| Portada con producto distorsionado | `fit: 'fill'` en resize | Usar `fit: 'inside'` siempre |
| Portada >95% blanco (producto invisible) | ONNX eliminó demasiado / imagen mala | Probar con otra imagen fuente |
| Listing `under_review` | Imágenes raw con watermarks/logos | Cerrar listing, republicar con solo imágenes AI bg removal |

---

## Archivos de Referencia Rápida

| Función | Archivo |
|---------|---------|
| AI bg removal pipeline | `backend/src/services/ml-portada-bg-removal.service.ts` |
| Asset pack + remediation | `backend/src/services/mercadolibre-image-remediation.service.ts` |
| ML service (createListing, replacePictures) | `backend/src/services/mercadolibre.service.ts` |
| Script procesar todas imágenes + actualizar listing | `backend/scripts/p49-process-all-images-clean.ts` |
| Script publicar listing limpio | `backend/scripts/p48-publish-clean-ai-listing.ts` |
| Script verificar estado listing | `backend/scripts/p48b-verify-new-listing.ts` |
