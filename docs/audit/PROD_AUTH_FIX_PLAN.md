# ✅ Plan de Fix - Auth en Producción (401/403 vs 502)

**Fecha:** 2025-12-26  
**Prerequisito:** Ya existe `docs/audit/PROD_AUTH_AUDIT.md`  
**Objetivo:** Normalizar errores de auth (HTTP status + errorCode) y evitar "INTERNAL_ERROR" para auth  
**Estado:** ⏳ Pendiente implementación

---

## 📊 RESUMEN EJECUTIVO

### Cambios Requeridos

1. **Backend:** Especificar `errorCode` correcto al lanzar `AppError` para errores de auth
   - Cambiar 5 ocurrencias en `auth.middleware.ts`
   - Cambiar múltiples ocurrencias en otros archivos (system.routes.ts, api-check.middleware.ts, etc.)

2. **Backend (Opcional):** Mejorar constructor de `AppError` para inferir `errorCode` basado en `statusCode`
   - Si `statusCode === 401` y no se especifica `errorCode`, usar `ErrorCode.UNAUTHORIZED` por defecto
   - Si `statusCode === 403` y no se especifica `errorCode`, usar `ErrorCode.FORBIDDEN` por defecto

3. **Frontend:** No requiere cambios (ya maneja 401 correctamente)

4. **Infraestructura (Opcional):** Configurar dominio canónico en Vercel
   - Redirigir `ivanreseller.com` → `www.ivanreseller.com` (o viceversa)

---

## 🔧 CAMBIOS DETALLADOS

### 1. Backend: Especificar errorCode en auth.middleware.ts

**Archivo:** `backend/src/middleware/auth.middleware.ts`

**Cambio 1.1: Authentication required (sin token)**
- **Línea 143:** `throw new AppError('Authentication required', 401);`
- **Cambiar a:** `throw new AppError('Authentication required', 401, ErrorCode.UNAUTHORIZED);`

**Cambio 1.2: Token revoked**
- **Línea 149:** `throw new AppError('Token has been revoked', 401);`
- **Cambiar a:** `throw new AppError('Token has been revoked', 401, ErrorCode.INVALID_TOKEN);`

**Cambio 1.3: Token expired**
- **Línea 158:** `throw new AppError('Token expired', 401);`
- **Cambiar a:** `throw new AppError('Token expired', 401, ErrorCode.TOKEN_EXPIRED);`

**Cambio 1.4: Invalid token**
- **Línea 160:** `throw new AppError('Invalid token', 401);`
- **Cambiar a:** `throw new AppError('Invalid token', 401, ErrorCode.INVALID_TOKEN);`

**Cambio 1.5: Authentication required (en authorize)**
- **Línea 170:** `return next(new AppError('Authentication required', 401));`
- **Cambiar a:** `return next(new AppError('Authentication required', 401, ErrorCode.UNAUTHORIZED));`

---

### 2. Backend: Especificar errorCode en otros archivos

**Archivo:** `backend/src/middleware/api-check.middleware.ts`

**Ocurrencias (5):**
- Línea 25: `throw new AppError('User not authenticated', 401);`
- Línea 81: `throw new AppError('User not authenticated', 401);`
- Línea 126: `throw new AppError('User not authenticated', 401);`
- Línea 153: `throw new AppError('User not authenticated', 401);`
- Línea 180: `throw new AppError('User not authenticated', 401);`

**Cambiar todas a:** `throw new AppError('User not authenticated', 401, ErrorCode.UNAUTHORIZED);`

---

**Archivo:** `backend/src/api/routes/system.routes.ts`

**Ocurrencias (4):**
- Línea 75: `throw new AppError('User not authenticated', 401);`
- Línea 124: `throw new AppError('User not authenticated', 401);`
- Línea 162: `throw new AppError('User not authenticated', 401);`
- Línea 201: `throw new AppError('User not authenticated', 401);`

**Cambiar todas a:** `throw new AppError('User not authenticated', 401, ErrorCode.UNAUTHORIZED);`

---

**Archivo:** `backend/src/api/routes/auth.routes.ts`

**Ocurrencia (1):**
- Línea 479: `throw new AppError('User not authenticated', 401);`

**Cambiar a:** `throw new AppError('User not authenticated', 401, ErrorCode.UNAUTHORIZED);`

---

**Archivo:** `backend/src/services/auth.service.ts`

