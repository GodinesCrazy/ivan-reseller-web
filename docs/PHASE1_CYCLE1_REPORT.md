# PHASE 1 — CYCLE 1 REPORT
**Date**: 2026-03-31T22:30 UTC  
**Backend URL**: https://ivan-reseller-backend-production.up.railway.app  
**Build activo**: `97fb18f`  
**Status**: Ciclo ejecutado — evidencia real obtenida

---

## NOTA: URL de backend

Durante Fase 1 se identificó que la URL correcta del backend es:
- ✅ `https://ivan-reseller-backend-production.up.railway.app` — backend Node.js real
- ❌ `https://ivan-reseller-web-production.up.railway.app` — URL incorrecta (devuelve 502, probablemente frontend o alias inactivo)

La URL correcta coincide con la usada en los scripts del proyecto.

---

## FASE A — Validación runtime del motor de oportunidades

### A.1 — Ciclo de opportunity discovery ejecutado

**Query**: `auriculares bluetooth`  
**Región**: `cl` (Chile)  
**Marketplace**: `mercadolibre`  
**maxItems**: 5  
**Modo**: `relaxedMargin: true, skipTrendsValidation: true` (configuración por defecto del endpoint `/api/opportunities`)

**HTTP**: `200 OK` ✅ — motor ejecutó sin error

**Resultado**: 5 oportunidades retornadas

| # | Producto (truncado) | AliExpress USD | totalCost USD | suggestedPrice USD | profitMargin |
|---|---------------------|---------------|--------------|-------------------|-------------|
| 1 | Translation Earbuds Real Time AI... | $7.86 | $9.91 | $11.40 | 13.05% |
| 2 | Original SONY Ear clip OWS Wireless... | $9.34 | $11.78 | $13.54 | 13.02% |
| 3 | Lenovo 2026 AI Real Time Translation... | $20.45 | $25.80 | $29.65 | 12.99% |
| 4 | Original Sony Q87 Wireless Bluetooth... | $9.47 | $11.95 | $13.73 | 12.97% |
| 5 | AI Translation Headphones True Wireless... | $14.66 | $18.49 | $21.26 | 13.02% |

**Todos los márgenes: ~13% (estimados)**

---

### A.2 — Análisis de thresholds en acción

**Importante**: El endpoint `/api/opportunities` usa `relaxedMargin: true` internamente. Cuando no hay competitor data (caso actual), el fallback heurístico es `price * 1.45` como precio sugerido. En modo `relaxedMargin`, el umbral efectivo se reduce. Esto explica que los 5 items pasen siendo que el margen estimado (~13%) está por debajo del `MIN_OPPORTUNITY_MARGIN=0.18`.

**Campos de proveedor en respuesta**: `supplierOrdersCount`, `supplierRating`, `supplierReviewsCount`, `shippingDaysMax` ausentes en todos los items. El filtro de proveedor (`MIN_SUPPLIER_ORDERS=100`, etc.) opera en el pipeline de candidatos de AliExpress antes de armar la respuesta; los campos no siempre se propagan al objeto final cuando los datos vienen del path de fallback.

**Log `[OPPORTUNITY-FINDER] Active thresholds`**: No verificable desde el cliente API — es un log server-side en Railway. Verificar en Railway Dashboard → Logs.

---

## FASE B — Competitor data real de MercadoLibre

### B.1 — Fuente observada

Todos los items retornaron:
```json
"competitionDiagnostics": [{
  "marketplace": "mercadolibre",
  "region": "cl",
  "listingsFound": 0,
  "competitivePrice": 0,
  "dataSource": "mercadolibre_public_catalog",
  "probeCode": "ML_PUBLIC_CATALOG_HTTP_FORBIDDEN",
  "probeDetail": "Se intentó OAuth ML + catálogo público, pero Mercado Libre rechazó (403/401) desde esta IP de Railway. Activá SCRAPER_BRIDGE_ENABLED=true con SCRAPER_BRIDGE_URL para desbloquear competencia ML, o conectá credenciales OAuth ML válidas."
}]
```

**`finalDecision`**: `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` en 5/5 items.

**Evaluación**: Confirmado y documentado. MercadoLibre bloquea requests desde IPs de Railway (403). Tanto el intento OAuth como el catálogo público fallaron. Es el issue conocido, implementado el fallback en Phase 0. El scraper-bridge no está activo (`SCRAPER_BRIDGE_ENABLED` no configurada).

### B.2 — Calidad del competitor data

| Criterio | Resultado |
|----------|-----------|
| listingsFound ML | 0 en todos los items |
| Precio competitivo real | No disponible |
| Fuente fallback | Heurístico: `price * 1.45` |
| ≥ 3 comparables | ❌ 0 en todos |

**Conclusión**: Sin competitor data real de ML. Todos los precios sugeridos son estimaciones heurísticas.

---

## FASE C — Calidad de oportunidades

### C.1 — Análisis por item

