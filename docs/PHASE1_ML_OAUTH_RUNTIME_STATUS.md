# PHASE 1 — ML OAUTH RUNTIME STATUS
**Date**: 2026-04-01  
**Build**: `b2a8c21`  
**Status**: ✅ OAuth conectado — ❌ Búsqueda bloqueada por IP Railway

---

## Diagnóstico definitivo

| Componente | Estado | Evidencia |
|-----------|--------|-----------|
| OAuth completado | ✅ | Token exchange successful (backend logs) |
| Credentials guardadas en DB | ✅ | dbSaveConfirmed: true |
| Token accesible en runtime | ✅ | `/api/marketplace/credentials/mercadolibre` → accessToken presente |
| `testConnection()` (`/users/{userId}`) | ✅ 200 OK | runtimeUsable: true |
| Búsqueda auth (`/sites/MLC/search?q=...`) | ❌ 403 | Bloqueado por IP de Railway |
| Búsqueda pública (`/sites/MLC/search?q=...`) | ❌ 403 | Bloqueado por IP de Railway |
| Probe code anterior | ❌ Incorrecto | `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` + "conectá credenciales OAuth ML válidas" |
| Probe code actual | ✅ Correcto | `ML_SEARCH_IP_BLOCKED` |

---

## Credenciales en base de datos

```json
{
  "clientId": "8432109551263766",
  "siteId": "MLC",
  "sandbox": false,
  "accessToken": "APP_USR-8432109551263766-033123-...",
  "refreshToken": "TG-69cc8f772d153100012c755b-194000595",
  "userId": 194000595,
  "environment": "production",
  "isActive": true
}
```

Credenciales presentes, activas, con accessToken y refreshToken. El OAuth funcionó correctamente.

---

## Por qué el OAuth no ayuda a desbloquear búsquedas

MercadoLibre implementa dos capas de restricción independientes:

| Capa | Endpoint | Auth req | Resultado desde Railway |
|------|----------|----------|------------------------|
| User data | `GET /users/{id}` | Bearer token | ✅ 200 OK |
| Search | `GET /sites/MLC/search?q=...` | Opcional (público o auth) | ❌ 403 (IP block) |

**La restricción en el search endpoint es a nivel de IP, no de autenticación.**  
Un token OAuth válido no bypasea el bloqueo de IP en el endpoint de búsqueda.

Esta es la causa de que `testConnection()` pase (usa `/users/{id}`) mientras `searchProducts()` falle (usa `/sites/{site}/search`).

---

## Flujo de `tryAuthSearch` con credenciales activas

```
1. getCredentials(userId=1, 'mercadolibre') → {accessToken, clientId, clientSecret, siteId='MLC'} ✓
2. hasAuthCredentials = true ✓
3. tryAuthSearch('MLC', 'primary')
   → ml.searchProducts({ siteId: 'MLC', q: 'auriculares bluetooth', limit: 20 })
   → GET api.mercadolibre.com/sites/MLC/search?q=...  Authorization: Bearer APP_USR-...
   → HTTP 403 (IP block, independiente del token)
   → authSearchError = { httpStatus: 403, ... }
   → return []
4. tryAuthSearch('MLM', 'mlm')
   → también 403
5. loadPublic('MLC', 'primary') → 403 → publicError = { httpStatus: 403 }
6. loadPublic('MLM', 'mlm') → 403
7. scraper-bridge not available
8. hasAuthCredentials && authAlso403 && publicError.httpStatus === 403
   → probeCode = 'ML_SEARCH_IP_BLOCKED'
   → detail: "OAuth ML activo, búsqueda bloqueada por IP Railway..."
```

---

## Bug corregido (commit `b2a8c21`)

**Antes**: cuando `tryAuthSearch` obtenía 403, el error no se trackaba. La probe generation solo veía `publicError.httpStatus === 403` → `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` → "conectá credenciales OAuth ML válidas" (INCORRECTO).

**Después**:
- `authSearchError` trackeado por separado en `tryAuthSearch`
- Cuando `hasAuthCredentials && authAlso403`: probe → `ML_SEARCH_IP_BLOCKED`
- Mensaje correcto: "OAuth activo, búsqueda IP-bloqueada, fix = scraper-bridge"
- `computePublishingDecision()` distingue `IP_BLOCKED` del resto de bloqueos estructurales

---

## Qué NO está roto

- El código de OAuth callback ✅
- El guardado de credenciales en DB ✅
- El `getCredentials` / `CredentialsManager` ✅
- La lógica de `tryAuthSearch` (llamada correctamente) ✅
- El `testConnection()` (correcto para su propósito: verificar que el token es válido) ✅

---

## Qué SÍ está bloqueado

- `GET /sites/MLC/search?q=...` desde Railway IPs — independientemente de autenticación
- Este bloqueo aplica al endpoint de búsqueda de productos (catálogo competitivo)
- No aplica al endpoint de datos de usuario (`/users/{id}`)

---

## Solución requerida: Scraper Bridge en producción

El único path disponible que no usa Railway IPs directamente:

```
Railway Backend
    ↓ POST /scraping/mercadolibre/search
Scraper Bridge (IP diferente)
    ↓ GET /sites/MLC/search?q=...
MercadoLibre API (desde IP no bloqueada)
    ↓ 200 OK + results[]
```

**Variables a configurar en Railway**:
```
SCRAPER_BRIDGE_ENABLED=true
SCRAPER_BRIDGE_URL=<URL del bridge en Render/Fly/otros>
```

El código `scraper-bridge.service.ts::searchMLCompetitors()` ya está implementado y operativo — solo requiere despliegue del bridge en una IP no bloqueada.
