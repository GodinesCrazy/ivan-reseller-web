# PHASE 0 VALIDATION REPORT
**Date**: 2026-03-31  
**TypeScript**: `npx tsc --noEmit` → **0 errores**

---

## Checklist de validación

### Motor económico (Fix #0–#3)

| Escenario | Resultado esperado | Estado |
|-----------|-------------------|--------|
| `cost-calculator.calculate('ebay', 20, 5)` — payment fee | $1.19 (3.49%×$20 + $0.49) | ✅ Implementado |
| `cost-calculator.calculate('mercadolibre', 50, 15)` — marketplace fee | $6.95 (13.9%×$50) | ✅ Implementado |
| `profit-guard.checkProfitGuard({marketplace:'ebay', sellingPriceUsd:20, supplierPriceUsd:5})` | platformFee = 12.85% | ✅ Implementado |
| `profit-guard.checkProfitGuard({marketplace:'mercadolibre', region:'CL'})` | platformFee = 13.9% | ✅ Implementado |
| `profit-guard.checkProfitGuard({marketplace:'mercadolibre', region:'BR'})` | platformFee = 16% | ✅ Implementado |
| `pricing-engine.computeSuggestedPrice({marketplace:'ebay', ...})` — totalCost incluye fees | totalCost += 12.85% + 3.49% + $0.49 | ✅ Implementado |
| Divergencia cost-calculator vs profit-guard en producto $20 | $0.00 (eran $0.61/transacción) | ✅ Eliminada |

### Competitor data ML (Fix #4)

| Escenario | Resultado esperado | Estado |
|-----------|-------------------|--------|
| ML OAuth token presente y válido | Usa `mercadolibre_authenticated_catalog` | ✅ |
| ML OAuth token expirado (401) | Auto-refresh + retry | ✅ Implementado |
| Railway IP → 403 en catálogo público | Intenta scraper-bridge si habilitado | ✅ Implementado |
| Scraper-bridge deshabilitado + 403 | Log explícito con instrucciones, competitionProbe `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` | ✅ |
| Scraper-bridge habilitado + 403 | `mercadolibre_scraper_bridge` como dataSource | ✅ Implementado |

### Filtros y thresholds (Fix #5–#6)

| Variable | Valor objetivo | Estado |
|----------|---------------|--------|
| MIN_OPPORTUNITY_MARGIN | 0.18 | ✅ Actualizado |
| MIN_SUPPLIER_ORDERS | 100 | ✅ En .env |
| MIN_SUPPLIER_RATING | 4.0 | ✅ En .env |
| MAX_SHIPPING_DAYS | 30 | ✅ En .env |
| Log activo al inicio del pipeline | `[OPPORTUNITY-FINDER] Active thresholds` | ✅ Implementado |

---

## Impacto económico proyectado

**Por transacción en eBay US ($20 venta)**:

| Componente | Antes FASE 0 | Después FASE 0 |
|-----------|-------------|----------------|
| Marketplace fee | 12.5% = $2.50 | 12.85% = $2.57 |
| Payment fee | 2.9% = $0.58 | 3.49% + $0.49 = $1.19 |
| **Total fees** | **$3.08** | **$3.76** |
| **Delta** | — | **−$0.68 (ajuste correcto)** |

Con 100 ventas/mes a $20: la corrección evita **$68/mes de pérdidas ocultas** por subcálculo.

**Por transacción en ML Chile ($30 venta)**:

| Componente | Antes FASE 0 | Después FASE 0 |
|-----------|-------------|----------------|
| Marketplace fee | 11% = $3.30 | 13.9% = $4.17 |
| Payment fee | 2.9% = $0.87 | 3.49% + $0.49 = $1.54 |
| Import tax (IVA 19% + 6%) | $0 | ~$7.50 (estimado) |
| **Total fees** | **$4.17** | **$13.21** |

Sin la corrección, ML Chile era una ruta directa a pérdidas masivas.

---

## Archivos modificados en FASE 0

```
backend/src/services/canonical-cost-engine.service.ts  (NUEVO)
backend/src/services/profit-guard.service.ts           (MODIFICADO)
backend/src/services/pricing-engine.service.ts         (MODIFICADO)
backend/src/services/cost-calculator.service.ts        (MODIFICADO)
backend/src/services/competitor-analyzer.service.ts    (MODIFICADO)
backend/src/services/scraper-bridge.service.ts         (MODIFICADO)
backend/src/services/opportunity-finder.service.ts     (MODIFICADO)
backend/.env                                           (MODIFICADO)
docs/PHASE0_EXECUTION_LOG.md                           (NUEVO)
docs/PHASE0_ENV_CHANGES_REQUIRED.md                    (NUEVO)
docs/PHASE0_VALIDATION_REPORT.md                       (NUEVO)
```

---

## Pendiente post-FASE 0

1. **Tests automatizados**: Escribir tests unitarios para los 7 escenarios de la tabla arriba. Ubicación sugerida: `backend/src/__tests__/services/phase0-economic-engine.test.ts`.
2. **Railway deploy**: Aplicar variables de PHASE0_ENV_CHANGES_REQUIRED.md en el RAW Editor de Railway.
3. **Scraper-bridge**: Si se despliega el bridge, activar `SCRAPER_BRIDGE_ENABLED=true` para restaurar competitor data ML desde Railway.
4. **Monitoreo**: Verificar en logs de Railway la línea `[OPPORTUNITY-FINDER] Active thresholds` después del deploy.
