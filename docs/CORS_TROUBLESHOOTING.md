# 🔧 CORS Troubleshooting Guide

**Última actualización:** 2025-01-11  
**Estado:** Production Ready

---

## 📋 Índice

1. [Síntomas Comunes](#síntomas-comunes)
2. [Diagnóstico Rápido](#diagnóstico-rápido)
3. [Verificación Paso a Paso](#verificación-paso-a-paso)
4. [Errores Específicos y Soluciones](#errores-específicos-y-soluciones)
5. [Configuración Correcta en Railway](#configuración-correcta-en-railway)
6. [Scripts de Verificación](#scripts-de-verificación)

---

## 🚨 Síntomas Comunes

### Error en Navegador:
```
Access to fetch at 'https://ivan-reseller-web-production.up.railway.app/api/dashboard/stats' 
from origin 'https://www.ivanreseller.com' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### Error en Consola:
```
AxiosError: Network Error
code: "ERR_NETWORK"
message: "Network Error"
```

### Síntomas Adicionales:
- ✅ `/health` funciona (200 OK)
- ❌ `/api/dashboard/*` falla con CORS
- ❌ `/api/products` falla con CORS
- ❌ `/api/activity` falla con CORS
- ❌ Preflight OPTIONS devuelve 403 o sin headers CORS

---

## 🔍 Diagnóstico Rápido

### 1. Verificar Endpoint de Debug

```powershell
curl -i -H "Origin: https://www.ivanreseller.com" `
  https://ivan-reseller-web-production.up.railway.app/api/cors-debug
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "receivedOrigin": "https://www.ivanreseller.com",
  "matched": true,
  "matchedRule": "hostname-match",
  "matchedOrigin": "https://www.ivanreseller.com",
  "allowedOriginsParsed": [
    "https://www.ivanreseller.com",
    "https://ivanreseller.com"
  ],
  "allowedHostNoWww": ["ivanreseller.com"],
  "envCorsOriginRaw": "https://www.ivanreseller.com,https://ivanreseller.com",
  "access-control-allow-origin": "https://www.ivanreseller.com",
  "access-control-allow-credentials": "true"
}
```

**Si `matched` es `false`:**
- Verificar `allowedOriginsParsed` - NO debe contener `"CORS_ORIGIN=..."` o `"CORS_ORIGINS=..."`
- Verificar `envCorsOriginRaw` - debe ser una lista separada por comas SIN prefijos

### 2. Verificar Preflight OPTIONS

```powershell
curl -i -X OPTIONS `
  -H "Origin: https://www.ivanreseller.com" `
  -H "Access-Control-Request-Method: GET" `
  -H "Access-Control-Request-Headers: Content-Type, Authorization" `
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/stats
```

**Respuesta esperada:**
```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://www.ivanreseller.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Vary: Origin
Access-Control-Expose-Headers: Set-Cookie
Access-Control-Max-Age: 86400
```

**Si falta `Access-Control-Allow-Origin`:**
- El middleware CORS no se está ejecutando antes de los routers
- Verificar orden de middlewares en `backend/src/app.ts`

### 3. Verificar GET Real (con 401 esperado)

```powershell
curl -i -H "Origin: https://www.ivanreseller.com" `
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/stats
```

**Respuesta esperada (aunque sea 401):**
```
HTTP/1.1 401 Unauthorized
Access-Control-Allow-Origin: https://www.ivanreseller.com
Access-Control-Allow-Credentials: true
Vary: Origin
Cache-Control: no-store, no-cache, must-revalidate, private
...
```

**Si falta `Access-Control-Allow-Origin` en 401:**
- El error handler está borrando headers CORS
- Verificar `backend/src/middleware/error.middleware.ts`

---

## ✅ Verificación Paso a Paso

### Paso 1: Verificar Variable en Railway

1. Abrir Railway Dashboard
2. Seleccionar servicio backend
3. Ir a "Variables"
4. Buscar `CORS_ORIGIN` o `CORS_ORIGINS`

**✅ CORRECTO:**
```
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
```

**❌ INCORRECTO:**
```
CORS_ORIGIN=CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
```

**Nota:** Aunque el código limpia prefijos automáticamente, es mejor configurarlo correctamente.

### Paso 2: Verificar Logs del Backend

En Railway, revisar logs de startup:

```
✅ CORS Origins configuradas (2):
   1. https://www.ivanreseller.com
   2. https://ivanreseller.com
✅ CORS Hosts permitidos (sin www): ivanreseller.com
```

**Si ves warnings:**
```
⚠️  CORS_ORIGIN/CORS_ORIGINS no configurada en producción, usando fallback de producción
```
- El fallback está activo (funciona), pero es mejor configurar la variable explícitamente.

### Paso 3: Ejecutar Script de Verificación

```powershell
.\scripts\verify_cors.ps1 -BackendUrl "https://ivan-reseller-web-production.up.railway.app" -Origin "https://www.ivanreseller.com"
```

**Salida esperada:**
```
✅ Preflight responded with 204
✅ Access-Control-Allow-Origin: https://www.ivanreseller.com
✅ Origin matches exactly!
✅ Access-Control-Allow-Credentials: true
✅ Vary: Origin (correct)
✅ CORS headers present in 401: Access-Control-Allow-Origin = https://www.ivanreseller.com
✅ Origin matched successfully!
```

### Paso 4: Verificar en Navegador

1. Abrir `https://www.ivanreseller.com/dashboard`
2. Abrir DevTools (F12) → Network
3. Filtrar por "dashboard" o "api"
4. Verificar que:
   - ✅ Preflight OPTIONS devuelve 204
   - ✅ GET devuelve 200 o 401 (NO CORS error)
   - ✅ Response Headers incluyen `Access-Control-Allow-Origin: https://www.ivanreseller.com`

---

## 🔧 Errores Específicos y Soluciones

### Error 1: "No 'Access-Control-Allow-Origin' header is present"

**Causa:** El header CORS no está presente en la respuesta.

**Solución:**
1. Verificar que `CORS_ORIGIN` está configurada en Railway
2. Verificar que el middleware CORS hardened se ejecuta ANTES de los routers:
   ```typescript
   // backend/src/app.ts línea ~345
   app.use(createCorsHardenedMiddleware(allowedOrigins));
   // ... luego routers
   ```
3. Verificar que el error handler NO borra headers:
   ```typescript
   // backend/src/middleware/error.middleware.ts
   // NO debe hacer res.setHeader que sobrescriba CORS
   ```

### Error 2: "Origin mismatch" (header existe pero no matchea)

**Causa:** El `Access-Control-Allow-Origin` no coincide exactamente con el Origin del request.

**Solución:**
1. Verificar que `CORS_ORIGIN` incluye el dominio exacto (con o sin www)
2. Verificar que el callback de CORS devuelve el origin EXACTO (no `true`):
   ```typescript
   // backend/src/app.ts línea ~434
   return callback(null, matchedOrigin); // ✅ Origin exacto
   // NO: return callback(null, true);
   ```

### Error 3: "CORS_ORIGIN=..." aparece en allowedOriginsParsed

**Causa:** El valor de la variable en Railway tiene el prefijo incrustado.

**Solución:**
1. El código ya limpia esto automáticamente, pero es mejor corregir la variable:
   - Railway → Variables → `CORS_ORIGIN`
   - Cambiar de: `CORS_ORIGIN=https://www.ivanreseller.com`
   - A: `https://www.ivanreseller.com,https://ivanreseller.com`
2. Redeployar el servicio

### Error 4: Preflight OPTIONS devuelve 403

**Causa:** El middleware CORS rechaza el origin antes de llegar a los routers.

**Solución:**
1. Verificar que el origin está en `allowedOrigins`
2. Verificar que el matching funciona (usar `/api/cors-debug`)
3. Verificar que no hay bloqueo por Helmet/CSP

### Error 5: 304 Not Modified sin CORS headers

**Causa:** ETag está habilitado y el navegador cachea respuestas sin CORS.

**Solución:**
1. Verificar que ETag está deshabilitado:
   ```typescript
   // backend/src/app.ts
   app.set('etag', false);
   ```
2. Verificar que `/api/*` tiene `Cache-Control: no-store`:
   ```typescript
   // En createCorsHardenedMiddleware
   if (path.startsWith('/api/')) {
     res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
   }
   ```

### Error 6: "Network Error" en lugar de 401

**Causa:** El frontend no distingue entre error CORS y error 401.

**Solución:**
1. Verificar que el backend devuelve CORS headers incluso en 401
2. Verificar que axios maneja 401 correctamente:
   ```typescript
   // frontend/src/services/api.ts
   api.interceptors.response.use(
     response => response,
     error => {
       if (error.response?.status === 401) {
         // Manejar 401 (no es CORS)
       } else if (!error.response) {
         // Posible error CORS o red
       }
     }
   );
   ```

---

## ⚙️ Configuración Correcta en Railway

### Variables Requeridas:

```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
```

**O (alias):**
```env
CORS_ORIGINS=https://www.ivanreseller.com,https://ivanreseller.com
```

**Opcional (fallback):**
```env
FRONTEND_URL=https://www.ivanreseller.com
```

### Formato:
- ✅ Lista separada por comas
- ✅ Con o sin espacios (el código los limpia)
- ✅ Con o sin trailing slash (el código los limpia)
- ❌ NO incluir prefijo `CORS_ORIGIN=` en el valor

### Verificación Post-Configuración:

1. Guardar variables en Railway
2. Redeployar servicio (automático o manual)
3. Verificar logs de startup:
   ```
   ✅ CORS Origins configuradas (2):
      1. https://www.ivanreseller.com
      2. https://ivanreseller.com
   ```
4. Ejecutar script de verificación:
   ```powershell
   .\scripts\verify_cors.ps1 -BackendUrl "https://ivan-reseller-web-production.up.railway.app"
   ```

---

## 🧪 Scripts de Verificación

### PowerShell (Windows):

```powershell
.\scripts\verify_cors.ps1 `
  -BackendUrl "https://ivan-reseller-web-production.up.railway.app" `
  -Origin "https://www.ivanreseller.com"
```

### Bash (Linux/Mac):

```bash
# Crear script equivalente o usar curl manualmente
curl -i -X OPTIONS \
  -H "Origin: https://www.ivanreseller.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/stats
```

### Verificación Manual con curl:

```bash
# 1. Preflight
curl -i -X OPTIONS \
  -H "Origin: https://www.ivanreseller.com" \
  -H "Access-Control-Request-Method: GET" \
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/stats

# 2. GET real
curl -i \
  -H "Origin: https://www.ivanreseller.com" \
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/stats

# 3. Debug endpoint
curl -i \
  -H "Origin: https://www.ivanreseller.com" \
  https://ivan-reseller-web-production.up.railway.app/api/cors-debug
```

---

## 📚 Referencias

- [CORS_FIX_FINAL_2.md](../CORS_FIX_FINAL_2.md) - Documentación técnica del fix
- [GO_LIVE_CHECKLIST.md](../GO_LIVE_CHECKLIST.md) - Checklist de despliegue
- [RAILWAY_ENV_SETUP.md](../RAILWAY_ENV_SETUP.md) - Configuración de variables en Railway

---

## 🆘 Soporte

Si después de seguir esta guía el problema persiste:

1. **Recopilar información:**
   - Output completo de `verify_cors.ps1`
   - Response de `/api/cors-debug`
   - Logs del backend (Railway)
   - Screenshot de DevTools Network tab

2. **Verificar:**
   - Variables en Railway (screenshot)
   - Orden de middlewares en `backend/src/app.ts`
   - Versión del código desplegado

3. **Reportar:**
   - Incluir toda la información recopilada
   - Especificar qué pasos de esta guía ya se intentaron

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

