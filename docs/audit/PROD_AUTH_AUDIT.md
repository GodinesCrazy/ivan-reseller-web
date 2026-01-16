# 🔍 Auditoría Auth en Producción (401/403 vs 502) + Dominio (www vs apex)

**Fecha:** 2025-12-26  
**Objetivo:** Confirmar si el frontend está interpretando errores de AUTH como 502 y normalizar errores de auth  
**Estado:** ✅ Auditoría completada

---

## 📊 RESUMEN EJECUTIVO

### Hallazgos Principales

1. **❌ PROBLEMA CRÍTICO:** Los errores de autenticación están devolviendo `errorCode: "INTERNAL_ERROR"` en lugar de `"UNAUTHORIZED"`
   - Cuando se lanza `new AppError('Authentication required', 401)`, NO se especifica `errorCode`
   - El constructor de `AppError` usa `ErrorCode.INTERNAL_ERROR` como default (línea 53 de error.middleware.ts)
   - Esto confunde al frontend y puede hacer que errores de auth se interpreten incorrectamente

2. **✅ STATUS HTTP CORRECTO:** El backend devuelve 401 correctamente cuando falta autenticación
   - `auth.middleware.ts` línea 143: `throw new AppError('Authentication required', 401)`
   - El error handler respeta el `statusCode` 401 (línea 85 de error.middleware.ts)

3. **⚠️ COOKIES CROSS-DOMAIN:** Configuración correcta pero potencialmente frágil
   - Cookies usan `sameSite: 'none'` cuando hay cross-domain (Railway vs Vercel)
   - Requiere `secure: true` (ya está implementado)
   - Domain NO se establece cuando hay cross-domain (correcto)
   - Problema potencial: si el usuario accede a veces `www.ivanreseller.com` y a veces `ivanreseller.com`, las cookies NO se comparten (son dominios diferentes)

4. **✅ FRONTEND MANEJO CORRECTO:** El frontend maneja 401 correctamente (logout + redirect)
   - `frontend/src/services/api.ts` línea 109: `if (status === 401) { logout(); redirect('/login'); }`
   - El frontend NO muestra toast "Backend 502" para 401 (solo para 502/503/504)

---

## 🔍 TABLA DE ENDPOINTS: STATUS REAL + BODY

### Endpoints Críticos

| Endpoint | Método | Sin Auth | Con Auth | Status | Body |
|----------|--------|----------|----------|--------|------|
| `/api/health` | GET | ✅ 200 | ✅ 200 | 200 | `{ status: "healthy", ... }` |
| `/api/dashboard/stats` | GET | ❌ 401 | ✅ 200 | 401 | `{ success: false, error: "Authentication required", errorCode: "INTERNAL_ERROR", ... }` |
| `/api/products` | GET | ❌ 401 | ✅ 200 | 401 | `{ success: false, error: "Authentication required", errorCode: "INTERNAL_ERROR", ... }` |
| `/api/credentials` | GET | ❌ 401 | ✅ 200 | 401 | `{ success: false, error: "Authentication required", errorCode: "INTERNAL_ERROR", ... }` |
| `/api/auth/login` | POST | N/A | N/A | 200/401 | `{ success: true, token, ... }` o `{ success: false, error, ... }` |

**NOTA:** Todos los endpoints protegidos devuelven `errorCode: "INTERNAL_ERROR"` cuando deberían devolver `errorCode: "UNAUTHORIZED"`.

---

## 🔎 DÓNDE SE GENERA "Authentication required"

### 1. Middleware de Autenticación

**Archivo:** `backend/src/middleware/auth.middleware.ts`

**Línea 143:**
```typescript
if (!token) {
  throw new AppError('Authentication required', 401);
}
```

**Problema:** No especifica `errorCode`, así que usa el default `ErrorCode.INTERNAL_ERROR`.

**Otras ocurrencias:**
- Línea 149: `throw new AppError('Token has been revoked', 401);`
- Línea 158: `throw new AppError('Token expired', 401);`
- Línea 160: `throw new AppError('Invalid token', 401);`
- Línea 170: `return next(new AppError('Authentication required', 401));`

**Total:** 5 ocurrencias en `auth.middleware.ts` que deberían usar `ErrorCode.UNAUTHORIZED` o `ErrorCode.TOKEN_EXPIRED` o `ErrorCode.INVALID_TOKEN`.

---

### 2. Error Handler Global

**Archivo:** `backend/src/middleware/error.middleware.ts`

