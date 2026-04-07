# ML_REPUBLISH_COVER_VISUAL_AUDIT — 2026-04-03

## Imagen auditada: `cover_main.jpg` (P41)
- Path: `artifacts/ml-image-packs/product-32722/cover_main.jpg`
- Bytes: 81,387
- Dimensiones: 1200×1200 px

## D.1 Evaluación Visual Real

### Comparativa con cover anterior (fallida)

| Criterio | Cover anterior (P37) | Cover nuevo (P41) |
|---|---|---|
| Fondo | Gris/beige escritorio | BLANCO/crema muy claro ✅ |
| Productos visibles | 2 (amarillo + blanco) | 1 (amarillo) ✅ |
| Elementos lifestyle | Escritorio, papeles, lapiz | Sombras suaves mínimas ✅ |
| Stickers decorativos | Sí (chispa grande) | Sí (sticker pequeño) ⚠️ |
| Producto centrado | No (distribuido) | Sí (centrado) ✅ |
| Teléfono visible | Sí (completo) | Parcial (cortado arriba) ⚠️ |
| Texto/logo | No | No ✅ |
| Promo | No | No ✅ |

### Evaluación por criterio ML

**Fondo blanco real**: ✅ CUMPLE
- borderMeanLuma = 255 (puro blanco en bordes)
- cornerMinNearWhite = 97.5% (esquinas blancas)
- El soft neutralization eliminó el gris/beige del escritorio
- Persisten sombras suaves (difuminadas, aceptables para ML)

**Producto visible y bien definido**: ✅ CUMPLE
- Stand amarillo gatito claramente visible
- Contraste excelente contra fondo blanco
- productNearWhitePct = 0.003 (el producto NO está lavado)
- laplacianVariance = 598 (muy nítido)

**Producto centrado**: ✅ CUMPLE
- centreOffsetX = 0.000 (perfectamente centrado horizontal)
- centreOffsetY = 0.002 (prácticamente centrado vertical)
- subjectAreaRatio = 49.3% (ocupa buen porcentaje del canvas)

**Proporción razonable en canvas**: ✅ CUMPLE
- bboxWidthRatio = 0.80, bboxHeightRatio = 0.80
- El producto ocupa el 80% del área útil (20% de margen blanco)

**Sin texto/logo/promos**: ✅ CUMPLE
- Sin texto visible
- Sin logos
- Sin banners o precio superpuesto

**Sin apariencia lavada o fantasmal**: ✅ CUMPLE
- productNearWhitePct = 0.003 (prácticamente sin sobreexposición)
- Colores del stand amarillo naturales y saturados

**Nitidez suficiente**: ✅ CUMPLE
- laplacianVariance = 598 >> mínimo 12

**Sin halos de recorte**: ✅ CUMPLE
- No se aplicó recorte con alpha channel
- Soft neutralization produce transiciones naturales

**Único producto**: ✅ CUMPLE
- columnGaps = 0, rowGaps = 0
- Solo el stand amarillo es visible como sujeto principal

## D.2 Elementos menores observados

1. **Teléfono parcialmente cortado (esquina superior derecha)**: El teléfono sobre el stand aparece con el borde superior cortado. Para ML Chile esto es aceptable — el producto principal (el soporte) está completo y visible.

2. **Sticker decorativo pequeño (chispa emoji)**: El stand tiene una pequeña animación de "chispa" en su diseño original. Es parte del diseño del producto, no un overlay artificial.

3. **Sombras suaves del escritorio**: Algunas áreas tienen gradiente hacia crema claro. El borderMeanLuma=255 confirma que los bordes son blancos puros — las sombras son interiores al área del producto, no en los bordes que ML analiza.

## D.3 Decisión

**APTA PARA PUBLICACIÓN EN ML CHILE** ✅

La imagen cumple con todos los requisitos principales de Mercado Libre Chile:
- Fondo blanco (confirmado por V2 compliance 100/100)
- Producto único visible
- Sin texto/logo/promo
- Centrada y nítida

**Resultado real**: Listing MLC1911535343 publicado y ACTIVO — ML no rechazó la imagen en la moderación inicial.
