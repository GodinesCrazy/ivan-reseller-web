# AUTOMATED COMPETITOR DATA STATUS
**Date**: 2026-04-01  
**Periodo cubierto**: Cycle 1 (97fb18f) → Cycle 2 (4263a45) → FASE B (c7a8517)

---

## Resumen ejecutivo

| Fuente | Cycle 1 | Cycle 2 | FASE B |
|--------|---------|---------|--------|
| ML Catálogo público | ❌ 403 | ❌ 403 | ❌ 403 (sin cambio) |
| ML OAuth | ❌ Placeholder | ❌ Placeholder | ❌ Placeholder |
| Scraper bridge | ❌ localhost | ❌ localhost | ❌ localhost |
| eBay Application Token | ⚠️ Pendiente config | ⚠️ Pendiente config | ⚠️ Pendiente config |
| Decisión automática | ❌ No existía | ❌ No existía | ✅ **Implementada** |

---

## Fuentes implementadas en código

### 1. MercadoLibre OAuth (Autenticado)

**Archivo**: `backend/src/services/competitor-analyzer.service.ts`, líneas 185–397

**Flujo**:
```
marketplace.getCredentials(userId, 'mercadolibre')
  → rawCreds.accessToken / clientId / clientSecret / refreshToken
  → tryAuthSearch() → GET /sites/MLC/search
  → 401 → refresh token → retry
  → listingsFound + prices[]
```

**Estado actual**: ❌ Railway tiene `MERCADOLIBRE_CLIENT_ID=your-mercadolibre-client-id` (placeholder)

**Para activar**:
1. Crear app en developers.mercadolibre.com
2. Obtener client_id + client_secret reales
3. Set en Railway: `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`
4. Completar OAuth desde UI: `/oauth/start/mercadolibre`

---

### 2. MercadoLibre Catálogo Público

**Archivo**: `competitor-analyzer.service.ts`, función `loadPublic()`

**Flujo**: GET `api.mercadolibre.com/sites/MLC/search?q=...` sin token

**Estado actual**: ❌ HTTP 403 desde todas las IPs Railway (bloqueo de plataforma por IP)

**No hay código que corregir** — es una restricción de infraestructura.

---

### 3. Scraper Bridge

**Archivo**: `backend/src/services/scraper-bridge.service.ts`

**Función**: `searchMLCompetitors({ siteId: 'MLC', q: query, limit: 5 })`

**URL configurada**: `SCRAPER_BRIDGE_URL=http://127.0.0.1:8077` — localhost únicamente

**Estado actual**: ❌ No accesible desde Railway. Railway no puede llegar a localhost local.

**Para activar**:
1. Desplegar bridge en Railway / Render / Fly.io
2. Set `SCRAPER_BRIDGE_ENABLED=true` + `SCRAPER_BRIDGE_URL=<url-pública>`

---

### 4. eBay Browse API

**Archivo**: `competitor-analyzer.service.ts`, función `resolveEbayAppKeys()`

**Fuentes**: `EBAY_APP_ID`, `EBAY_CERT_ID` (env vars) o credenciales por usuario en DB

**Estado actual**: ⚠️ No verificado si está configurado en Railway. Es la fuente más fácil de activar.

**Para activar**:
1. Obtener eBay Developer account + App ID + Cert ID
2. Set en Railway: `EBAY_CLIENT_ID=<App ID>` + `EBAY_CLIENT_SECRET=<Cert ID>`

---

## Impacto en `publishingDecision`

| Configuración | `comparablesCount` | `decision` | `canPublish` |
|---------------|-------------------|------------|-------------|
| Estado actual (ML 403) | 0 | `NEEDS_MARKET_DATA` | false |
| ML OAuth activo + ≥ 3 hits ML CL | ≥ 3 | `PUBLICABLE` | **true** |
| eBay activo + ≥ 3 hits eBay | ≥ 3 | `PUBLICABLE` | **true** |
| Scraper-bridge activo + ≥ 3 hits | ≥ 3 | `PUBLICABLE` | **true** |
| Cualquier fuente + 1–2 hits | 1–2 | `NEEDS_MARKET_DATA` | false |
| Cualquier fuente + 0 hits (no bloqueado) | 0 | `REJECTED_NO_COMPETITOR_EVIDENCE` | false |

---

## Diagnóstico en tiempo real (competitionDiagnostics)

Cada item en la respuesta de la API incluye:

```json
"competitionDiagnostics": [
  {
    "marketplace": "mercadolibre",
    "region": "CL",
    "listingsFound": 0,
    "competitivePrice": 0,
    "dataSource": "mercadolibre_public_catalog",
    "probeCode": "ML_PUBLIC_CATALOG_HTTP_FORBIDDEN",
    "probeDetail": "HTTP 403 from ML public catalog"
  }
]
```

Este array es la fuente de `probeCodes` en `computePublishingDecision()`.

---

## Cronología de bloqueo ML

| Fecha | Evento |
|-------|--------|
| 2026-03-31 Cycle 1 | 5/5 items → `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` |
| 2026-03-31 Cycle 2 | 3/3 items → `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` (sin cambio) |
| 2026-04-01 FASE B | Mismo bloqueo — ahora expresado como `NEEDS_MARKET_DATA` en `publishingDecision` |

**Conclusión**: El bloqueo es estructural y persistente. No es un bug del sistema. La acción requerida es configurar credenciales reales o desplegar un bridge en producción.