**Constructor de AppError (líneas 50-63):**
```typescript
constructor(
  message: string, 
  statusCode: number = 500,
  errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,  // ❌ DEFAULT INCORRECTO PARA AUTH
  details?: Record<string, any>
) {
  super(message);
  this.statusCode = statusCode;
  this.isOperational = true;
  this.errorCode = errorCode;  // Si no se especifica, usa INTERNAL_ERROR
  this.errorId = uuidv4();
  this.details = details;
  Error.captureStackTrace(this, this.constructor);
}
```

**Error Handler (líneas 84-90):**
```typescript
if (err instanceof AppError) {
  statusCode = err.statusCode;  // ✅ Respeta 401
  message = err.message;        // ✅ Respeta "Authentication required"
  isOperational = err.isOperational;
  errorCode = err.errorCode;    // ❌ Usa INTERNAL_ERROR si no se especificó
  errorId = err.errorId;
  details = err.details;
}
```

**Manejo de errores JWT (líneas 95-102):**
```typescript
else if (err.name === 'JsonWebTokenError') {
  statusCode = 401;
  message = 'Invalid token';
  errorCode = ErrorCode.INVALID_TOKEN;  // ✅ CORRECTO
} else if (err.name === 'TokenExpiredError') {
  statusCode = 401;
  message = 'Token expired';
  errorCode = ErrorCode.TOKEN_EXPIRED;  // ✅ CORRECTO
}
```

**Problema:** Solo los errores JWT nativos se mapean correctamente. Los `AppError` con statusCode 401 pero sin errorCode específico usan `INTERNAL_ERROR`.

---

## ❓ POR QUÉ SALE errorCode INTERNAL_ERROR

### Causa Raíz

1. **AppError se lanza sin errorCode:**
   ```typescript
   throw new AppError('Authentication required', 401);
   // Equivale a:
   throw new AppError('Authentication required', 401, ErrorCode.INTERNAL_ERROR);
   ```

2. **El constructor usa INTERNAL_ERROR como default:**
   ```typescript
   constructor(
     message: string, 
     statusCode: number = 500,
     errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,  // ❌ Default incorrecto
     ...
   )
   ```

3. **El error handler respeta el errorCode del AppError:**
   ```typescript
   if (err instanceof AppError) {
     errorCode = err.errorCode;  // Usa INTERNAL_ERROR
   }
   ```

4. **Resultado:** El frontend recibe:
   ```json
   {
     "success": false,
     "error": "Authentication required",
     "errorCode": "INTERNAL_ERROR",  // ❌ INCORRECTO
     "statusCode": 401  // ✅ CORRECTO
   }
   ```

### Impacto

- El frontend recibe status 401 correcto, así que maneja el error correctamente (logout + redirect)
- Sin embargo, el `errorCode: "INTERNAL_ERROR"` puede confundir logs y monitoreo
- Si algún código del frontend chequea `errorCode === "INTERNAL_ERROR"`, podría interpretar incorrectamente errores de auth

---

## 🍪 COOKIES/SESIÓN: Configuración Actual

### Cómo Funciona la Auth

1. **Token en Cookie (httpOnly):**
   - Prioridad 1: Token desde cookie `req.cookies?.token`
   - Prioridad 2: Token desde header `Authorization: Bearer <token>`

2. **Configuración de Cookies:**

**Login (auth.routes.ts líneas 96-102):**
```typescript
const cookieOptions: any = {
  httpOnly: true,
  secure: isHttps,  // ✅ true en producción (HTTPS)
  sameSite: cookieDomain ? 'lax' : 'none',  // 'none' para cross-domain
  maxAge: 60 * 60 * 1000,  // 1 hora
  path: '/',
};

if (cookieDomain) {
  cookieOptions.domain = cookieDomain;  // Solo si mismo dominio base
}
```

**Lógica de Domain (auth.routes.ts líneas 69-93):**
```typescript
let cookieDomain: string | undefined = undefined;
try {
  const frontendUrlObj = new URL(frontendUrl);
  const frontendHostname = frontendUrlObj.hostname;  // ej: www.ivanreseller.com
  const backendHostname = req.get('host') || req.hostname || '';  // ej: railway.app
  
  const frontendBaseDomain = frontendHostname.replace(/^[^.]+\./, '');  // ivanreseller.com
  const backendBaseDomain = backendHostname.replace(/^[^.]+\./, '');    // railway.app
  
  if (frontendBaseDomain === backendBaseDomain && frontendBaseDomain !== 'localhost') {
    cookieDomain = `.${frontendBaseDomain}`;  // .ivanreseller.com (funciona para www y apex)
  } else {
    cookieDomain = undefined;  // Cross-domain: NO establecer domain
  }
} catch (e) {
  cookieDomain = undefined;
}
```