| Item | Margen calculado | Tipo | feesConsidered | Canonical fees |
|------|-----------------|------|---------------|----------------|
| 1 Translation Earbuds | 13.05% | Estimado | `{}` vacío | No aplicado |
| 2 SONY Ear clip | 13.02% | Estimado | `{}` vacío | No aplicado |
| 3 Lenovo AI TWS | 12.99% | Estimado | `{}` vacío | No aplicado |
| 4 Sony Q87 | 12.97% | Estimado | `{}` vacío | No aplicado |
| 5 AI Translation TWS | 13.02% | Estimado | `{}` vacío | No aplicado |

**Hallazgo crítico — feesConsidered vacío**:

Cuando no hay competitor data, el código entra al path de fallback (`price * 1.45`) y `bestBreakdown = {}`. Esto significa:
- El margen del 13% es calculado como `(suggestedPrice - totalCost) / suggestedPrice` donde `totalCost = costUsd + importTax`
- **NO se incluyen** marketplace fee (ML CL: 13.9%) ni payment fee (3.49% + $0.49) en la estimación
- El canonical cost engine solo se ejecuta cuando hay competitor data real (`a.listingsFound > 0 && a.competitivePrice > 0`)

**Verificación matemática** (Producto 1, costUsd=$7.86, suggestedPrice=$11.40):

Con canonical fees incluidos, el margen real sería:
```
revenue_after_ml_fee = 11.40 * (1 - 0.139) = 9.82
revenue_after_payment_fee = 9.82 - (11.40 * 0.0349 + 0.49) = 9.82 - 0.888 = 8.93
real_profit = 8.93 - 9.91 = -0.98
real_margin = -0.98 / 11.40 = -8.6%  ← PÉRDIDA
```

Ninguno de los 5 items alcanzaría el 18% si se incluyeran los fees canónicos en la estimación.

### C.2 — Selección de mejor oportunidad

**Ninguna seleccionada.** Criterios no cumplidos:
- Margen estimado ~13%, bajo el umbral de 18%
- Margen real después de fees canónicos: negativo
- 0 comparables ML reales
- `feesConsidered: {}` — breakdown canónico ausente

---

## FASE D — Flujo enriquecimiento

**No ejecutado.** No hay oportunidad candidata que cumpla criterios mínimos.

---

## FASE E — Preparación de publicación

**No ejecutada.** Criterios de FASE C no cumplidos.

---

## Resumen de issues encontrados

| Issue | Severidad | Tipo | Acción |
|-------|-----------|------|--------|
| ML 403 desde IPs Railway | 🟡 Conocido | Competitor data | Activar scraper-bridge cuando haya bridge |
| `feesConsidered: {}` vacío en fallback path | 🔴 Pricing | Motor económico | Ver diagnóstico sección siguiente |
| Margen heurístico ~13% no incluye canonical fees | 🔴 Pricing | Motor económico | Ver diagnóstico sección siguiente |
| Supplier quality fields ausentes en respuesta | 🟡 Observabilidad | Runtime | Verificar logs server-side |
| URL backend diferente de URL documentada | 🟡 Config | Documentación | Actualizar docs con URL real |

---

## Diagnóstico: feesConsidered vacío y estimación sin fees canónicos

**Causa raíz**: El canonical cost engine (`costCalculator.calculateAdvanced()`) solo se ejecuta cuando hay competitor data real (`listingsFound > 0`). Cuando no hay comparables (caso actual: ML 403), el pipeline entra al fallback:

```typescript
// backend/src/services/opportunity-finder.service.ts:1532-1562
const fallbackPriceBase = product.price * 1.45;  // sin fees
const fallbackMargin = (fallbackPriceBase - product.price) / product.price;
// ...
bestBreakdown = {};  // vacío — sin fees canónicos
```

**Impacto en Fase 0**: Los 18 tests del canonical cost engine siguen siendo correctos — el engine en sí está bien. Pero su activación depende de tener competitor data. Sin competitor data ML, el path de estimación heurística no usa fees canónicos.

**Lo que necesita corrección** (fuera del scope inmediato de Fase 1, pero requiere atención):
- El fallback de estimación debería calcular el precio sugerido correctamente con fees canónicos
- O bien, el margen debería ser recalculado post-sugerencia para reflejar fees reales

**Esto NO modifica la validez de los tests de Phase 0** — el engine es correcto. Lo que falta es aplicarlo en el path de estimación.

---

## Datos adicionales confirmados

**Backend sano durante el ciclo**:
```json
GET /ready → {"ok":true,"ready":true,"db":true,"safeBoot":false,
              "uptime":12012,"port":8080,
              "build":{"gitSha":"97fb18f"},"memory":{"used":49,"total":56,"unit":"MB"}}
```
- uptime: 12012s (~3.3 horas) — estable
- memory: 49MB/56MB — saludable
- PORT: 8080 (asignado por Railway)

**AliExpress data**: Real y funcional. 5 productos con precios reales, imágenes, URLs válidas.  
**Redis/DB**: Operativos (ready:true, db:true).
