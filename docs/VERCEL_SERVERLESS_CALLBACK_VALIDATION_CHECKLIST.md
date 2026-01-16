# ✅ Checklist de Validación Post-Deploy - Vercel Serverless Callback

**Fecha de implementación:** 2025-01-26  
**Commit:** `feat(oauth): add vercel serverless callback proxy for aliexpress`

---

## 🎯 Objetivo

Validar que la función serverless de Vercel para el callback de OAuth de AliExpress esté funcionando correctamente en producción.

---

## 📋 Validación Inmediata Post-Deploy (5-10 minutos)

### 1. ✅ Verificar que el deploy de Vercel se completó

**Acción:**
- Revisar Vercel Dashboard → Deployments
- Confirmar que el último deployment está "Ready" (verde)
- Verificar que el commit `3cfa372` está desplegado

**Resultado esperado:**
- ✅ Deployment exitoso sin errores
- ✅ Build completado

---

### 2. ✅ Verificar que la función serverless está disponible

**URLs a probar:**

#### A) Smoke Test Mode (Respuesta inmediata desde Vercel)
```bash
curl -X GET "https://www.ivanreseller.com/api/aliexpress/callback?code=test&state=test"
```

**Resultado esperado:**
```json
{
  "success": true,
  "mode": "smoke_test",
  "message": "callback reached vercel serverless function",
  "timestamp": "2025-01-26T..."
}
```

**Criterios de éxito:**
- ✅ HTTP Status: `200`
- ✅ Content-Type: `application/json`
- ✅ Body contiene `"mode": "smoke_test"`
- ✅ Body contiene `"message": "callback reached vercel serverless function"`

#### B) Verificar que NO devuelve SPA React

**Test visual:**
```bash
curl -X GET "https://www.ivanreseller.com/api/aliexpress/callback?code=test&state=test" | grep -i "doctype\|root\|react\|vite"
```

**Resultado esperado:**
- ✅ NO debe encontrar ningún patrón de SPA (doctype, root, react, vite)
- ✅ Solo debe devolver JSON limpio

---

### 3. ✅ Ejecutar Smoke Test Automatizado

**Comando:**
```bash
npm run smoke:prod
```

**Resultado esperado:**

#### Smoke Test debe mostrar:
```
✅ AliExpress Callback (via Vercel serverless function)
   Status: 200
   PASS: Callback reaches backend (final status 200)
   Body: {"success":true,"mode":"smoke_test",...}
```

**Archivos generados:**
- `docs/_smoke/last-smoke.json` → Verificar que `isSPA: false`
- `docs/ALIEXPRESS_DROPSHIPPING_OAUTH_PROD_VALIDATION_REPORT.FILLED.md` → Revisar recomendación: **GO**

**Criterios de éxito:**
- ✅ Callback: `pass: true`
- ✅ Callback: `isSPA: false`
- ✅ Callback: `finalStatus: 200`
- ✅ Recomendación: `GO` (no `HOLD` ni `NO-GO`)

---

### 4. ✅ Verificar que el proxy funciona (modo real)

**Test manual (con parámetros reales simulados):**
```bash
curl -X GET "https://www.ivanreseller.com/api/aliexpress/callback?code=fake123&state=fake456" -v
```

**Resultado esperado:**
- ✅ No debe devolver SPA React
- ✅ Debe hacer proxy al backend de Railway
- ✅ Status code debe ser el mismo que Railway devuelve (probablemente 400 o 500 si los parámetros son inválidos, pero NO 502)
- ✅ Body debe ser JSON o HTML del backend, NO el index.html del SPA

**Criterios de éxito:**
- ✅ NO debe ser 502 (Bad Gateway)
- ✅ NO debe devolver SPA React
- ✅ Debe preservar headers del backend (ej: `x-oauth-callback`, `x-correlation-id`)

---

## 🔧 Validación de OAuth Real (Post-Deploy + Configuración)

### 5. ✅ Actualizar Redirect URI en AliExpress App Console

**CRÍTICO:** El Redirect URI debe cambiarse de:
```
❌ https://www.ivanreseller.com/aliexpress/callback
```

A:
```
✅ https://www.ivanreseller.com/api/aliexpress/callback
```

**Pasos:**
1. Acceder a AliExpress Developer Console
2. Editar la App de Dropshipping
3. Cambiar "Callback URL" a: `https://www.ivanreseller.com/api/aliexpress/callback`
4. Guardar cambios

---

### 6. ✅ Probar flujo OAuth completo (end-to-end)