**Ocurrencias (múltiples, revisar todas):**
- Línea 121: `throw new AppError('Invalid credentials', 401);` → `ErrorCode.UNAUTHORIZED`
- Línea 134: `throw new AppError('Invalid credentials', 401);` → `ErrorCode.UNAUTHORIZED`
- Línea 200: `throw new AppError('Invalid token', 401);` → `ErrorCode.INVALID_TOKEN`
- Línea 217: `throw new AppError('Current password is incorrect', 401);` → `ErrorCode.UNAUTHORIZED`
- Línea 273: `throw new AppError('Refresh token has been revoked', 401);` → `ErrorCode.INVALID_TOKEN`
- Línea 284: `throw new AppError('Invalid refresh token', 401);` → `ErrorCode.INVALID_TOKEN`
- Línea 290: `throw new AppError('Refresh token expired', 401);` → `ErrorCode.TOKEN_EXPIRED`
- Línea 295: `throw new AppError('Refresh token has been revoked', 401);` → `ErrorCode.INVALID_TOKEN`

---

**Archivo:** `backend/src/services/ebay.service.ts`

**Ocurrencias (2):**
- Línea 384: `throw new AppError(..., 401);` → Revisar contexto y usar `ErrorCode.UNAUTHORIZED` o `ErrorCode.INVALID_TOKEN`
- Línea 749: `throw new AppError('Failed to authenticate with eBay API', 401);` → `ErrorCode.UNAUTHORIZED`

---

**Archivo:** `backend/src/services/mercadolibre.service.ts`

**Ocurrencias (2):**
- Línea 171: `throw new AppError(..., 401);` → Revisar contexto y usar `ErrorCode.UNAUTHORIZED` o `ErrorCode.INVALID_TOKEN`
- Línea 189: `throw new AppError('MercadoLibre authentication required', 401);` → `ErrorCode.UNAUTHORIZED`

---

**Archivo:** `backend/src/services/paypal-payout.service.ts`

**Ocurrencia (1):**
- Línea 210: `throw new AppError('PayPal authentication failed: ...', 401);` → `ErrorCode.UNAUTHORIZED`

---

### 3. Backend (Opcional): Mejorar constructor de AppError

**Archivo:** `backend/src/middleware/error.middleware.ts`

**Cambio:** Inferir `errorCode` basado en `statusCode` si no se especifica:

```typescript
constructor(
  message: string, 
  statusCode: number = 500,
  errorCode?: ErrorCode,  // Cambiar a opcional
  details?: Record<string, any>
) {
  super(message);
  this.statusCode = statusCode;
  this.isOperational = true;
  
  // ✅ Inferir errorCode basado en statusCode si no se especifica
  if (errorCode) {
    this.errorCode = errorCode;
  } else {
    // Inferir errorCode por defecto basado en statusCode
    if (statusCode === 401) {
      this.errorCode = ErrorCode.UNAUTHORIZED;
    } else if (statusCode === 403) {
      this.errorCode = ErrorCode.FORBIDDEN;
    } else if (statusCode === 404) {
      this.errorCode = ErrorCode.NOT_FOUND;
    } else if (statusCode === 400) {
      this.errorCode = ErrorCode.VALIDATION_ERROR;
    } else {
      this.errorCode = ErrorCode.INTERNAL_ERROR;
    }
  }
  
  this.errorId = uuidv4();
  this.details = details;
  Error.captureStackTrace(this, this.constructor);
}
```

**Ventaja:** Si se olvida especificar `errorCode`, se infiere automáticamente basado en `statusCode`.

**Desventaja:** Puede ocultar errores si se especifica incorrectamente un `statusCode` pero el `errorCode` debería ser diferente.

**Recomendación:** Hacer ambos cambios (especificar explícitamente `errorCode` Y mejorar el constructor como fallback).

---

### 4. Frontend: No requiere cambios

**Estado:** El frontend ya maneja 401 correctamente (logout + redirect). No requiere cambios.

---

### 5. Infraestructura (Opcional): Configurar dominio canónico

**Vercel:** Configurar redirección de apex → www

**Opción A: Redirects en vercel.json**

