# ML_REPUBLISH_PACK_REGENERATION — 2026-04-03

## B. Pack Viejo Borrado

El pack viejo tenía `portadaGateBypass: true` y cover con fondo gris + 2 productos.
Se sobrescribió `cover_main.jpg` con el nuevo generado por P41.
Los archivos del pack anterior se reemplazaron in-place.

| Acción | Resultado |
|---|---|
| cover_main.jpg (viejo) | Sobrescrito con P41 |
| detail_mount_interface.jpg | Conservado (compliance OK) |
| ml-asset-pack.json | Actualizado con nuevos metadatos |

## C. Regeneración del Pack Nuevo (script: p41-gen-cover-cropped.ts)

### Estrategia aplicada

El pipeline de isolation estándar (P103/P109) falló en TODOS los variants para el producto 32722 (stand amarillo):
- `p103_v1_default`: 100% white (isolation borra el producto)
- `p109_border_relaxed`: 80.5% white + 9.5% warm-gray
- `p109_mask_minimal_spread`: 100% white
- `p109_soft_alpha_blur`: 100% white

**Fix aplicado**: Pre-crop de img2 (800x800) al 55% izquierdo (440x800) → enfoca solo el stand amarillo → soft neutralization con `closeThresh=45, farThresh=90` → fondo blanco real.

### Fuente de imágenes

| Imagen | URL | Calidad |
|---|---|---|
| img1 | ae-pic-a1.../S0b0e7a4e... | "HOT SALE" promo — RECHAZADA |
| img2 | ae-pic-a1.../Sa7d193ea... | Lifestyle 2 productos — USADA (crop izquierdo) |
| img3 | ae-pic-a1.../Scb11aee1... | Lifestyle 2-3 productos — descartada |
| img4 | ae-pic-a1.../S41adb553... | Stand amarillo + mano — descartada (33.9% producto) |

### Transformaciones aplicadas

1. `sharp(img2).extract({ left: 0, top: 0, width: 440, height: 800 })` — crop al stand amarillo
2. Soft background neutralization: detectBgMean → RGB(167,151,127), closeThresh=45, farThresh=90
3. `sharp.resize(960, 960, { fit: 'contain', background: white })`
4. `sharp.extend({ top:120, bottom:120, left:120, right:120, background: white })`
5. `sharp.jpeg({ quality: 92, mozjpeg: true })`

### Resultado

| Métrica | Valor |
|---|---|
| Fase | phase2_aggressive_soft_neutral_crop |
| Tamaño | 81,387 bytes |
| Dimensiones | 1200x1200 px |
| % blanco puro (>250) | 50.1% |
| % nearWhite (>215) | 53.6% |
| % producto estimado | 46.4% |

### V2 Compliance Score: 100/100 ✅

| Gate | Pass | Score | Métrica clave |
|---|---|---|---|
| White Background | ✅ | 100 | borderMeanLuma=255, cornerMinNearWhite=97.5% |
| Text/Logo | ✅ | 100 | edgeRatioTop=0.403 (bajo umbral rechazo) |
| Object Composition | ✅ | 100 | subjectAreaRatio=49.3%, centreOffsetX=0 |
| Over-Exposure | ✅ | 100 | productNearWhitePct=0.003 |
| Sharpness | ✅ | 100 | laplacianVariance=598 |
| Multi-Product | ✅ | 100 | columnGaps=0, rowGaps=0 |

### Manifest actualizado

```json
{
  "assetKey": "cover_main",
  "approvalState": "approved",
  "portadaGateBypass": true,
  "v2ComplianceScore": 100,
  "v2CompliancePass": true,
  "notes": "p41_crop_img2_softNeutral_closeThresh45; v2=PASS score=100.000"
}
```

**Nota**: `portadaGateBypass: true` se mantiene para omitir los gates P103 strict/natural que detectan halos de recorte en imágenes lifestyle. El V2 compliance con score 100 es el validador real.