**Pasos:**
1. Iniciar sesión en `https://www.ivanreseller.com`
2. Ir a `/api-settings` (o página de configuración de APIs)
3. Hacer clic en "Autorizar OAuth" para AliExpress Dropshipping
4. Completar el flujo en AliExpress
5. Verificar que el redirect vuelve correctamente

**Resultado esperado:**
- ✅ El redirect debe llegar a: `https://www.ivanreseller.com/api/aliexpress/callback?code=...&state=...`
- ✅ No debe mostrar error 404 ni 502
- ✅ Debe mostrar página de éxito HTML o cerrar ventana popup automáticamente
- ✅ En `/api-settings`, el estado debe cambiar a "Conectado" o "Paso 2/2"

---

### 7. ✅ Verificar persistencia de tokens

**Endpoint de diagnóstico:**
```bash
# Primero, obtener token de autenticación desde la UI
# Luego:
curl -X GET "https://www.ivanreseller.com/api/marketplace-oauth/aliexpress/oauth/debug" \
  -H "Authorization: Bearer <TOKEN>"
```

**Resultado esperado:**
```json
{
  "callbackReachable": true,
  "hasTokens": true,
  "hasTokensProduction": true,
  "environment": "production",
  "status": "available",
  "message": "AliExpress Dropshipping API is available",
  "lastError": null,
  "lastAuthAt": "2025-01-26T...",
  "timestamp": "2025-01-26T..."
}
```

**Criterios de éxito:**
- ✅ `hasTokens: true`
- ✅ `status: "available"` o `"connected"`
- ✅ `lastError: null`
- ✅ `lastAuthAt` tiene fecha reciente

---

## 🚨 Troubleshooting

### Problema: Callback devuelve SPA React

**Diagnóstico:**
```bash
curl -X GET "https://www.ivanreseller.com/api/aliexpress/callback?code=test&state=test" | head -20
```

**Si ve `<html>` o `<!doctype html>`:**
- ❌ La función serverless NO se está ejecutando
- ✅ Verificar en Vercel Dashboard que `api/aliexpress/callback.ts` existe
- ✅ Verificar que el Root Directory en Vercel está vacío (no `frontend/`)
- ✅ Forzar redeploy: `git commit --allow-empty -m "trigger redeploy" && git push`

### Problema: Callback devuelve 502

**Diagnóstico:**
- Verificar que Railway backend está activo: `curl https://ivan-reseller-web-production.up.railway.app/api/health`
- Verificar variable de entorno `RAILWAY_BACKEND_URL` en Vercel Dashboard (si está configurada, debe ser correcta)
- Revisar logs de Vercel Function para ver el error exacto

### Problema: Callback devuelve 404

**Diagnóstico:**
- Verificar que la ruta es exactamente: `/api/aliexpress/callback` (con `/api/` al inicio)
- Verificar que no hay rewrites conflictivos en `vercel.json`
- Verificar que la función serverless está en la ubicación correcta: `api/aliexpress/callback.ts`

---

## ✅ Criterio de Éxito Final

**El sistema está funcionando correctamente si:**

1. ✅ Smoke test: `npm run smoke:prod` → Recomendación: **GO**
2. ✅ Callback smoke test: Devuelve JSON con `mode: "smoke_test"` (NO SPA)
3. ✅ Redirect URI actualizado en AliExpress App Console
4. ✅ Flujo OAuth completo funciona end-to-end
5. ✅ Tokens se persisten correctamente (`hasTokens: true`)
6. ✅ No hay errores 502, 404, o SPA en el callback

---

## 📝 Notas Importantes

- **Redirect URI:** Debe ser exactamente `https://www.ivanreseller.com/api/aliexpress/callback` (con `www.`, con `https://`, con `/api/` al inicio)
- **Función serverless:** Tiene prioridad sobre rewrites en `vercel.json`, por lo que `/api/aliexpress/callback` será manejado por la función, no por el rewrite de `/api/*`
- **Timeout:** La función tiene un timeout de 30 segundos para requests al backend
- **Error handling:** Errores del backend se propagan con el mismo status code (ej: 400, 500), NO 502 a menos que haya un error de conexión

---

## 🎉 Validación Completada

Una vez completados todos los pasos anteriores, el callback OAuth de AliExpress está **funcional y listo para producción**.

**Fecha de validación:** _____________  
**Validado por:** _____________  
**Estado:** [ ] ✅ PASÓ / [ ] ❌ FALLÓ (especificar motivo)