**Resultado en Producción:**
- Backend en Railway: `ivan-reseller-web-production.up.railway.app`
- Frontend en Vercel: `www.ivanreseller.com` o `ivanreseller.com`
- Domain base diferente → `cookieDomain = undefined`
- Cookies se establecen sin domain, así que solo se envían al dominio que las estableció (Railway)
- **PROBLEMA:** Como usamos proxy `/api` en Vercel, las cookies NO se establecen en Railway, se establecen en Vercel (mismo origen)

**Con Proxy `/api`:**
- Frontend hace request a: `https://www.ivanreseller.com/api/auth/login`
- Vercel rewrite a: `https://...railway.app/api/auth/login`
- Backend establece cookie sin domain (cross-domain)
- Cookie se establece para dominio de Railway, pero el navegador NO la envía de vuelta porque el request es a `www.ivanreseller.com`

**⚠️ PROBLEMA POTENCIAL:** Con proxy `/api`, las cookies NO funcionan correctamente si el backend intenta establecerlas con domain de Railway.

**Solución Actual (asumida):**
- El código establece cookies sin domain cuando hay cross-domain
- El navegador debería aceptar cookies cross-domain con `sameSite: 'none'` y `secure: true`
- Sin embargo, si el proxy de Vercel no reenvía cookies correctamente, puede haber problemas

---

### Dominio Canónico: www vs apex

**Estado Actual:**
- Referencias a `www.ivanreseller.com` en código
- Referencias a `ivanreseller.com` en código
- No hay redirección explícita de apex → www

**Problema Potencial:**
- Si el usuario accede a `ivanreseller.com` y luego a `www.ivanreseller.com` (o viceversa), las cookies NO se comparten (son dominios diferentes)
- Necesita dominio canónico consistente o cookies con `domain: ".ivanreseller.com"` (solo funciona si backend y frontend están en mismo dominio base)

**Recomendación:**
- Configurar Vercel para redirigir `ivanreseller.com` → `www.ivanreseller.com` (o viceversa)
- O usar cookies con `domain: ".ivanreseller.com"` si backend y frontend están en mismo dominio base

---

## 🌐 FRONTEND: MAPPING DE ERRORES

### Cómo Clasifica Errores el Frontend

**Archivo:** `frontend/src/services/api.ts`

**Response Interceptor (líneas 57-161):**

1. **Network Error (sin response):**
   ```typescript
   if (!error.response) {
     // CORS, timeout, DNS, backend caído
     toast.error('Backend no disponible...');
   }
   ```

2. **401 Unauthorized:**
   ```typescript
   if (status === 401) {
     await useAuthStore.getState().logout();
     toast.error('Sesión expirada. Por favor, inicia sesión nuevamente.');
     window.location.href = '/login';
   }
   ```
   **✅ CORRECTO:** No muestra toast "Backend 502", maneja 401 correctamente.

3. **403 Forbidden:**
   ```typescript
   if (status === 403) {
     toast.error('No tienes permisos para realizar esta acción.');
   }
   ```

4. **502/503/504 Bad Gateway:**
   ```typescript
   if (status === 502 || status === 503 || status === 504) {
     toast.error(`Backend no disponible (${status}). Verifica que Railway esté corriendo.`);
   }
   ```

**Conclusión:** El frontend NO muestra toast "Backend 502" para errores 401. Solo lo muestra para 502/503/504.

**Sin embargo:** Si hay un network error (sin response) que se interpreta como CORS o backend caído, podría mostrar el toast incorrectamente.

---

### Endpoints que Llaman Dashboard/Products/Credentials

**Dashboard (`frontend/src/pages/Dashboard.tsx`):**
- `/api/dashboard/stats` - Requiere auth
- `/api/dashboard/recent-activity` - Requiere auth
- `/api/products` - Requiere auth
- `/api/ai-suggestions` - Requiere auth

**Products (`frontend/src/pages/Products.tsx`):**
- `/api/products` - Requiere auth

**APISettings (`frontend/src/pages/APISettings.tsx`):**
- `/api/credentials` - Requiere auth

**Comportamiento Esperado:**
- Sin auth → 401 → Frontend hace logout + redirect a /login
- Con auth → 200 → Datos cargados correctamente

---

## 🧪 EVIDENCIA REPRODUCIBLE

### En Dominio Vercel (www.ivanreseller.com o ivanreseller.com)

**Sin Auth (no logueado):**

```bash
curl -X GET https://www.ivanreseller.com/api/products \
  -H "Content-Type: application/json"
```

