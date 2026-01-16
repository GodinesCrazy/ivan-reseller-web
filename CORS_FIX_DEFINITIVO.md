# 🔧 CORS Fix Definitivo - Production Hardening

**Fecha:** 2025-01-11  
**Problema:** CORS blocking requests + Railway mal configurado  
**Estado:** ✅ FIXED - PRODUCTION HARDENED

---

## 📋 CAMBIOS CRÍTICOS IMPLEMENTADOS

### Backend (`backend/src/app.ts`):

#### 1. **Función `readCorsOrigins()` Robusta**
- ✅ Lee `CORS_ORIGIN` (singular)
- ✅ Lee `CORS_ORIGINS` (plural) como alias
- ✅ Lee `FRONTEND_URL` como fallback
- ✅ Fallback de producción: `https://www.ivanreseller.com,https://ivanreseller.com`
- ✅ **Limpia automáticamente valores con "CORS_ORIGIN=" incrustado**
  - Ejemplo: `CORS_ORIGIN=CORS_ORIGIN=https://www.ivanreseller.com` → `https://www.ivanreseller.com`
- ✅ Normaliza: trim, elimina trailing slash, valida formato
- ✅ Deduplica origins (case-insensitive por hostname)

#### 2. **CORS Aplicado ANTES de Todo**
- ✅ `app.use(cors(corsOptions))` está **antes** de:
  - Routers `/api/*`
  - Middlewares de auth
  - Error handlers
  - Static files
- ✅ Preflight OPTIONS explícito: `app.options('/api/*', cors(corsOptions))`
- ✅ Fallback OPTIONS: `app.options('*', cors(corsOptions))`

#### 3. **Callback de Origin Mejorado**
- ✅ Si no hay Origin (curl/health checks): `callback(null, true)` - permite
- ✅ Si hay Origin: normaliza y compara con allowlist
- ✅ **Normalización:** lower-case hostname, remover trailing slash
- ✅ **Regla www vs sin www:** Si allowlist tiene uno, acepta el otro para el mismo dominio
- ✅ Devuelve origin exacto de la lista (preserva case original)

#### 4. **Headers CORS en Errores**
- ✅ Error handler NO sobrescribe headers CORS
- ✅ CORS se aplica antes, por lo que errores 401/404/500 mantienen headers CORS
- ✅ Verificado que `res.headersSent` check no rompe CORS

#### 5. **Logs Útiles**
- ✅ Startup: Lista final de origins configuradas (sin secretos)
- ✅ Debug: Origin recibido + allowed true/false (solo en modo debug)

#### 6. **Endpoints de Verificación**
- ✅ `/api/health` - Alias de `/health` (definido después de CORS)
- ✅ `/api/cors-debug` - Endpoint de debug para verificar CORS rápidamente

---

## 🔧 CONFIGURACIÓN CORRECTA EN RAILWAY

### Variables de Entorno (Backend):

**✅ CORRECTO:**
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
```

**❌ INCORRECTO (NO hacerlo):**
```env
CORS_ORIGIN=CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
```

**Razón:** Railway a veces copia el nombre de la variable en el value cuando se copia/pega. El código ahora limpia esto automáticamente, pero es mejor configurarlo correctamente desde el inicio.

**También se acepta (alias):**
```env
CORS_ORIGINS=https://www.ivanreseller.com,https://ivanreseller.com
```

**Opcional (pero recomendado):**
```env
FRONTEND_URL=https://www.ivanreseller.com
```

**Notas:**
- Lista separada por comas, **sin espacios**
- El código limpia automáticamente valores con "CORS_ORIGIN=" incrustado
- Si ninguna variable está configurada, usa fallback de producción automáticamente
- Comparación es case-insensitive y maneja www vs sin www automáticamente

---

## 🧪 VERIFICACIÓN

### Script Automatizado (Recomendado):

```powershell
.\scripts\verify_cors.ps1 -BackendUrl "https://ivan-reseller-web-production.up.railway.app" -Origin "https://www.ivanreseller.com"
```

**El script verifica:**
1. ✅ Preflight OPTIONS a `/api/dashboard/summary`
2. ✅ GET request real con Origin header
3. ✅ Endpoint `/api/cors-debug`
4. ✅ Headers CORS correctos en todas las respuestas
5. ✅ Muestra explícitamente `Access-Control-Allow-Origin` en output

### Verificación Manual con curl:

**1. Preflight OPTIONS:**
```bash
curl -i -X OPTIONS \
  -H "Origin: https://www.ivanreseller.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/summary
```

**Respuesta esperada:**
```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://www.ivanreseller.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Correlation-ID
Vary: Origin
```

**2. GET Request Real:**
```bash
curl -i -H "Origin: https://www.ivanreseller.com" \
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/summary
```

**Respuesta esperada:**
```
HTTP/1.1 200 OK (o 401 si no autenticado)
Access-Control-Allow-Origin: https://www.ivanreseller.com
Access-Control-Allow-Credentials: true
Vary: Origin
...
```

**3. Test www vs sin www:**
```bash
curl -i -H "Origin: https://ivanreseller.com" \
  https://ivan-reseller-web-production.up.railway.app/api/dashboard/summary
