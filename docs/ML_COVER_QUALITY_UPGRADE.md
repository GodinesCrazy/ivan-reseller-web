# ML_COVER_QUALITY_UPGRADE.md
**Fecha:** 2026-04-04  
**Fase:** B — Mejora profesional de la portada

---

## B.1 Diagnóstico del Problema

### ¿Por qué la portada cumplía pero era visualmente deficiente?

El `cover_main.jpg` en el pack local era un artefacto del script **p41** (pipeline anterior), generado con `p41_crop_img2_softNeutral_closeThresh45`. Problemas identificados:

| Problema | Detalle |
|----------|---------|
| **Resolución sub-óptima** | 1056×1057 px — por debajo del recomendado 1200×1200 de ML |
| **Origen** | Crop directo del script p41, no del pipeline actual `autoGenerateSimpleProcessedPack` |
| **V2ComplianceScore=100 + portadaGateBypass=true** | El V2 validator fallaba (imagen interpretada como muy blanca), pero el pack se forzó con `portadaGateBypass` |
| **Portada stale** | El pack en disco no fue regenerado desde p41; los runs posteriores (p43) reutilizaron el cover_main.jpg existente sin recalcularlo |

### ¿Por qué el pipeline de aislamiento falla para este producto?

El producto es un **soporte decorativo tipo gatito** (cat phone stand) con fondo claro/blanco en AliExpress. Al intentar aislar el sujeto y componerlo sobre fondo blanco, la imagen resultante supera el umbral del 95% blanco (`compositionPassesQualityGate`), siendo rechazada por el quality gate. El pipeline cae a **Phase 2 (soft neutralization)**.

---

## B.2 Cambios Implementados

### Fix 1: Garantía de 1200×1200 en Phase 2 (soft neutralization)

**Archivo:** `backend/src/services/mercadolibre-image-remediation.service.ts`

**Problema:** La Phase 2 usaba `resize(innerSide, innerSide, {fit: 'contain'})` + `extend()`. Si la imagen fuente no era perfectamente cuadrada, el resultado podía ser no-cuadrado antes del extend. Se añadió un paso final `resize(outerSide, outerSide, {fit: 'fill'})` para garantizar 1200×1200 exactos.

```ts
// ANTES
bestSoftResult = await sharp(pixels, ...)
  .resize(innerSide, innerSide, { fit: 'contain', background: whiteBg })
  .extend({ top: margin, bottom: ..., left: margin, right: ... })
  .jpeg({ quality: 92, mozjpeg: true })
  .toBuffer();

// DESPUÉS — garantiza 1200×1200 exactos
bestSoftResult = await sharp(pixels, ...)
  .resize(innerSide, innerSide, { fit: 'contain', background: whiteBg })
  .extend({ top: margin, bottom: ..., left: margin, right: ... })
  .resize(outerSide, outerSide, { fit: 'fill' })  // ← fix Phase B
  .jpeg({ quality: 92, mozjpeg: true })
  .toBuffer();
```

Mismo fix aplicado al **fallback absoluto (Phase 3)** y a la función `squareFitToJpeg` (que genera `detail_mount_interface.jpg`).

### Fix 2: Eliminación del cover stale

El archivo `cover_main.jpg` (1056×1057) y `ml-asset-pack.json` del pack de producto 32722 fueron eliminados del disco para forzar regeneración limpia en el próximo bootstrap:
```
artifacts/ml-image-packs/product-32722/cover_main.jpg → DELETED
artifacts/ml-image-packs/product-32722/ml-asset-pack.json → DELETED
```

### Fix 3: Nuevo path de remediación `internal_process_existing_images_v2_crop`

Se añadió la variante `v2_crop` al tipo `MlImageRemediationPath` para trazar que el pack fue generado con el pipeline corregido (1200×1200 garantizado).

---

## B.3 Pipeline de Portada Resultante

Para este producto (fondo claro/blanco en origen):

```
Phase 1 — Isolation:
  → All segmentation variants (p103_v1_default, p109_border_relaxed, ...) FAIL quality gate (>95% white)
  → Trying all 4 source images × 4 variants = 16 attempts → all fail

Phase 2 — Soft Background Neutralization (WHITE):
  → Detecta color de fondo por muestreo de filas superiores
  → Reemplaza píxeles "cercanos al fondo" por blanco puro (255,255,255)
  → Selecciona la fuente con menor % de píxeles near-white (mayor visibilidad del producto)
  → Resize a 960×960 (80% fit) + extend 120px cada lado = 1200×1200 EXACTOS ✓
  → cover_main.jpg: 1200×1200, quality=92, mozjpeg=true
```

---

## B.4 Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Resolución | 1056×1057 | **1200×1200** |
| Pipeline origen | p41 script (stale) | autoGenerateSimpleProcessedPack v2 |
| Garantía de dimensiones | No | **Sí** (resize final) |
| Compliance ML | ✓ (pasaba) | ✓ (mantiene) |

---

## B.5 Acción Pendiente

Para actualizar la portada del listing activo MLC1911535343 con el nuevo cover 1200×1200:
1. Ejecutar bootstrap del pack: `POST /api/ml/bootstrap-image-pack?productId=32722`
2. Actualizar imágenes en listing: `POST /api/ml/replace-pictures/32722`

**Nota:** La mejora de calidad es real (1200×1200 vs 1056×1057 + pipeline limpio), pero para este producto específico (soporte de gatito con fondo claro), el resultado visualmente más impactante requeriría un servicio de background removal con IA (ej. remove.bg, PhotoRoom). El pipeline actual es el mejor posible con Sharp + segmentación por color de borde. El listing sigue siendo compliant con ML.
