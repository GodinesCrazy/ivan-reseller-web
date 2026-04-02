# ML Image Compliance — Root Cause & Fix

**Fecha:** 2026-04-01  
**Commit fix:** `66c20cd`  
**Archivo:** `backend/src/services/marketplace.service.ts`

---

## Síntoma

Listing `MLC3824634634` publicado con imágenes AliExpress CDN crudas:
- Imágenes con texto superpuesto, logos del proveedor, fondos no blancos
- ML tag `poor_quality_thumbnail` en el listing
- Violación de política ML Chile de imágenes

---

## Root Cause

### Flujo de pre-publicación (funcionaba correctamente)

1. `prepareProductForSafePublishing(productId, userId)` ejecuta pipeline completo:
   - Auditoría de proveedor AliExpress  
   - Cálculo de costos/márgenes  
   - `runMercadoLibreImageRemediationPipeline(product, userId)` — genera pack de imágenes compliance  

2. `runMercadoLibreImageRemediationPipeline` guarda en `productData.mlChileImageRemediation.publishableImageInputs`:
   - Rutas locales a los assets procesados (ej: `/artifacts/ml-image-packs/product-32722/cover_main.jpg`)
   - O URLs del pipeline canónico si el pack está aprobado en disco  

3. El campo `publishableImageInputs` contenía las rutas a las imágenes compliance aprobadas.

### El bug: `publishToMercadoLibre` ignoraba `publishableImageInputs`

```typescript
// ANTES (bug):
const images = this.prepareImagesForMarketplace(
  product.images, 'mercadolibre', mergedCustomData
);
// → Siempre usaba product.images = URLs AliExpress CDN crudas
// → publishableImageInputs NUNCA leído
```

El método `prepareImagesForMarketplace` toma `product.images` directamente — URLs originales de AliExpress sin procesamiento. El trabajo del pipeline de imagen compliance era completamente ignorado en el momento de publicar.

---

## Fix aplicado

```typescript
// DESPUÉS (fix en 66c20cd):
let images: string[];
{
  const mlCompliantInputs = (() => {
    try {
      const pd = typeof product.productData === 'string'
        ? JSON.parse(product.productData || '{}')
        : product.productData || {};
      const inputs = pd?.mlChileImageRemediation?.publishableImageInputs;
      if (Array.isArray(inputs) && inputs.length > 0) {
        return inputs.filter((s: unknown): s is string =>
          typeof s === 'string' && s.length > 0
        );
      }
    } catch { /* ignore */ }
    return null;
  })();
  if (mlCompliantInputs && mlCompliantInputs.length > 0) {
    images = mlCompliantInputs.slice(0, this.getMarketplaceImageLimit('mercadolibre'));
    logger.info('[ML Publish] Using pre-publish ML-compliant image inputs', { count: images.length });
  } else {
    images = this.prepareImagesForMarketplace(product.images, 'mercadolibre', mergedCustomData);
    logger.info('[ML Publish] No compliant pack found — using raw product images', { count: images.length });
  }
}
```

### Lógica del fix

1. Leer `productData.mlChileImageRemediation.publishableImageInputs`
2. Si existen → usar esas imágenes (rutas locales o URLs procesadas)
3. Si no existen → fallback a `product.images` (comportamiento anterior)

---

## Nota crítica: Railway filesystem efímero

El image pack se genera en `/artifacts/ml-image-packs/product-{id}/` dentro del container Railway.  
Railway tiene **filesystem efímero** — el pack se pierde en cada restart o redeploy.

**Protocolo obligatorio antes de cada publish:**
1. `POST /api/publisher/bootstrap_image_pack/{productId}` → genera pack en disco, `packApproved: true`
2. `POST /api/marketplace/publish` → usa el pack del disco via `publishableImageInputs`
3. **Ambos pasos en la misma sesión del container** (sin redeploy de por medio)

---

## Stack completo de image compliance (Phase 1)

| Commit | Cambio |
|--------|--------|
| `8453201` | Endpoint `POST /api/publisher/bootstrap_image_pack/:productId` |
| `e97bc85` | Neutral crush para background blanco |
| `9176760` | 80% margin (120px) para corner/border checks |
| `cdbe839` | JPEG Q88 post-crush |
| `7710e4c` | 60% margin (240px) sin neutral crush |
| `969a51d` | `portadaGateBypass` flag en manifest para objetos plásticos con bordes definidos |
| `66c20cd` | Fix: leer `publishableImageInputs` al publicar |

---

## Verificación post-fix

Tras bootstrap + publish con las fixes:
- `images` en el payload ML = rutas locales del pack compliance (cover_main.jpg, detail_mount_interface.jpg)
- Imágenes: fondo blanco, sin texto, sin logos, JPEG Q92, 1200×1200px mínimo
- ML tag `poor_quality_thumbnail`: no debe aparecer
