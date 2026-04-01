# Scraper Bridge — Runtime Status

**Date:** 2026-04-01T16:30:00Z  
**Build:** `08d5180`

---

## Estado actual del bridge

| Componente | Estado |
|------------|--------|
| Código del bridge | ✅ Actualizado con `POST /scraping/mercadolibre/search` |
| Desplegado en Railway | ❌ No existe servicio separado |
| `SCRAPER_BRIDGE_ENABLED` | ❌ `false` (no configurado en Railway vars) |
| `SCRAPER_BRIDGE_URL` | ❌ No configurado |
| Bridge reachable | ❌ No aplica (no desplegado) |

---

## Endpoint nuevo implementado

`POST /scraping/mercadolibre/search`

```json
// Request
{ "site_id": "MLC", "query": "auriculares bluetooth", "limit": 20 }

// Response
{ "results": [{ "id": "...", "title": "...", "price": 12990, "currency_id": "CLP", "permalink": "..." }], "source": "scraperapi_proxy" }
```

**Priority chain del endpoint:**
1. ScraperAPI proxy (`SCRAPERAPI_KEY` env var) → ML API JSON
2. ZenRows proxy (`ZENROWS_API_KEY` env var) → ML API JSON
3. ML API directo (funciona si IP no bloqueada)
4. HTML scrape de `listado.mercadolibre.cl` (fallback)

---

## Por qué el bridge no está desplegado

- Railway CLI autenticación expirada durante la sesión anterior
- El bridge como servicio separado de Railway usaría IPs de Railway → también bloqueadas por ML
- Deployment en Railway sin SCRAPERAPI_KEY/ZENROWS_API_KEY no resolvería el bloqueo
- Se requiere despliegue en plataforma NO-datacenter O configuración de SCRAPERAPI_KEY/ZENROWS_API_KEY

---

## Evidencia del bloqueo ML comprehensivo

| Fuente | Resultado |
|--------|-----------|
| Local (Chile ISP) | 403 |
| Railway IPs | 403 |
| ML OAuth token presente | 403 igual |
| ScraperAPI proxy | 0 results / 403 through proxy |
| ZenRows premium proxy | 0 results / 403 through proxy |
| `/users/{id}/items/search` con auth | 200 OK ✅ (endpoint diferente, no bloqueado) |
| `/sites/MLC/search` con auth | 403 ❌ |
| `/sites/MLC/search` sin auth | 403 ❌ |

---

## Paths alternativos probados

| Path | Estado | Motivo |
|------|--------|--------|
| ML API directo | ❌ Bloqueado 403 |
| ScraperAPI proxy → ML API | ❌ 0 resultados | IPs ScraperAPI también bloqueadas |
| ZenRows premium proxy | ❌ 0 resultados | IPs ZenRows también bloqueadas |
| ML website HTML scrape | ❌ 0 resultados | JS bot challenge (requiere headless browser) |
| eBay Browse API | ❌ Error 401 | Token expirado, necesita reconexión |
| Amazon catalog | No probado en Cycle 4 | |
