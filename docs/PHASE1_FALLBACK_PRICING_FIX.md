# PHASE 1 — FALLBACK PRICING FIX
**Date**: 2026-03-31  
**Commit**: `4263a45`  
**Status**: ✅ Implementado, testeado, desplegado en Railway

---

## Problema corregido

Cuando `findOpportunities()` no encontraba competitor data (caso: `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN`), el path de fallback calculaba el precio sugerido como `product.price * 1.45` — un markup fijo del 45% sin considerar fees del marketplace.

**Resultado del bug en Cycle 1**:
- `feesConsidered: {}` vacío en todos los items
- Margen estimado por API: ~13%
- Margen real después de fees ML (13.9%) + payment (3.49%+$0.49) + duties: **negativo (~-8.6%)**
- Publicar a esos precios generaba pérdida neta garantizada

---

## Corrección implementada

**Archivo**: [backend/src/services/opportunity-finder.service.ts](../backend/src/services/opportunity-finder.service.ts)

### Import añadido (línea 35)
```typescript
import { computeMinimumViablePrice } from './canonical-cost-engine.service';
```

### Bloque fallback antes (bug)
```typescript
// ❌ BUG: Precio heurístico sin fees canónicos
const fallbackPriceBase = product.price * 1.45;
const fallbackMargin = (fallbackPriceBase - product.price) / product.price;
// ...
bestBreakdown = {};  // feesConsidered queda vacío
```

### Bloque fallback después (fix)
```typescript
// ✅ FIX: Precio mínimo viable con canonical cost engine
const targetMarginPct = effectiveMinMargin * 100;
const fallbackMp = (marketplaces[0] || 'mercadolibre') as 'ebay' | 'amazon' | 'mercadolibre';
const canonicalFallback = computeMinimumViablePrice({
  supplierPriceRaw: product.price,
  supplierCurrency: baseCurrency,
  saleCurrency: baseCurrency,
  shippingToCustomerRaw: productShippingCost,
  marketplace: fallbackMp,
  region: (region || 'us').toUpperCase(),
  targetMarginPct,
});

const fallbackPriceBase = canonicalFallback.minSalePriceUsd;
const netProfit = fallbackPriceBase - canonicalFallback.breakdown.totalCostUsd;
const fallbackMargin = fallbackPriceBase > 0 ? netProfit / fallbackPriceBase : 0;

// bestBreakdown ahora contiene fees auditables
bestBreakdown = {
  marketplaceFee: canonicalFallback.breakdown.marketplaceFeeUsd,
  paymentFee: canonicalFallback.breakdown.paymentFeeUsd,
  importDuties: canonicalFallback.breakdown.importDutiesUsd,
  supplierCost: canonicalFallback.breakdown.supplierCostUsd,
  shippingToCustomer: canonicalFallback.breakdown.shippingToCustomerUsd,
  totalCost: canonicalFallback.breakdown.totalCostUsd,
};
```

---

## Garantías del fix

| Garantía | Antes | Después |
|----------|-------|---------|
| `feesConsidered` no vacío | ❌ `{}` siempre | ✅ Breakdown completo |
| Marketplace fee incluido | ❌ No | ✅ ML CL: 13.9% |
| Payment fee incluido | ❌ No | ✅ 3.49% + $0.49 |
| Import duties incluidos | ❌ No | ✅ IVA 19% + arancel 6% (CL) |
| Margen real ≥ target | ❌ Negativo | ✅ ≥ MIN_OPPORTUNITY_MARGIN |
| Log con breakdown completo | ❌ Solo heurístico | ✅ Todos los campos |

---

## Efecto en precios (Cycle 1 → Cycle 2)

| Producto | Cycle 1 suggestedPrice | Cycle 2 suggestedPrice | Δ |
|----------|----------------------|----------------------|---|
| Translation Earbuds ($7.86) | $11.40 (−8.6% real) | $13.94 (+28.9% canónico) | +$2.54 |
| SONY OWS ($9.34) | $13.54 (−8.7% real) | $16.45 (+28.4% canónico) | +$2.91 |
| Lenovo AI TWS ($20.45) | $29.65 (−2.8% real) | $35.24 (+26.8% canónico) | +$5.59 |

---

## Tests

**Archivo**: [backend/src/__tests__/services/phase1-fallback-pricing.test.ts](../backend/src/__tests__/services/phase1-fallback-pricing.test.ts)  
**Resultado**: 24/24 pass

Tests incluyen:
- Prueba del bug: los 5 productos de Cycle 1 tenían margen real negativo con `price * 1.45`
- Precio canónico ≥ 18% margen real en todos los casos
- Precio canónico > precio heurístico en todos los casos
- `breakdown` no vacío — marketplace fee, payment fee, duties, supplierCost no-cero
- ML CL fee = 13.9% correctamente aplicado
- Payment fee = 3.49% + $0.49 correctamente aplicado
- `minSalePrice > 0` para cualquier precio de proveedor válido

---

## Relación con canonical cost engine (Phase 0)

El canonical cost engine (`computeMinimumViablePrice`) ya existía y era correcto — los 18 tests de Phase 0 siguen pasando. El gap era que el path de fallback en opportunity-finder no lo usaba. Esta corrección cierra ese gap.

---

## Estado en producción

- Commit `4263a45` desplegado en Railway
- Build activo confirmado: `/ready` → `build.gitSha: "4263a45"`
- Cycle 2 ejecutado con el fix activo — ver `PHASE1_CYCLE2_REPORT.md`