```json
{
  "redirects": [
    {
      "source": "/",
      "has": [
        {
          "type": "host",
          "value": "ivanreseller.com"
        }
      ],
      "destination": "https://www.ivanreseller.com",
      "permanent": true
    },
    {
      "source": "/(.*)",
      "has": [
        {
          "type": "host",
          "value": "ivanreseller.com"
        }
      ],
      "destination": "https://www.ivanreseller.com/$1",
      "permanent": true
    }
  ]
}
```

**Opción B: Domain Settings en Vercel Dashboard**
- Settings → Domains → Configure redirects

**Recomendación:** Opción A (en vercel.json) es más versionable y mantenible.

---

## 📋 ARCHIVOS A TOCAR

### Backend

1. `backend/src/middleware/auth.middleware.ts` - 5 cambios
2. `backend/src/middleware/api-check.middleware.ts` - 5 cambios
3. `backend/src/api/routes/system.routes.ts` - 4 cambios
4. `backend/src/api/routes/auth.routes.ts` - 1 cambio
5. `backend/src/services/auth.service.ts` - ~8 cambios
6. `backend/src/services/ebay.service.ts` - 2 cambios
7. `backend/src/services/mercadolibre.service.ts` - 2 cambios
8. `backend/src/services/paypal-payout.service.ts` - 1 cambio
9. `backend/src/middleware/error.middleware.ts` - 1 cambio (opcional, mejorar constructor)

**Total:** ~29 cambios en 9 archivos

---

### Infraestructura

10. `vercel.json` - Agregar redirects (opcional)

---

### Frontend

**Ninguno** (no requiere cambios)

---

## ✅ DEFINITION OF DONE (DoD)

### Criterios de Éxito

- [x] ✅ Auditoría completada (`PROD_AUTH_AUDIT.md`)

- [ ] ⏳ Backend: Todos los errores de auth devuelven `errorCode` correcto:
  - [ ] `errorCode: "UNAUTHORIZED"` para "Authentication required"
  - [ ] `errorCode: "TOKEN_EXPIRED"` para "Token expired"
  - [ ] `errorCode: "INVALID_TOKEN"` para "Invalid token" / "Token revoked"
  - [ ] `errorCode: "FORBIDDEN"` para errores 403 (si aplica)

- [ ] ⏳ Backend: Constructor de `AppError` inferirá `errorCode` basado en `statusCode` (opcional pero recomendado)

- [ ] ⏳ Validación: Todos los endpoints protegidos devuelven `errorCode` correcto:
  ```bash
  curl -X GET https://www.ivanreseller.com/api/products
  # Debe devolver:
  # {
  #   "success": false,
  #   "error": "Authentication required",
  #   "errorCode": "UNAUTHORIZED",  # ✅ CORRECTO
  #   "statusCode": 401
  # }
  ```

- [ ] ⏳ Frontend: UI NO muestra toast "Backend 502" por errores de auth (ya está correcto, solo validar)

- [ ] ⏳ Dominio canónico: Redirección apex → www configurada (opcional)

---

## 🧪 VALIDACIÓN

### Pasos de Validación

#### 1. Validar ErrorCode en Backend

```bash
# Sin auth
curl -X GET https://www.ivanreseller.com/api/products \
  -H "Content-Type: application/json"

# Debe devolver:
# {
#   "success": false,
#   "error": "Authentication required",
#   "errorCode": "UNAUTHORIZED",  # ✅ CORRECTO (no "INTERNAL_ERROR")
#   "statusCode": 401
# }
```

#### 2. Validar Token Expired

```bash
# Con token expirado (simular)
curl -X GET https://www.ivanreseller.com/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer expired_token"

# Debe devolver:
# {
#   "success": false,
#   "error": "Token expired",
#   "errorCode": "TOKEN_EXPIRED",  # ✅ CORRECTO
#   "statusCode": 401
# }
```

#### 3. Validar Invalid Token

```bash
# Con token inválido
curl -X GET https://www.ivanreseller.com/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid_token"

# Debe devolver:
# {
#   "success": false,
#   "error": "Invalid token",
#   "errorCode": "INVALID_TOKEN",  # ✅ CORRECTO
#   "statusCode": 401
# }
```

#### 4. Validar Frontend (UI)

1. Abrir `https://www.ivanreseller.com` sin estar logueado
2. Navegar a Dashboard (o cualquier página que requiera auth)
3. **Debe:** Hacer logout automático + redirect a `/login`
4. **NO debe:** Mostrar toast "Backend no disponible (502)"

#### 5. Validar Dominio Canónico (Opcional)