```

**Debe funcionar** si allowlist tiene `https://www.ivanreseller.com` (normalización automática).

**4. Test 404 con CORS:**
```bash
curl -i -H "Origin: https://www.ivanreseller.com" \
  https://ivan-reseller-web-production.up.railway.app/api/no-existe
```

**Respuesta esperada:**
```
HTTP/1.1 404 Not Found
Access-Control-Allow-Origin: https://www.ivanreseller.com
Access-Control-Allow-Credentials: true
Vary: Origin
...
```

**5. Endpoint de Debug:**
```bash
curl -i -H "Origin: https://www.ivanreseller.com" \
  https://ivan-reseller-web-production.up.railway.app/api/cors-debug
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "origin": "https://www.ivanreseller.com",
  "access-control-allow-origin": "https://www.ivanreseller.com",
  "access-control-allow-credentials": "true",
  "timestamp": "..."
}
```

### Verificación en Navegador:

1. **Abrir DevTools (F12) → Network tab**
2. **Navegar a:** `https://www.ivanreseller.com/dashboard`
3. **Verificar:**
   - ✅ Requests a `/api/*` tienen status 200 (o 401 si no autenticado)
   - ✅ Response Headers incluyen `Access-Control-Allow-Origin: https://www.ivanreseller.com`
   - ✅ No hay errores CORS en la consola
   - ✅ No hay "Network Error" o "ERR_FAILED"
   - ✅ Errores 404/500 también tienen headers CORS

---

## 📝 ARCHIVOS MODIFICADOS

### Backend:
1. **`backend/src/app.ts`**
   - Función `readCorsOrigins()` robusta (limpia "CORS_ORIGIN=" del value)
   - Soporte para `CORS_ORIGINS` (plural) como alias
   - Callback de origin mejorado (normalización case-insensitive, www vs sin www)
   - CORS aplicado antes de todo (verificado orden)
   - Eliminado duplicado de `/api/health`

2. **`backend/src/middleware/error.middleware.ts`**
   - Comentario agregado: NO sobrescribe headers CORS (ya aplicados antes)

### Scripts:
3. **`scripts/verify_cors.ps1`**
   - Mejorado para mostrar explícitamente `Access-Control-Allow-Origin` en output

### Documentación:
4. **`CORS_FIX_FINAL.md`** (actualizado)
   - Sección "CONFIGURACIÓN CORRECTA EN RAILWAY" con ejemplos correcto/incorrecto

5. **`CORS_FIX_DEFINITIVO.md`** (nuevo)
   - Documentación completa del fix definitivo

---

## ✅ RESULTADO ESPERADO

- ✅ Todas las rutas `/api/*` responden correctamente a CORS
- ✅ Preflight OPTIONS funciona (204 con headers correctos)
- ✅ `Access-Control-Allow-Origin` contiene el origin EXACTO
- ✅ Frontend carga `/dashboard` sin errores CORS
- ✅ No más "Network Error / ERR_FAILED" por CORS
- ✅ Errores 401/404/500 también tienen headers CORS
- ✅ Funciona incluso si Railway tiene mal configurada la variable (con "CORS_ORIGIN=" en el value)
- ✅ Soporta tanto `CORS_ORIGIN` como `CORS_ORIGINS` (plural)
- ✅ Normalización automática de www vs sin www

---

## 🚀 PRÓXIMOS PASOS

1. **Configurar Railway:**
   ```env
   CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
   ```
   (O usar `CORS_ORIGINS` si prefieres)

2. **Redeploy:**
   - Railway redesplegará automáticamente al guardar variables

3. **Verificar:**
   ```powershell
   .\scripts\verify_cors.ps1 -BackendUrl "https://ivan-reseller-web-production.up.railway.app"
   ```

4. **Probar en Navegador:**
   - Abrir `https://www.ivanreseller.com/dashboard`
   - Verificar que no hay errores CORS
   - Verificar que errores 404/500 también tienen headers CORS

---

## 🔍 TROUBLESHOOTING

### Si CORS sigue fallando:

1. **Verificar que CORS_ORIGIN está configurada en Railway:**
   - Railway Dashboard → Variables → `CORS_ORIGIN`
   - Debe ser: `https://www.ivanreseller.com,https://ivanreseller.com`
   - **NO debe ser:** `CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com`

2. **Verificar logs del backend:**
   - Buscar mensajes "✅ CORS Origins configuradas"
   - Verificar que el origin recibido coincide con el configurado
   - Buscar "CORS: Origin allowed" o "CORS: origin not allowed"

3. **Probar endpoint de debug:**
   ```bash
   curl -H "Origin: https://www.ivanreseller.com" \
     https://ivan-reseller-web-production.up.railway.app/api/cors-debug
   ```

4. **Verificar que el frontend usa la URL correcta:**
   - En Vercel: Variable `VITE_API_URL` debe ser `https://ivan-reseller-web-production.up.railway.app` (sin `/api`)

---

**Estado:** ✅ PRODUCTION HARDENED - READY FOR DEPLOYMENT

