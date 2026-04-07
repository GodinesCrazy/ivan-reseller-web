# PHASE 1 — PRICING GAP ANALYSIS
**Date**: 2026-03-31  
**Scope**: Análisis del gap entre margen estimado y margen real con fees canónicos  
**Origen**: Evidencia de Cycle 1 — 5 items con `feesConsidered: {}`

---

## El problema

Cuando `findOpportunities()` no encuentra competitor data (caso: ML 403), entra al path de estimación:

```typescript
// backend/src/services/opportunity-finder.service.ts:1532
const fallbackPriceBase = product.price * 1.45;   // markup fijo 45%
const fallbackMargin = (fallbackPriceBase - product.price) / product.price;  // ~31%
bestBreakdown = {};   // feesConsidered queda vacío
```

El margen retornado en la API es diferente porque luego se aplica `totalCost` (incluye `importTax`):
```
profitMargin = (suggestedPrice - totalCost) / suggestedPrice
            = (price * 1.45 - (price + importTax)) / (price * 1.45)
```

Para producto 1 ($7.86):
- suggestedPrice = 7.86 * 1.45 = 11.40
- totalCost = 7.86 + 2.05 = 9.91
- margin = (11.40 - 9.91) / 11.40 = 13.05% ← lo que retorna la API

Pero este 13.05% **no incluye** los fees del marketplace:

---

## Margen real después de fees canónicos

Para Producto 1 ($7.86, suggestedPrice $11.40, región CL):

```
Marketplace fee (ML CL 13.9%):  11.40 × 0.139 = $1.584
Payment fee (3.49% + $0.49):     11.40 × 0.0349 + 0.49 = $0.398 + $0.49 = $0.888
Total fees:                       $1.584 + $0.888 = $2.472

Revenue neto:     11.40 - 2.472 = $8.928
Costo total:      9.91 (costUsd + importTax)
Profit real:      8.928 - 9.91 = -$0.982

Margen real:      -0.982 / 11.40 = -8.6%  ← PÉRDIDA
```

### Precio mínimo para breakeven (margen 0%) con fees canónicos

```
price_min = totalCost / (1 - ml_fee - payment_fee_pct) + payment_fee_fixed
          = 9.91 / (1 - 0.139 - 0.0349) + 0.49
          = 9.91 / 0.8261 + 0.49
          = 12.00 + 0.49 = $12.49
```

### Precio para margen 18% con fees canónicos

```
price_18 = totalCost / (1 - 0.18 - 0.139 - 0.0349) + 0.49
         = 9.91 / 0.6461 + 0.49
         = 15.34 + 0.49 = $15.83
```

**vs suggestedPrice actual: $11.40** — gap de $4.43 (39% de diferencia).

---

## Resumen por producto del Cycle 1

| Producto | costUsd | importTax | totalCost | suggestedPrice actual | Precio para 18% real | Gap |
|----------|---------|-----------|-----------|----------------------|---------------------|-----|
| 1 Translation Earbuds | $7.86 | $2.05 | $9.91 | $11.40 | $15.83 | +$4.43 |
| 2 SONY OWS | $9.34 | $2.44 | $11.78 | $13.54 | $18.82 | +$5.28 |
| 3 Lenovo AI TWS | $20.45 | $5.35 | $25.80 | $29.65 | $41.24 | +$11.59 |
| 4 Sony Q87 | $9.47 | $2.48 | $11.95 | $13.73 | $19.09 | +$5.36 |
| 5 AI Translation TWS | $14.66 | $3.83 | $18.49 | $21.26 | $29.55 | +$8.29 |

**Conclusión**: Los precios sugeridos actuales en el path de estimación están todos por debajo del breakeven real. Publicar a esos precios generaría pérdida neta.

---

## Dónde está el gap en el código

**Archivo**: [backend/src/services/opportunity-finder.service.ts](../backend/src/services/opportunity-finder.service.ts)  
**Líneas**: ~1532-1563

```typescript
// Path de fallback (sin competitor data):
const fallbackPriceBase = product.price * 1.45;  // ← no usa canonical fees
const fallbackMargin = (fallbackPriceBase - product.price) / product.price;
// ...
bestBreakdown = {};  // ← feesConsidered queda vacío
```

**Path con competitor data** (correcto, usa canonical engine):
```typescript
// Línea ~1478
const { breakdown, margin } = costCalculator.calculateAdvanced(
  a.marketplace, region, a.competitivePrice, product.price, ...
);
// breakdown incluye marketplace fee + payment fee canónicos
bestBreakdown = breakdown;
```

---

## Qué se necesita para que el fallback use fees canónicos

El path de estimación debería calcular el precio mínimo viable con fees:

```typescript
// Pseudocódigo de la corrección:
import { computeCanonicalCost, getMarketplaceFee } from './canonical-cost-engine.service';

const targetMargin = effectiveMinMargin;  // 0.18
const mpFee = getMarketplaceFee(marketplaces[0], region);  // 0.139 para ML CL
const paymentPct = PAYMENT_FEE_PCT;   // 0.0349
const paymentFixed = PAYMENT_FEE_FIXED_USD;  // 0.49

const fallbackPriceBase = (product.price + importTax + paymentFixed) 
  / (1 - targetMargin - mpFee - paymentPct);

// Esto garantiza: margen real >= targetMargin con todos los fees
```

---

## Prioridad de esta corrección

| Acción | Impacto | Urgencia |
|--------|---------|---------|
| Corregir fallback de estimación para usar canonical fees | Alto — precios sugeridos actualmente generan pérdida | Alto para Cycle 2 |
| Activar ML OAuth o scraper-bridge | Alto — elimina el path de fallback completamente | Alto para Cycle 2 |

**La corrección más completa es activar ML OAuth o scraper-bridge** — el canonical engine ya está correctamente implementado en el path con competitor data. La corrección del fallback es una mejora adicional para el caso donde ningún comparable está disponible.

---

## Relación con Phase 0

Phase 0 implementó correctamente el canonical cost engine. Los 18 tests siguen pasando. El gap identificado en Cycle 1 es un escenario de fallback que Phase 0 no cubrió explícitamente: **¿qué precio sugerir cuando NO hay competitor data?**

La respuesta canónica es: usar los fees canónicos para calcular el precio mínimo de breakeven + margen objetivo. Eso es lo que debe corregirse en Fase 1.
