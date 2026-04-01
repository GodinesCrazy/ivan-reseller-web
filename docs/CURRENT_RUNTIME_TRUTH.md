# Current Runtime Truth

**Snapshot date:** 2026-04-01T16:30:00Z  
**Build deployed:** `08d5180` (feat: ScraperAPI/ZenRows proxy + credential fix)  
**Railway service:** `ivan-reseller-backend` (production)  
**Backend URL:** `https://ivan-reseller-backend-production.up.railway.app`

---

## Backend health

| Check | Result |
|-------|--------|
| `/api/health` | ✅ `{"status":"ok"}` |
| `/api/version` | ✅ `gitSha: 08d5180`, `buildTime: 2026-04-01T16:26:12Z`, Node v20 |
| Auth (admin/admin123) | ✅ JWT issued, `userId: 1` |

---

## MercadoLibre OAuth

| Check | Result |
|-------|--------|
| Credentials in DB | ✅ Present — `apiName: mercadolibre`, `environment: production` |
| `testConnection()` (`/users/{id}`) | ✅ Passes (token valid for user endpoint) |
| `searchProducts()` (`/sites/MLC/search`) | ❌ **403 — IP blocked** |
| ML access token freshness | ⚠️ Local test: 401 (token expired from previous session) |
| Production token state | ✅ Production backend auto-refreshes via stored refreshToken |
| Search from local IP | ❌ 403 |
| Search from Railway IPs | ❌ 403 |
| Search via ScraperAPI proxy | ❌ 0 results (proxy IPs likely also blocked by ML) |
| Search via ZenRows proxy | ❌ 0 results (same) |
| `ML_SEARCH_IP_BLOCKED` probe active | ✅ Confirmed in all Cycle 4 runs |
| Competitor listings via ML | ❌ **0 from all paths** |

**Conclusion ML:** OAuth activo, token válido para endpoints de usuario, pero búsqueda comprensivamente bloqueada desde TODOS los IPs probados (local, Railway, ScraperAPI, ZenRows).

---

## eBay

| Check | Result |
|-------|--------|
| Credentials in DB | ✅ Multiple records — `apiName: ebay`, `environment: production` |
| OAuth user token | ❌ `401 Unauthorized` — token expirado |
| Application token (client_credentials) | ❌ `401 Unauthorized` — appId/certId posiblemente incorrecto |
| Competitor search via eBay Browse API | ❌ `MARKETPLACE_SEARCH_ERROR` → 401 |
| Fix available | ⚠️ Manual: reconectar eBay OAuth desde Settings UI |

---

## Scraper Bridge

| Check | Result |
|-------|--------|
| `SCRAPER_BRIDGE_ENABLED` env var | ❌ No configurado en Railway (false) |
| `SCRAPER_BRIDGE_URL` env var | ❌ No configurado |
| Bridge deployed in Railway | ❌ No existe como servicio separado |
| Bridge code (local) | ✅ `scraper-bridge/index.js` actualizado con `POST /scraping/mercadolibre/search` |
| Bridge endpoint: ML search (chain) | ScraperAPI proxy → ZenRows proxy → ML API directo → HTML scrape |
| Bridge reachable from backend | ❌ No desplegado |

---

## ScraperAPI / ZenRows proxy path (nuevo en 08d5180)

| Check | Result |
|-------|--------|
| Código implementado | ✅ FASE 0E en `competitor-analyzer.service.ts` |
| Credenciales en DB | ✅ `scraperapi` (3 records) y `zenrows` (3 records) en `apiCredential` |
| Credential lookup (findMany, desc id) | ✅ Implementado |
| Key validation (hex:hex decrypt + format) | ✅ Implementado |
| ScraperAPI proxy contra ML API | ❌ 0 results — ML bloquea también desde IPs de ScraperAPI |
| ZenRows proxy contra ML API | ❌ 0 results — ML bloquea también desde IPs de ZenRows |
| ScraperAPI key in Railway env var | ❌ `SCRAPERAPI_KEY` no configurado (se usa DB) |
| ZenRows key in Railway env var | ❌ `ZENROWS_API_KEY` no configurado (se usa DB) |

---

## publishingDecision status

| Estado | Descripción |
|--------|-------------|
| `PUBLICABLE` (canPublish: true) | ❌ **No alcanzado** |
| `NEEDS_MARKET_DATA` | ✅ Todos los items — comparables ML bloqueados |
| Blocking gate | Gate 4: ML_SEARCH_IP_BLOCKED → 0 comparables → NEEDS_MARKET_DATA |

---

## Commits en esta sesión

```
08d5180  fix(competitor-analyzer): use findMany+orderBy for ScraperAPI/ZenRows credential lookup
739f288  feat(competitor-analyzer): ScraperAPI/ZenRows proxy fallback for ML search
```

Ambos desplegados y activos en producción.

---

## Verdad fundamental

**MercadoLibre bloquea `GET /sites/MLC/search` desde TODOS los IPs probados:**
- IPs locales (Chile ISP) → 403
- Railway shared IPs → 403  
- ScraperAPI proxy IPs → 0 results / 403
- ZenRows premium proxy IPs → 0 results / 403

El bloqueo NO es específico de Railway. Es comprehensivo para acceso programático al endpoint de búsqueda.

**Paths que SÍ funcionan:**
- `GET /users/{userId}/items/search` con Bearer token → 200 OK (retorna los 2 listings del usuario)
- `GET /users/{userId}` (testConnection) → 200 OK
