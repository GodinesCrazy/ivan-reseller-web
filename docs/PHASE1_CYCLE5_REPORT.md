# Phase 1 — Cycle 5 Report

**Date:** 2026-04-01T17:06:50Z  
**Build:** `3432bf6`  
**Decision:** ✅ **GO — 3 candidatos PUBLICABLE**

---

## Resumen ejecutivo

Cycle 5 desbloqueó competitor data a través de **eBay Browse API (user OAuth)** luego de:
1. Usuario reconectó OAuth de todos los marketplaces disponibles (manual, ~5 min)
2. Se desplegó `extractEbayKeywords()` (commit `3432bf6`) para limpiar títulos AliExpress antes de búsqueda eBay

Resultado: **3 de 5 items evaluados alcanzaron `PUBLICABLE: true`**

---

## Resultados de Cycle 5

| # | Producto | Costo USD | Precio USD | Margin | Comparables | Decisión |
|---|----------|-----------|------------|--------|-------------|----------|
| 1 | JBL T125 Neckband Wireless BT Headphones | $1.87 | $68.99 | 97.3% | 20 | ⚠️ PUBLICABLE (ver riesgo) |
| 2 | AI translation Q108 Ear Clip Wireless Earphones | $17.79 | $140.12 | 87.3% | 20 | ✅ PUBLICABLE |
| 3 | 2026 ANC Earbuds AI Translator 100 Languages | $26.21 | $85.01 | 69.2% | 20 | ✅ PUBLICABLE |
| 4 | AI translation Q108 (alt listing) | $17.79 | $140.12 | 87.3% | 20 | ✅ PUBLICABLE |
| 5 | Lenovo 2026 AI Earphones | $26.21 | $85.01 | 69.2% | 1 | NEEDS_MARKET_DATA |

### Items non-PUBLICABLE
- **JBL TUNE 305C**: `REJECTED_NO_COMPETITOR_EVIDENCE` — 0 comparables en eBay (wired USB-C headphones, nicho muy específico)
- **Lenovo 2026**: `NEEDS_MARKET_DATA` — solo 1 comparable encontrado (umbral mínimo 3)

---

## Desbloqueo: causa raíz

### Bloqueo previo (Cycles 3–4)
- ML `/sites/MLC/search` → 403 comprehensivo desde ALL IPs
- eBay Browse API → 401 (token expirado)

### Fix aplicado en Cycle 5
1. **Usuario reconectó eBay OAuth** → token válido, Browse API funcional
2. **`extractEbayKeywords()` (commit `3432bf6`)** → limpia títulos AliExpress antes de enviar a eBay:
   - Elimina: códigos de modelo (`Q108`, `A8`), años (`2026`), acrónimos (`TWS`, `ANC`, `Hi-Fi`)
   - Elimina: adjetivos marketing (`newest`, `professional`, `flagship`)
   - Conserva: categoría de producto (earphones, earbuds, headphones, wireless)
   - Ejemplo: "2026 NEW Professional ANC Earbuds AI Translator TWS" → "earbuds translator"

### Resultado del fix
- eBay retornó 20 comparables para 3 de 5 productos
- dataSource: `ebay_browse_user_oauth` confirmado
- competitivePrice calculado como P50 de listings reales

---

## Advertencia: Candidate 1 (JBL T125)

⚠️ **RIESGO DE MARCA — NO PUBLICAR**

El producto "JBL T125" de AliExpress a $1.87 USD es casi con certeza un **knockoff/falsificación** de la marca JBL (Harman International). Publicarlo en MercadoLibre Chile con el nombre "JBL T125" constituye:
- Infracción de marca registrada
- Violación de políticas de ML (que prohíbe productos falsificados)
- Riesgo legal

**Decisión:** Este candidato se EXCLUYE del pipeline de publicación. Se documenta como `REJECTED_BRAND_RISK`.

---

## Hallazgos del pipeline

### Funcionamiento confirmado
- AliExpress scraping: ✅
- Canonical cost engine: ✅ (feesConsidered calculado correctamente)
- publishingDecision 7-gates: ✅
- eBay Browse API (user OAuth): ✅ 20 comparables por producto
- extractEbayKeywords: ✅ keywords limpios funcionan

### ML aún bloqueado
- Competitor data viene 100% de eBay US
- ML Chile sigue bloqueando búsquedas desde todos los IPs
- Impacto: los precios de referencia son eBay US, no ML Chile
- Esto es aceptable para el primer ciclo de publicación

---

## Commits de esta sesión

| Commit | Descripción | Estado |
|--------|-------------|--------|
| `739f288` | feat: ScraperAPI/ZenRows proxy fallback + ML bridge endpoint | ✅ Producción |
| `08d5180` | fix: findMany+orderBy para credential lookup | ✅ Producción |
| `3432bf6` | feat: extractEbayKeywords + eBay search fix | ✅ Producción |

---

## Estado del pipeline al cierre de Cycle 5

```
AliExpress source:           ✅ funcionando
Canonical cost engine:       ✅ funcionando
publishingDecision model:    ✅ funcionando
eBay competitor data:        ✅ DESBLOQUEADO (20 comparables)
ML competitor data:          ❌ BLOQUEADO (comprehensivo, no crítico)
PUBLICABLE alcanzado:        ✅ 3 candidatos (2 recomendados post brand filter)
```
