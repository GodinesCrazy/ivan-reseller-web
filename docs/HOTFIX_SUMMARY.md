# HOTFIX Summary - HTTP Stability + AliExpress API-First
**Date:** 2025-12-19  
**Commits:** `e6286b5`, `[latest]`

---

## Problemas Resueltos

### 1. ERR_HTTP_HEADERS_SENT (PRIORIDAD 1)
**Síntomas:**
- Railway devolvía 502 "Application failed to respond"
- Logs mostraban `ERR_HTTP_HEADERS_SENT` en `request-logger.middleware.js` y `error.middleware.js`

**Causa Raíz:**
- `request-logger.middleware.ts`: Callbacks `finish`/`close` podían lanzar excepciones no capturadas
- `error.middleware.ts`: No tenía try/catch al enviar respuesta, podía fallar si conexión cerrada

**Fixes Aplicados:**
- ? `request-logger.middleware.ts`: Wrap `finish`/`close` callbacks en try/catch
- ? `error.middleware.ts`: Wrap `res.status().json()` en try/catch, verificar `res.headersSent` antes de responder
- ? `404 handler`: Ya correcto (no llama `next()` después de responder)

**Evidencia:**
- Tests: `http-stability.integration.test.ts` verifica que no hay ERR_HTTP_HEADERS_SENT
- Smoke tests: Todos los endpoints responden correctamente (4/4 PASS)

---

### 2. Pantallas en Blanco por AliExpressAuthMonitor (PRIORIDAD 2)
**Síntomas:**
- AliExpressAuthMonitor activaba notificaciones "manual intervention required" cuando faltaban cookies
- Flujos quedaban esperando infinitamente, generando pantallas en blanco

**Causa Raíz:**
- AliExpressAuthMonitor se iniciaba siempre en producción
- Sistema intentaba scraping cuando no había credenciales API configuradas
- No había feature flags para deshabilitar browser automation

**Fixes Aplicados:**
- ? Feature flags agregados:
  - `ALIEXPRESS_DATA_SOURCE=api` (default: api en producción)
  - `ALIEXPRESS_AUTH_MONITOR_ENABLED=false` (default: false en producción)
  - `ALLOW_BROWSER_AUTOMATION=false` (default: false en producción)
- ? `server.ts`: Solo inicia AliExpressAuthMonitor si `ALIEXPRESS_AUTH_MONITOR_ENABLED=true`
- ? `advanced-scraper.service.ts`: Verifica flags antes de hacer scraping
  - Si `ALIEXPRESS_DATA_SOURCE=api` y no hay credenciales ? throw `AUTH_REQUIRED` error
  - Si `ALLOW_BROWSER_AUTOMATION=false` ? throw `AUTH_REQUIRED` error
- ? `opportunity-finder.service.ts`: Maneja errores `AUTH_REQUIRED` y los re-lanza (no intenta fallbacks)

**Logging:**
- Cuando scraping se corta por feature flags, se loguea claramente:
  - `[ALIEXPRESS-API-FIRST] API credentials required but not configured`
  - `[ALIEXPRESS-API-FIRST] Browser automation disabled`

---

## Feature Flags (Railway Variables)

**Recomendado para Producción:**
```
ALIEXPRESS_DATA_SOURCE=api
ALIEXPRESS_AUTH_MONITOR_ENABLED=false
ALLOW_BROWSER_AUTOMATION=false
```

**Explicación:**
- `ALIEXPRESS_DATA_SOURCE=api`: Prioriza API oficial, scraping solo como fallback si está permitido
- `ALIEXPRESS_AUTH_MONITOR_ENABLED=false`: Deshabilita monitoreo de cookies (evita pantallas en blanco)
- `ALLOW_BROWSER_AUTOMATION=false`: Deshabilita scraping con Puppeteer (más seguro, menos recursos)

**Si se necesita scraping:**
- Configurar `ALIEXPRESS_AFFILIATE_API` credentials en Settings ? API Settings
- O cambiar `ALLOW_BROWSER_AUTOMATION=true` (no recomendado en producción)

---

## Cambios en Código

### Archivos Modificados:
1. `backend/src/middleware/request-logger.middleware.ts` - Try/catch en callbacks
2. `backend/src/middleware/error.middleware.ts` - Try/catch y verificación headersSent
3. `backend/src/config/env.ts` - Feature flags agregados
4. `backend/src/server.ts` - Conditional AliExpressAuthMonitor start
5. `backend/src/services/advanced-scraper.service.ts` - API-first checks
6. `backend/src/services/opportunity-finder.service.ts` - AUTH_REQUIRED handling
7. `backend/src/__tests__/integration/http-stability.integration.test.ts` - Nuevo test

### Archivos Creados:
- `backend/src/__tests__/integration/http-stability.integration.test.ts`

---

## Verificación

**Smoke Tests (FASE 3):**
- ? `/health`: 200 OK en ~241ms
- ? `/version`: 200 OK en ~250ms
- ? `/ready`: 200/503 OK en ~500ms
- ? `/`: 404 OK en ~200ms
- ? No 502 errors observados

**TypeScript:**
- ? Compila sin errores (`npx tsc --noEmit`)

**Tests:**
- ?? Pendiente ejecutar suite completa (requiere DB setup)

---

## Próximos Pasos

1. **Railway Deployment:**
   - Los cambios están en `main`, Railway debería desplegar automáticamente
   - Verificar que feature flags estén configurados en Railway Variables

2. **Verificación Post-Deploy:**
   - Ejecutar smoke tests: `.\scripts\smoke_railway.ps1`
   - Verificar logs de Railway: no debe aparecer `ERR_HTTP_HEADERS_SENT`
   - Verificar que `/health` responde consistentemente

3. **FASE 4-6:**
   - Ejecutar tests completos
   - E2E mínimo (si aplica)
   - Certificación final GO/NO-GO

---

## Notas de Seguridad

- ? `APIS.txt` está en `.gitignore` (verificado)
- ? Secretos deben ir a Railway Variables, no al repo
- ? Scripts `load-apis-from-txt.ts` funcionan pero no commitean secretos

---

**Última actualización:** 2025-12-19  
**Estado:** HOTFIX aplicado, pendiente verificación en Railway
