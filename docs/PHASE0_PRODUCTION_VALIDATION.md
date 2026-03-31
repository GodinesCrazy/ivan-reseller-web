# PHASE 0 — PRODUCTION VALIDATION REPORT
**Date**: 2026-03-31  
**Scope**: Validación de comportamiento real en entorno desplegado

---

## Resumen ejecutivo

| Área | Estado | Método |
|------|--------|--------|
| Motor económico canónico | ✅ VALIDADO | 18 tests unitarios pasan |
| Divergencia cost-calculator vs profit-guard | ✅ ELIMINADA | Tests confirman delta < $0.10 |
| Pricing-engine incluye fees | ✅ VALIDADO | Tests confirman |
| ML Chile import duties | ✅ VALIDADO | Tests confirman >$0 |
| Competitor data ML en producción | ❌ NO VERIFICABLE | Backend 502 pre-existente |
| Thresholds activos en Railway | ❌ NO VERIFICABLE | Backend 502 + CLI auth expirado |
| Flujo E2E oportunidad → producto | ❌ NO VERIFICABLE | Backend 502 pre-existente |

---

## D.1 — MOTOR ECONÓMICO CANÓNICO

### Método: Tests unitarios (18/18 PASS)

**Evidencia**:
```
PASS src/__tests__/services/phase0-economic-engine.test.ts (8.425s)

FASE 0 — Canonical fee constants
  ✓ Payment fee pct is 3.49% (not 2.9%)
  ✓ Payment fee fixed is $0.49
  ✓ eBay US fee is 12.85%
  ✓ MercadoLibre CL fee is 13.9%
  ✓ MercadoLibre BR fee is 16%
  ✓ Amazon US fee is 15%

FASE 0 — cost-calculator payment fee fix
  ✓ eBay $20 sale: paymentFee = 3.49%*20 + 0.49 = $1.188
  ✓ eBay $20 sale: old 2.9% = $0.58 → now correctly $1.19
  ✓ ML $50 sale: marketplaceFee = 13.9%*50 = $6.95 (was 11%=$5.50)

FASE 0 — profit-guard canonical fees by marketplace
  ✓ eBay US: platformFee = 12.85% of selling price
  ✓ ML CL: platformFee = 13.9% of selling price
  ✓ ML BR: platformFee = 16% of selling price
  ✓ profit-guard payment fee is 3.49% + $0.49 (canonical)

FASE 0 — Fee consistency: all services agree within $0.10
  ✓ eBay US $30 — cost-calculator vs profit-guard vs canonical engine
  ✓ ML CL $30 — no service diverges on fees by more than $0.10

FASE 0 — pricing-engine totalCost includes marketplace + payment fees
  ✓ suggests price that accounts for fees
  ✓ margin is calculated after all fees

FASE 0 — ML Chile: canonical cost includes import duties
  ✓ CL: importDutiesUsd > 0 (IVA 19% + arancel 6%)

Tests: 18 passed, 0 failed
```

**Conclusión**: Motor económico CORRECTO. La divergencia pre-Phase0 de $0.61/transacción en eBay $20 está ELIMINADA.

---

## D.2 — COMPETITOR DATA MERCADOLIBRE

**Estado**: ❌ No verificable en producción (502).

**Estado del código**: ✅ Implementado correctamente.

**Lógica de fallback implementada** (verificado en código):
1. ML OAuth con token → si 401, auto-refresh + retry
2. Catálogo público ML → puede dar 403 desde IPs Railway
3. Scraper-bridge como fallback si `SCRAPER_BRIDGE_ENABLED=true`
4. Log explícito con `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` si todo falla

**Para validar en producción** (cuando backend esté arriba):
```bash
# Buscar en logs Railway:
[competitor-analyzer] ML comparables telemetry { ... finalDecision: "auth_comparables_used" | "public_comparables_used" | "scraper_bridge_comparables_used" }
```

---

## D.3 — THRESHOLDS Y FILTROS DE PROVEEDOR

**Estado**: ❌ No verificable en producción (502 + CLI auth expirado).

**Estado de variables en local** (`.env`): ✅ Configurado.
```
MIN_SUPPLIER_ORDERS=100    (antes: 0 = OFF)
MIN_SUPPLIER_RATING=4.0    (antes: 0 = OFF)
MIN_SUPPLIER_REVIEWS=10    (antes: 0 = OFF)
MAX_SHIPPING_DAYS=30       (antes: 999 = OFF)
MIN_SUPPLIER_SCORE_PCT=70  (antes: 0 = OFF)
MIN_OPPORTUNITY_MARGIN=0.18 (actualizado de 0.15)
```

**Para verificar en Railway**: buscar en logs post-deploy:
```
[OPPORTUNITY-FINDER] Active thresholds { minMargin: 0.18, minSupplierOrders: 100, ... }
```

---

## D.4 — TAX / DUTIES EN FLUJO DE OPORTUNIDAD

**Estado**: ✅ VALIDADO (test suite + code review).

**Test específico**:
```
✓ CL: importDutiesUsd > 0 — computed as (product + shipping) * (0.19 + 0.06)
   Product $15 + shipping $5.99 = $20.99 subtotal
   CL tax: $20.99 * 0.25 = $5.25 (IVA 19% + arancel 6%)
   importDutiesUsd: 5.247... > 0 ✓
```

**Integración en opportunity-finder**: Confirmada en código — `taxCalculatorService.calculateTax(subtotal, targetCountry)` se llama para toda oportunidad LatAm.

---

## D.5 — FLUJO E2E OPORTUNIDAD → PRODUCTO VERIFICADO

**Estado**: ❌ No verificable en producción (502).

**Estado del código**: ✅ Correcto.

**Enrichment service**: `opportunity-import-enrichment.service.ts` — completo con:
- Affiliate API → SKU ID + shipping cost
- Dropshipping API fallback
- `preventivePublish.selectedSupplier` persisted
- Frontend 409 manejo implementado en `Opportunities.tsx`

---

## Regresiones introducidas por Phase 0

```
Antes Phase 0: 21 suites fallando, 49 tests fallando
Después Phase 0: 19 suites fallando, 43 tests fallando
Delta: -2 suites, -6 tests fallando (MEJORA NETA)
Regresiones nuevas: 0
```

**Los 19 suites que siguen fallando son pre-existentes** (integration tests que requieren DB/Redis live, tests con type errors pre-Phase0).

---

## Fallos detectados (pre-existentes, no introducidos por Phase 0)

| Fallo | Causa | Preexistente |
|-------|-------|-------------|
| Backend 502 | Railway CRASHED 2/2, outage previo | ✅ Sí |
| `trend-suggestions.test.ts` | `keywordSupportingMetric` vs `supportingMetric` type error | ✅ Sí |
| Integration tests DB | Requieren conexión DB live en jest | ✅ Sí |
| `fx.service.test.ts` | Error tipado pre-existente | ✅ Sí |
| Railway CLI auth | Sesión expirada en entorno no-interactivo | ✅ Sí |
