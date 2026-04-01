# Scraper Bridge — Deployment Report

**Date:** 2026-04-01T16:30:00Z

---

## Resumen ejecutivo

El scraper-bridge **no fue desplegado** en esta sesión. El código está completo y listo, pero el despliegue no resuelve el bloqueo comprehensivo de ML porque:

1. Cualquier IP de datacenter (Railway, AWS, GCP, Azure) es bloqueada por ML
2. ScraperAPI y ZenRows (proxies residenciales/rotativos) también retornan 0 resultados
3. El bridge en Railway usaría las mismas IPs bloqueadas

---

## Estado del código del bridge

### Archivo: `scraper-bridge/index.js`

**Endpoints disponibles:**
- `GET /health` → `{"data":{"status":"ok"}}`
- `POST /scraping/aliexpress/search` → búsqueda AliExpress (existente)
- `POST /scraping/aliexpress/product` → producto AliExpress (existente)
- `POST /scraping/mercadolibre/search` → **NUEVO** búsqueda ML con chain de fallbacks

**Commit:** `739f288` — desplegado en producción

### Chain de resolución ML search:

```
1. ScraperAPI proxy (SCRAPERAPI_KEY env) → ML API JSON
   ↓ fail
2. ZenRows proxy (ZENROWS_API_KEY env) → ML API JSON
   ↓ fail
3. ML API directo → JSON (funciona si IP no bloqueada)
   ↓ fail/empty
4. HTML scrape listado.mercadolibre.cl → cheerio parse
   ↓ fail (JS bot challenge)
5. { results: [], source: "ml_web_scrape" }
```

---

## Tentativa de deploy automático

| Paso | Resultado | Detalle |
|------|-----------|---------|
| Railway CLI disponible | ✅ v4.29.0 | `railway status` linked |
| Railway auth válida | ❌ Sesión expirada | `railway variables` → `Unauthorized` |
| Token en config local | ⚠️ Presente pero inválido | `~/.railway/config.json` |
| Deploy vía `railway up` | ❌ No ejecutado | Auth requerida |

---

## Por qué desplegar el bridge en Railway NO resuelve el problema

El bridge como servicio separado de Railway sigue usando IPs de Railway (`*.railway.app`). MercadoLibre bloquea por IP range, no por hostname. Desplegar el bridge en Railway + activar SCRAPER_BRIDGE_ENABLED=true no produciría resultados.

**Para que el bridge funcione, necesita:**
- IP residencial (no datacenter) — hospedado en red doméstica
- ScraperAPI con clave válida configurada como env var
- ZenRows con clave válida configurada como env var
- O un proveedor de hosting con IPs no-blocklist (Vercel Edge, Cloudflare Workers, etc.)

---

## Estado de opciones de deploy

| Opción | Disponibilidad | Estado |
|--------|---------------|--------|
| Railway (servicio separado) | CLI desautenticado | ❌ No ejecutado |
| Fly.io | No disponible | ❌ CLI no instalado |
| Render | No disponible | ❌ No configurado |
| Docker local | No disponible | ❌ Docker no instalado |
| ngrok + bridge local | Disponible | ⚠️ Local bridge en puerto 54112 pero ML también 403 desde local |
| Cloudflare Workers | No intentado | 🔵 Pendiente evaluación |
| Vercel Edge | No intentado | 🔵 Pendiente evaluación |

---

## Pasos manuales mínimos (ver SCRAPER_BRIDGE_MINIMAL_MANUAL_STEPS.md)

Para desbloquear competitor data, el usuario necesita ejecutar UNO de estos pasos:
1. Reconectar eBay OAuth en Settings → rápido, ya tiene credentials
2. Configurar `SCRAPERAPI_KEY` válido en Railway env vars
3. Configurar `ZENROWS_API_KEY` válido en Railway env vars
