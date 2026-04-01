# PHASE 1 — CYCLE 3 GO / NO-GO
**Date**: 2026-04-01  
**Build**: `b2a8c21`  
**Ciclo**: Cycle 3 — ML OAuth activo, IP block confirmado

---

## DECISIÓN: ❌ NO-GO para publicación — ✅ GO para diagnóstico y siguiente paso técnico exacto

---

## Evaluación de criterios

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| Motor ejecuta sin errores | ✅ | HTTP 200, 4 items, build b2a8c21 |
| feesConsidered no vacío | ✅ | Breakdown completo × 4 |
| Margen canónico ≥ 18% | ✅ | 27–29% × 4 |
| publishingDecision presente | ✅ | × 4 con decision + reasons + canPublish |
| ML OAuth credenciales en DB | ✅ | accessToken + refreshToken + clientId presentes |
| tryAuthSearch ejecutado con token real | ✅ | hasAuthCredentials=true, token enviado |
| ML search con token bypasea IP block | ❌ | GET /sites/MLC/search → 403 incluso con Bearer token |
| probeCode correcto (ML_SEARCH_IP_BLOCKED) | ✅ | Bug corregido en b2a8c21 |
| Mensaje honesto (no "conectá OAuth") | ✅ | "scraper-bridge en IP no bloqueada" |
| listingsFound ≥ 3 en algún item | ❌ | 0 × 4 (IP block) |
| canPublish: true en algún item | ❌ | false × 4 (correcto) |
| Tests: diagnóstico IP block | ✅ | 10/10 phase1-ml-oauth-probe.test.ts |

**Criterios GO: 9/12 — 3 bloqueados por IP Railway en search endpoint (infra, no código)**

---

## Causa técnica exacta del NO-GO

```
MercadoLibre bloquea GET /sites/{site}/search?q=...
desde IPs de Railway App Platform (hosting compartido)
INCLUSO con Authorization: Bearer <token OAuth válido>

Endpoint /users/{id}: NO bloqueado (testConnection pasa)
Endpoint /sites/{site}/search: BLOQUEADO (búsqueda de competencia)

El bloqueo es a nivel de IP × endpoint-de-búsqueda,
no a nivel de autenticación.
```

**Verificación directa** (2026-04-01):
```bash
GET https://api.mercadolibre.com/users/194000595
Authorization: Bearer APP_USR-8432109551263766-...
→ 200 OK  {id: 194000595, nickname: "MAIV6674255"}

GET https://api.mercadolibre.com/sites/MLC/search?q=auriculares+bluetooth
Authorization: Bearer APP_USR-8432109551263766-...
→ 403 Forbidden  {"error":"forbidden"}
```

---

## Por qué no es un NO-GO de código

1. El OAuth funciona — credenciales guardadas correctamente
2. El credential loading funciona — `getCredentials` retorna accessToken desde DB
3. `tryAuthSearch` sí se ejecuta — el código intenta la búsqueda auth
4. El error es de plataforma (Railway IP ↔ ML search) — no hay código que corregir
5. El diagnóstico ahora es preciso — `ML_SEARCH_IP_BLOCKED` 

---

## Siguiente paso técnico EXACTO para GO completo

### Desplegar Scraper Bridge

El bridge actúa como proxy: Railway → Bridge (IP no bloqueada) → ML search → resultados.

**Código del bridge ya implementado**:
```typescript
// scraper-bridge.service.ts
await scraperBridge.searchMLCompetitors({ siteId: 'MLC', q: query, limit: 20 })
// → POST {SCRAPER_BRIDGE_URL}/scraping/mercadolibre/search
```

**Pasos para activar**:

```
1. Desplegar bridge en Render / Fly.io / cualquier IP no Railway:
   - Servicio simple que recibe POST /scraping/mercadolibre/search
   - Reenvía GET https://api.mercadolibre.com/sites/{siteId}/search?q=...
   - Retorna array de {id, title, price, currency_id, permalink}

2. Configurar en Railway Dashboard:
   SCRAPER_BRIDGE_ENABLED=true
   SCRAPER_BRIDGE_URL=https://<url-del-bridge>

3. Re-ejecutar ciclo:
   GET /api/opportunities?query=auriculares+bluetooth&region=cl&marketplaces=mercadolibre
   → competitor-analyzer intenta scraper-bridge DESPUÉS de 403 auth+public
   → bridge retorna listados reales desde ML
   → listingsFound ≥ 3 → publishingDecision = PUBLICABLE → canPublish = true
```

**Alternativa sin bridge**: Probar con eBay (IPs Railway no bloqueadas por eBay):
```
GET /api/opportunities?query=bluetooth+earbuds&region=us&marketplaces=ebay
```
Si eBay tiene credenciales configuradas, puede producir `PUBLICABLE` directamente.

---

## Progresión Cycle 1 → Cycle 2 → Cycle 3

| Métrica | Cycle 1 | Cycle 2 | Cycle 3 |
|---------|---------|---------|---------|
| Build | 97fb18f | 4263a45 | **b2a8c21** |
| feesConsidered correcto | ❌ | ✅ | ✅ |
| publishingDecision | ❌ | ✅ | ✅ |
| ML OAuth en DB | ❌ | ❌ | ✅ **Activo** |
| tryAuthSearch ejecutado | ❌ | ❌ | ✅ **Sí** |
| ML search bypasseado | ❌ | ❌ | ❌ (IP block persiste) |
| probeCode preciso | ❌ | ❌ | ✅ **ML_SEARCH_IP_BLOCKED** |
| Diagnóstico honesto | ❌ | ⚠️ Parcial | ✅ **Completo** |
| canPublish: true | ❌ | ❌ | ❌ |
| Bloqueador identificado con precisión | ❌ | ❌ | ✅ |
