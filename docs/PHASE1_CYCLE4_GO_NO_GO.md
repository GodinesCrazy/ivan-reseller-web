# Phase 1 — Cycle 4 GO / NO-GO

**Date:** 2026-04-01  
**Build:** `08d5180`  
**Decision:** ❌ **NO-GO**

---

## Decisión

| Criterio | Requerido | Actual | Estado |
|----------|-----------|--------|--------|
| Backend sano | ✅ | ✅ HTTP 200 health | PASS |
| ML OAuth activo | ✅ | ✅ token válido, testConnection OK | PASS |
| Competitor data automática | ✅ | ❌ 0 comparables | **FAIL** |
| Candidato PUBLICABLE | ≥1 | 0 | **FAIL** |
| canPublish: true | ≥1 | 0 | **FAIL** |

**Motivo del NO-GO:** `ML_SEARCH_IP_BLOCKED` — MercadoLibre bloquea búsquedas desde todos los IPs probados (Railway, local, ScraperAPI, ZenRows). 0 comparables disponibles para ningún item. Todos los items quedan en `NEEDS_MARKET_DATA`.

---

## ¿Qué cambió respecto a Cycle 3?

| Aspecto | Cycle 3 | Cycle 4 |
|---------|---------|---------|
| Probe code | `ML_SEARCH_IP_BLOCKED` | `ML_SEARCH_IP_BLOCKED` (sin cambio) |
| Scraper bridge | No activo | No activo |
| ScraperAPI path | No implementado | ✅ Implementado y desplegado |
| ZenRows path | No implementado | ✅ Implementado y desplegado |
| Probe detail | "Solución: activar scraper-bridge" | "Opciones: (1) bridge (2) SCRAPERAPI_KEY (3) ZENROWS_API_KEY" |
| Bloqueante raíz | IP block ML | IP block ML (no resuelto) |

**Ciclo 4 avanzó la infraestructura** (2 nuevos commits desplegados) pero **no desbloqueó competitor data**.

---

## Hallazgo crítico

El bloqueo de ML NO es específico de Railway. Afecta a:
- IPs locales (Chile ISP)
- IPs de Railway
- IPs de ScraperAPI (proxy service)
- IPs de ZenRows (premium proxy service)

**Esto indica que ML bloquea el endpoint `/sites/MLC/search` a nivel de POLÍTICA, no solo de IP range.** Los proxies conocidos también están en la blocklist.

---

## Siguiente bloqueante a resolver

Para que Cycle 5 sea GO, se debe resolver UNO de estos:

### Opción A — eBay reconnect (más rápido) ⭐
- eBay está configurado pero con token expirado (HTTP 401)
- **Acción manual:** ir a Settings → Marketplaces → eBay → reconectar OAuth
- Tiempo estimado: 5 minutos
- Resultado esperado: eBay Browse API funciona → comparables US → posible PUBLICABLE

### Opción B — ScraperAPI key válido en Railway
- Configurar `SCRAPERAPI_KEY=<clave_válida>` en Railway env vars
- Requiere cuenta ScraperAPI activa con créditos
- Puede que ML también bloquee ScraperAPI en API mode → intentar `render=true` con website
- Tiempo estimado: 10 minutos (si la clave está activa)

### Opción C — ZenRows key válido en Railway
- Configurar `ZENROWS_API_KEY=<clave_válida>` en Railway env vars
- ZenRows con `premium_proxy=true` usa proxies residenciales
- Mayor probabilidad de bypass que ScraperAPI datacenter
- Tiempo estimado: 10 minutos

### Opción D — Scraper bridge en plataforma no-datacenter (más complejo)
- Desplegar `scraper-bridge/` en Vercel Edge, Cloudflare Workers, o similar
- IPs de edge providers no suelen estar en blocklists de datacenter
- Documentado en `SCRAPER_BRIDGE_RAILWAY_DEPLOY.md`
- Tiempo estimado: 30–60 minutos

---

## Recomendación

**Opción A (eBay reconnect)** es el camino más rápido. eBay funciona desde Railway (no está IP-bloqueado) y ya tiene credenciales. Solo necesita reconexión OAuth.

Si eBay no está disponible para MLC Chile específicamente, **Opción C (ZenRows)** es la mejor alternativa técnica para ML.

---

## Estado del pipeline al cierre de Cycle 4

```
AliExpress source:           ✅ funcionando
Canonical cost engine:       ✅ funcionando
publishingDecision model:    ✅ funcionando
ML competitor data:          ❌ BLOQUEADO (comprehensivo)
eBay competitor data:        ❌ BLOQUEADO (token expirado)
PUBLICABLE alcanzado:        ❌ NO
```
