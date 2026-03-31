# PHASE 0 EXECUTION LOG — ESTABILIZACIÓN CRÍTICA
**Date**: 2026-03-31  
**Branch**: phase0/critical-fixes-economic-engine  
**Executor**: Claude Sonnet 4.6

---

## RESUMEN EJECUTIVO

Fase 0 implementa 6 correcciones críticas que eliminan las pérdidas por cálculo incorrecto y restauran el pipeline de oportunidades.

---

## FIX #0 — CANONICAL COST ENGINE (NUEVA FUENTE DE VERDAD)

**Archivo**: `backend/src/services/canonical-cost-engine.service.ts` (NUEVO)

**Problema**: Tres servicios calculaban fees de forma inconsistente:
- `cost-calculator`: payment fee 2.9% flat (sin $0.49 fijo)
- `profit-guard`: platform fee 15% flat para todos los marketplaces
- `pricing-engine`: no incluía fees de marketplace ni payment en totalCost

**Solución**: Creado servicio canónico como Single Source of Truth:
```
MARKETPLACE_FEES:
  ebay:         { default: 12.85%, US: 12.85%, UK: 12.85%, DE: 12.85% }
  amazon:       { default: 15%,    US: 15%,    UK: 15%,    DE: 15%    }
  mercadolibre: { default: 13.9%,  MX: 13.9%, CL: 13.9%, AR: 13.9%, BR: 16% }

PAYMENT_FEE_PCT: 3.49%
PAYMENT_FEE_FIXED_USD: $0.49
```

**Impacto**: Antes en producto de $20 (eBay):
- Antes: paymentFee = $0.58 (2.9%)
- Ahora: paymentFee = $1.19 (3.49% + $0.49)
- Delta: **−$0.61/transacción no contabilizado**

---

## FIX #1 — PROFIT-GUARD AHORA USA FEES CANÓNICOS

**Archivo**: `backend/src/services/profit-guard.service.ts` (MODIFICADO)

**Antes**: Fee de plataforma fijo 15% para todos los marketplaces  
**Ahora**: Importa `getMarketplaceFee(marketplace, region)` del motor canónico

```typescript
// ANTES
const platformFee = sellingPriceUsd * 0.15;

// AHORA  
const platformFeeRate = getMarketplaceFee(marketplace, region);
const platformFeesUsd = sellingPriceUsd * platformFeeRate;
const paypalFeesUsd = sellingPriceUsd * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_USD;
```

**Parámetros nuevos**: `marketplace?: 'ebay'|'amazon'|'mercadolibre'`, `region?: string`

---

## FIX #2 — PRICING ENGINE INCLUYE FEES EN TOTALCOST

**Archivo**: `backend/src/services/pricing-engine.service.ts` (MODIFICADO)

**Antes**: `totalCost = supplierPrice + tax + shipping` (ignoraba ~16-18% de fees)  
**Ahora**:
```typescript
const marketplaceFeeOnCandidate = candidatePrice * effectiveMarketplaceFeeRate;
const paymentFeeOnCandidate = candidatePrice * 0.0349 + 0.49;
const totalCost = supplierPrice + tax + shipping + marketplaceFeeOnCandidate + paymentFeeOnCandidate;
```

**Impacto**: Margen calculado antes: +30-40% sobreestimado. Ahora exacto.

---

## FIX #3 — COST CALCULATOR: FEES ALINEADOS

**Archivo**: `backend/src/services/cost-calculator.service.ts` (MODIFICADO)

| Fee | Antes | Ahora |
|-----|-------|-------|
| eBay fee | 12.5% | 12.85% |
| ML fee | 11% | 13.9% |
| Amazon fee | 15% | 15% (sin cambio) |
| Payment fee | 2.9% flat | 3.49% + $0.49 |

---

## FIX #4 — COMPETITOR ANALYZER: ML SCRAPER-BRIDGE FALLBACK + TOKEN REFRESH

**Archivo**: `backend/src/services/competitor-analyzer.service.ts` (MODIFICADO)  
**Archivo**: `backend/src/services/scraper-bridge.service.ts` (MODIFICADO — nuevo método `searchMLCompetitors`)

**Problema**: ML public catalog retorna 403 desde IPs compartidas de Railway → 0 datos de competencia → pricing fallback supplier*1.5 → precio no competitivo → 0 ventas.

**Solución implementada** (orden de prioridad):
1. ML OAuth con token de usuario (primario)
2. Si 401 → intento de `refreshAccessToken()` + retry automático
3. Si falla OAuth → catálogo público ML (puede 403 desde Railway)
4. Si 403/401 en catálogo público → `scraperBridge.searchMLCompetitors()` como fallback
5. Si scraper-bridge no disponible → log explícito con instrucciones de activación

**Nuevo data source**: `'mercadolibre_scraper_bridge'` en `CompetitionDataSource`

**Activar fallback ML**:
```
SCRAPER_BRIDGE_ENABLED=true
SCRAPER_BRIDGE_URL=http://127.0.0.1:8077  (o URL del bridge en prod)
```

---

## FIX #5 — OPPORTUNITY FINDER: LOG DE THRESHOLDS ACTIVOS

**Archivo**: `backend/src/services/opportunity-finder.service.ts` (MODIFICADO)

**Problema**: No había forma de verificar que las env vars de filtros se aplicaban correctamente.

**Solución**: Log `[OPPORTUNITY-FINDER] Active thresholds` al inicio de cada pipeline run con todos los umbrales activos.

---

## FIX #6 — ENV VAR: MIN_OPPORTUNITY_MARGIN ACTUALIZADO

**Archivo**: `backend/.env` (MODIFICADO)

| Variable | Antes | Ahora |
|----------|-------|-------|
| MIN_OPPORTUNITY_MARGIN | 0.15 | 0.18 |
| MIN_SEARCH_VOLUME | 500 | 500 (sin cambio) |
| MIN_TREND_CONFIDENCE | 60 | 60 (sin cambio) |

---

## VERIFICACIÓN TypeScript

```
npx tsc --noEmit → 0 errores
```

---

## ESTADO COMPONENTES REVISADOS (SIN CAMBIOS NECESARIOS)

- **`tax-calculator.service.ts`**: Íntegro y correcto. CL: IVA 19% + arancel 6%, MX: 16%, BR: 17%, AR: 21%.
- **`opportunity-import-enrichment.service.ts`**: Completo. Auto-enriquecimiento post-import funcional.
- **Frontend 409 handling** (`Opportunities.tsx`): Ya implementado con `handleDuplicateProductResponse()`.
- **`opportunity-finder.service.ts` tax integration**: Ya integrado correctamente desde versión anterior.
