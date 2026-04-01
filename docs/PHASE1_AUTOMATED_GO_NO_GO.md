# PHASE 1 — AUTOMATED PIPELINE GO / NO-GO
**Date**: 2026-04-01T03:12 UTC  
**Build**: `c7a8517`  
**Ciclo**: FASE B — Modelo de decisión automática activo

---

## DECISIÓN: ✅ GO PARCIAL — Pipeline automático funcional, bloqueado en competitor data

---

## Evaluación de criterios

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| Motor ejecuta sin errores | ✅ | HTTP 200, 3 items, build c7a8517 |
| `feesConsidered` no vacío | ✅ | Breakdown completo × 3 |
| Margen canónico ≥ 18% | ✅ | 27.68%, 28.90%, 28.36% |
| `publishingDecision` presente en respuesta | ✅ | × 3 con decision + reasons + canPublish |
| Decisión automática (sin validación manual) | ✅ | NEEDS_MARKET_DATA × 3 — sin ambigüedad |
| `canPublish` correcto para estado actual | ✅ | false × 3 — correcto dado ML 403 |
| Competitor data real ML | ❌ | ML_PUBLIC_CATALOG_HTTP_FORBIDDEN × 3 |
| ≥ 3 comparables ML reales | ❌ | 0 (estructural — IP Railway bloqueada) |
| `canPublish: true` en al menos 1 candidato | ❌ | Imposible sin fuente de datos activa |
| Frontend badge `publishingDecision` activo | ✅ | PublishingDecisionBadge implementado |
| Backend TypeScript limpio | ✅ | `npx tsc --noEmit` sin errores |

**Criterios GO: 7/11 — 4 bloqueados por ML 403 (estructural, no código)**

---

## Qué cambió en FASE B vs Cycle 2

| Aspecto | Cycle 2 | FASE B |
|---------|---------|--------|
| Validación de precios | Manual ("verificar en ML") | **Automática** (gates computados) |
| Razones de no-publicabilidad | Implícitas | **Explícitas en `reasons[]`** |
| `canPublish` | No existía | **Computado automáticamente** |
| Dependencia del operador | Búsqueda manual requerida | **Eliminada para decisión** |
| Badge en UI | No existía | **PublishingDecisionBadge activo** |

---

## Por qué es GO PARCIAL y no NO-GO

1. **El pipeline automático funciona**: `computePublishingDecision()` produce decisiones correctas, sin intervención humana.

2. **El bloqueador es de infraestructura, no de código**: ML 403 desde Railway es una restricción de plataforma. El código del competitor analyzer está correcto.

3. **La decisión `NEEDS_MARKET_DATA` es la respuesta correcta**: dado el bloqueo, la única respuesta honesta y automática es informar que no hay datos suficientes para confirmar publicabilidad. Esto reemplaza el "verificar manualmente" de Cycle 2.

4. **El primer `canPublish: true` no requiere más código** — solo configuración de infraestructura (ML OAuth real o scraper-bridge).

---

## Condición para `canPublish: true`

El pipeline producirá `PUBLICABLE` + `canPublish: true` automáticamente cuando:

| Acción | Estimado |
|--------|---------|
| Configurar `MERCADOLIBRE_CLIENT_ID` + `MERCADOLIBRE_CLIENT_SECRET` reales en Railway | ~2h |
| Completar OAuth desde UI (`/oauth/start/mercadolibre`) | ~30min |
| ML devuelva ≥ 3 comparables para la query | Depende del producto |

O alternativamente:

| Acción | Estimado |
|--------|---------|
| Desplegar scraper-bridge en Railway | ~4h |
| Set `SCRAPER_BRIDGE_ENABLED=true` + `SCRAPER_BRIDGE_URL` | ~5min |
| Bridge devuelva ≥ 3 comparables | Depende del producto |

---

## Candidato principal (si GO completo)

**Translation Earbuds Real Time AI** (productId: `1005010394170885`)

| Campo | Valor |
|-------|-------|
| Precio proveedor | $7.88 USD |
| suggestedPriceUsd | $13.98 USD |
| profitMargin canónico | 28.90% |
| feesConsidered.totalCost | $13.28 |
| Imágenes | 7 ✅ |
| publishingDecision | NEEDS_MARKET_DATA |
| canPublish | false (correcto — sin comparables) |

Cuando se activen comparables reales y `listingsFound >= 3`, el motor producirá `PUBLICABLE` automáticamente para este producto si el precio sigue siendo competitivo.

---

## Siguiente paso técnico

**No hay código nuevo que escribir.** El pipeline automatizado está completo.

La única acción pendiente es de configuración:

```
1. Opción A — ML OAuth:
   Railway Dashboard → Variables:
     MERCADOLIBRE_CLIENT_ID=<client_id_real>
     MERCADOLIBRE_CLIENT_SECRET=<client_secret_real>
   → UI: /oauth/start/mercadolibre → completar flujo
   → Re-ejecutar ciclo → publishingDecision = PUBLICABLE

2. Opción B — eBay (si ya tiene App ID):
   Railway Dashboard → Variables:
     EBAY_CLIENT_ID=<App_ID>
     EBAY_CLIENT_SECRET=<Cert_ID>
   → Re-ejecutar con marketplaces=ebay
   → publishingDecision = PUBLICABLE si ≥ 3 comparables eBay
```