1. Acceder a `https://ivanreseller.com` (sin www)
2. **Debe:** Redirigir a `https://www.ivanreseller.com` (301 Permanent Redirect)

---

## 📝 ESTRUCTURA DE COMMITS SUGERIDA

### Commit 1: Fix errorCode en auth.middleware.ts

```bash
git add backend/src/middleware/auth.middleware.ts
git commit -m "fix(auth): specify correct errorCode for authentication errors

- Use ErrorCode.UNAUTHORIZED for 'Authentication required'
- Use ErrorCode.TOKEN_EXPIRED for 'Token expired'
- Use ErrorCode.INVALID_TOKEN for 'Invalid token' and 'Token revoked'

Fixes: Auth errors were returning errorCode: INTERNAL_ERROR instead of appropriate auth error codes"
```

### Commit 2: Fix errorCode en otros archivos

```bash
git add backend/src/middleware/api-check.middleware.ts \
         backend/src/api/routes/system.routes.ts \
         backend/src/api/routes/auth.routes.ts \
         backend/src/services/auth.service.ts \
         backend/src/services/ebay.service.ts \
         backend/src/services/mercadolibre.service.ts \
         backend/src/services/paypal-payout.service.ts
git commit -m "fix(auth): specify correct errorCode for all authentication errors

- Use ErrorCode.UNAUTHORIZED for all 'User not authenticated' errors
- Use ErrorCode.INVALID_TOKEN for token-related errors
- Use ErrorCode.TOKEN_EXPIRED for expired tokens

Ensures all auth errors return appropriate errorCode instead of INTERNAL_ERROR"
```

### Commit 3 (Opcional): Mejorar constructor de AppError

```bash
git add backend/src/middleware/error.middleware.ts
git commit -m "feat(error): infer errorCode from statusCode in AppError constructor

- Infer ErrorCode.UNAUTHORIZED for statusCode 401
- Infer ErrorCode.FORBIDDEN for statusCode 403
- Infer ErrorCode.NOT_FOUND for statusCode 404
- Infer ErrorCode.VALIDATION_ERROR for statusCode 400
- Default to ErrorCode.INTERNAL_ERROR for other statusCodes

This provides a safety net when errorCode is not explicitly specified"
```

### Commit 4 (Opcional): Configurar dominio canónico

```bash
git add vercel.json
git commit -m "feat(infra): add redirect from apex domain to www

- Redirect ivanreseller.com to www.ivanreseller.com
- Ensures consistent domain for cookie sharing
- Uses 301 Permanent Redirect"
```

---

## ⚠️ CONSIDERACIONES

### Breaking Changes

**Ninguno:** Cambiar `errorCode` de `"INTERNAL_ERROR"` a `"UNAUTHORIZED"` NO es un breaking change porque:
- El frontend no chequea `errorCode` específicamente (solo chequea `statusCode`)
- El status HTTP 401 ya era correcto
- Solo mejora la claridad de los logs y monitoreo

### Testing

**Testing Requerido:**
1. ✅ Todos los endpoints protegidos devuelven `errorCode` correcto
2. ✅ Frontend maneja 401 correctamente (logout + redirect)
3. ✅ Logs y monitoreo muestran `errorCode` correcto

**Testing Opcional:**
- Validar dominio canónico (si se implementa)

### Rollback

**Si algo sale mal:**
- Los cambios son solo en el backend
- Puede revertirse fácilmente con `git revert`
- No afecta el comportamiento del frontend (ya maneja 401 correctamente)

---

## 🎯 PRIORIDAD

### P0 (Crítico - Debe hacerse)

1. ✅ Especificar `errorCode` correcto en `auth.middleware.ts` (5 cambios)
2. ✅ Especificar `errorCode` correcto en `api-check.middleware.ts` (5 cambios)

### P1 (Importante - Debe hacerse)

3. ⚠️ Especificar `errorCode` correcto en otros archivos (system.routes.ts, auth.routes.ts, services)

### P2 (Mejora - Recomendado)

4. ⚠️ Mejorar constructor de `AppError` para inferir `errorCode` (opcional pero recomendado)

### P3 (Opcional)

5. ⚠️ Configurar dominio canónico en Vercel (opcional, pero recomendado para evitar problemas con cookies)

---

**Última actualización:** 2025-12-26  
**Estado:** ⏳ Pendiente implementación

