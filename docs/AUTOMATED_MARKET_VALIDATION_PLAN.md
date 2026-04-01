# AUTOMATED MARKET VALIDATION PLAN
**Date**: 2026-04-01  
**Build activo en progreso**: `c7a8517` (FASE B — publishingDecision model)  
**Status**: ✅ Plan implementado — decisión automática activa en pipeline

---

## Objetivo

Eliminar la dependencia de validación manual de precios. El sistema debe determinar automáticamente si un candidato es PUBLICABLE sin requerir que el operador busque precios en MercadoLibre.

---

## Arquitectura de validación automática

### Pipeline de decisión (por producto)

```
[AliExpress Product]
        ↓
[Canonical Cost Engine]   → precio mínimo viable + fees canónicos
        ↓
[Competitor Analyzer]     → busca comparables reales (ML / eBay / Amazon)
        ↓
[computePublishingDecision()]
        ↓
[PublishingDecisionResult] → { decision, reasons, canPublish, comparablesCount }
        ↓
[OpportunityItem.publishingDecision]  ← expuesto en API + UI
```

### Gates en orden de prioridad

| Gate | Fallo → Decision | Criterio |
|------|-----------------|----------|
| 1. Datos completos | `NEEDS_ENRICHMENT` | imágenes + URL + título presentes |
| 2. Fees canónicos | `NEEDS_ENRICHMENT` | `feesConsidered` no vacío |
| 3. Margen mínimo | `REJECTED_LOW_MARGIN` | `profitMargin >= effectiveMinMargin` |
| 4. Bloqueo estructural | `NEEDS_MARKET_DATA` | probe code contiene FORBIDDEN/UNAUTHORIZED |
| 5. Sin comparables | `REJECTED_NO_COMPETITOR_EVIDENCE` | 0 listados (búsqueda OK pero sin resultados) |
| 6. Pocos comparables | `NEEDS_MARKET_DATA` | 1–2 listados (< 3 = evidencia débil) |
| 7. Todas OK | `PUBLICABLE` | ≥ 3 comparables reales + margen OK + datos completos |

---

## Estado actual de fuentes de datos de mercado

### MercadoLibre Chile

| Fuente | Estado | Bloqueador |
|--------|--------|-----------|
| ML OAuth (token real) | ❌ No operativo | Credenciales Railway son placeholders |
| ML Catálogo Público | ❌ Bloqueado | HTTP 403 desde IPs Railway (estructural) |
| Scraper Bridge | ❌ No operativo en prod | URL localhost (`127.0.0.1:8077`) solo local |

**Impacto**: Todo candidato ML CL resulta en `NEEDS_MARKET_DATA` hasta que alguna fuente se active.

### eBay

| Fuente | Estado |
|--------|--------|
| eBay Browse (Application Token) | ✅ Implementado — operativo si `EBAY_APP_ID`/`EBAY_CERT_ID` configurados |
| eBay Browse (User OAuth) | ✅ Implementado — operativo si usuario completó OAuth |

**Impacto**: Candidatos eBay pueden resultar en `PUBLICABLE` si comparables ≥ 3 y margen OK.

---

## Camino para desbloquear ML Chile automático

### Opción A — ML OAuth real (prioritaria, ~2h trabajo)
1. Crear app en [developers.mercadolibre.com](https://developers.mercadolibre.com)
2. Obtener `client_id` y `client_secret` reales
3. Configurar en Railway: `MERCADOLIBRE_CLIENT_ID` + `MERCADOLIBRE_CLIENT_SECRET`
4. Completar flujo OAuth desde `/oauth/start/mercadolibre`
5. El `competitor-analyzer.service.ts` ya tiene el refresh chain completo (líneas 285–397)

### Opción B — Scraper Bridge en producción (~4h trabajo)
1. Desplegar servicio bridge en Railway (proyecto separado)
2. Configurar: `SCRAPER_BRIDGE_ENABLED=true` + `SCRAPER_BRIDGE_URL=<url-pública>`
3. `scraper-bridge.service.ts::searchMLCompetitors()` ya implementado

### Opción C — eBay como marketplace alternativo (inmediato)
- Configurar `EBAY_APP_ID` + `EBAY_CERT_ID` en Railway
- Candidatos eBay procesados completamente (búsqueda → decisión → PUBLICABLE)
- No depende de ML ni scraper

---

## Criterio de PUBLICABLE (full)

Un candidato es `PUBLICABLE` si y solo si:
1. `feesConsidered` contiene breakdown canónico (marketplaceFee, paymentFee, importDuties, totalCost)
2. `profitMargin >= effectiveMinMargin` (default 18% — `MIN_OPPORTUNITY_MARGIN * 100`)
3. `comparablesCount >= 3` (listados reales de marketplace — no estimados)
4. `images.length > 0` y `aliexpressUrl` válida
5. `title` presente

---

## Decisiones de no-publicabilidad (actuales con ML CL)

Con la configuración actual (Railway, ML 403), todos los candidatos ML CL recibirán:

```json
{
  "decision": "NEEDS_MARKET_DATA",
  "canPublish": false,
  "comparablesCount": 0,
  "reasons": [
    "Sin acceso a datos de mercado — bloqueo estructural de plataforma (ej: ML 403 desde IPs Railway)",
    "Precio $13.94 es el mínimo rentable canónico, no el precio de mercado real",
    "Para publicar: configurar ML OAuth real o scraper-bridge en producción",
    "Probe: ML_PUBLIC_CATALOG_HTTP_FORBIDDEN"
  ]
}
```

**Esto es honesto y correcto**: el precio calculado garantiza ≥ 18% de margen, pero sin comparables reales no se puede garantizar que sea competitivo.

---

## Siguiente iteración para PUBLICABLE

1. Activar ML OAuth o scraper-bridge
2. Ejecutar ciclo automatizado
3. Si `comparablesCount >= 3` → `PUBLICABLE`
4. API expone `canPublish: true` → UI habilita publicación directa
5. Operador aprueba payload en Products (sin búsqueda manual)