**Respuesta Esperada:**
```json
{
  "success": false,
  "error": "Authentication required",
  "errorCode": "INTERNAL_ERROR",  // ❌ Debería ser "UNAUTHORIZED"
  "errorId": "...",
  "correlationId": "...",
  "timestamp": "2025-12-26T...",
  "statusCode": 401  // ✅ CORRECTO
}
```

**Con Auth (logueado):**

```bash
curl -X GET https://www.ivanreseller.com/api/products \
  -H "Content-Type: application/json" \
  -H "Cookie: token=..."
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "data": {
    "products": [...]
  }
}
```

---

### En Railway Directo (ivan-reseller-web-production.up.railway.app)

**Sin Auth:**

```bash
curl -X GET https://ivan-reseller-web-production.up.railway.app/api/products \
  -H "Content-Type: application/json"
```

**Respuesta Esperada:**
```json
{
  "success": false,
  "error": "Authentication required",
  "errorCode": "INTERNAL_ERROR",  // ❌ Debería ser "UNAUTHORIZED"
  "errorId": "...",
  "correlationId": "...",
  "timestamp": "2025-12-26T...",
  "statusCode": 401  // ✅ CORRECTO
}
```

**NOTA:** Esto es esperable porque no hay cookies en railway.app directo. El problema es el `errorCode: "INTERNAL_ERROR"`.

---

## 📋 DIAGNÓSTICO FINAL

### (a) Auth Mal Mapeada: ✅ CONFIRMADO

**Problema:** Los errores de autenticación devuelven `errorCode: "INTERNAL_ERROR"` en lugar de `errorCode: "UNAUTHORIZED"`.

**Impacto:**
- Status HTTP 401 es correcto → Frontend maneja correctamente (logout + redirect)
- `errorCode: "INTERNAL_ERROR"` confunde logs y monitoreo
- Si algún código chequea `errorCode`, puede interpretar incorrectamente

**Solución:** Especificar `errorCode` correcto al lanzar `AppError` para errores de auth.

---

### (b) Cookies Dominio: ⚠️ POTENCIAL PROBLEMA

**Problema:** Con proxy `/api`, las cookies pueden no funcionar correctamente si el backend intenta establecerlas con domain de Railway.

**Estado Actual:**
- El código NO establece domain cuando hay cross-domain (correcto)
- Usa `sameSite: 'none'` y `secure: true` (correcto)
- Sin embargo, con proxy `/api`, las cookies deberían funcionar porque el request es same-origin desde el navegador

**Validación Necesaria:**
- Verificar en DevTools si las cookies se establecen correctamente después de login
- Verificar si las cookies se envían en requests subsiguientes a `/api/*`

**Recomendación:**
- Si hay problemas con cookies, considerar usar tokens en localStorage + header Authorization como fallback (ya está implementado)

---

### (c) Frontend No Envía Credenciales: ✅ CORRECTO

**Estado:**
- Frontend usa `withCredentials: true` en axios (línea 13 de api.ts)
- Frontend envía cookies automáticamente
- Si cookies no funcionan, usa token de localStorage en header Authorization (fallback, líneas 21-31)

**Conclusión:** El frontend SÍ envía credenciales correctamente.

---

## 🎯 CONCLUSIÓN

### Problema Principal

**Los errores de autenticación devuelven `errorCode: "INTERNAL_ERROR"` en lugar de `errorCode: "UNAUTHORIZED"`.**

Esto NO afecta el comportamiento del frontend (401 se maneja correctamente), pero confunde logs y monitoreo.

### Problemas Secundarios

1. **Dominio canónico:** No hay redirección explícita de apex → www (o viceversa)
   - Impacto: Cookies pueden no compartirse si usuario accede a ambos dominios

2. **Cookies cross-domain:** Con proxy `/api`, las cookies deberían funcionar, pero necesita validación

---

## 📝 RECOMENDACIONES

### Inmediatas (P0)

1. ✅ Especificar `errorCode` correcto al lanzar `AppError` para errores de auth
   - `ErrorCode.UNAUTHORIZED` para "Authentication required"
   - `ErrorCode.TOKEN_EXPIRED` para "Token expired"
   - `ErrorCode.INVALID_TOKEN` para "Invalid token"

### Corto Plazo (P1)

2. ⚠️ Validar que las cookies funcionan correctamente con proxy `/api`
   - Verificar en DevTools después de login
   - Verificar que se envían en requests subsiguientes

3. ⚠️ Configurar dominio canónico en Vercel
   - Redirigir `ivanreseller.com` → `www.ivanreseller.com` (o viceversa)

---

**Última actualización:** 2025-12-26  
**Estado:** ✅ Auditoría completada, pendiente implementación de fix

