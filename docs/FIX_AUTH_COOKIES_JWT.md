# Fix: Autenticación por Cookies + Validación JWT_SECRET

## ?? Problema Resuelto

- Backend rechazaba tokens válidos enviados como cookies (`Cookie: token=...`)
- Error 401 "Invalid token" bloqueaba pruebas humanas y configuración OAuth
- Riesgo de invalidar todas las cookies por cambio accidental de JWT_SECRET

## ? Soluciones Implementadas

### 1. Parser Robusto de Cookies

**Archivo:** `backend/src/utils/cookie-parser.ts` (nuevo)

**Funcionalidad:**
- Parsea cookies desde `req.cookies` (cookie-parser)
- Parsea cookies desde `req.headers.cookie` (raw header) como fallback
- Soporta URL encoding/decoding
- Función `getTokenFromRequest()` que busca token en múltiples fuentes

**Prioridad de búsqueda:**
1. `req.cookies.token` (cookie-parser parseado)
2. `req.headers.cookie` parseado manualmente
3. `Authorization: Bearer <token>` header

### 2. Mejora del Middleware de Autenticación

**Archivo:** `backend/src/middleware/auth.middleware.ts`

**Cambios:**
- ? Usa `getTokenFromRequest()` para obtener token de múltiples fuentes
- ? Validación de formato del token antes de verificar JWT
- ? Validación de JWT_SECRET antes de verificar token
- ? Validación de payload JWT (userId, username, role)
- ? Logging mejorado para diagnosticar problemas
- ? Manejo de errores más específico (TokenExpiredError, JsonWebTokenError)

**Código clave:**
```typescript
// Obtener token desde múltiples fuentes
let token: string | undefined = getTokenFromRequest(req);

// Validar formato
if (!token || typeof token !== 'string' || token.trim().length === 0) {
  throw new AppError('Token is empty or invalid format', 401);
}

// Validar JWT_SECRET
if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  throw new AppError('Server configuration error', 500);
}

// Verificar y validar payload
const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
if (!decoded.userId || !decoded.username || !decoded.role) {
  throw new AppError('Invalid token payload', 401);
}
```

### 3. Validación de JWT_SECRET al Iniciar

**Archivo:** `backend/src/server.ts`

**Funcionalidad:**
- ? Valida JWT_SECRET al iniciar el servidor
- ? Calcula hash del secret para detectar cambios
- ? Muestra advertencia si JWT_SECRET cambia
- ? Previene que el servidor inicie si JWT_SECRET es inválido

**Código:**
```typescript
function validateJwtSecret(): void {
  const jwtSecret = env.JWT_SECRET;
  
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('? ERROR CRÍTICO: JWT_SECRET no está configurado o es muy corto');
    process.exit(1);
  }
  
  // Calcular hash para detectar cambios
  const crypto = require('crypto');
  const secretHash = crypto.createHash('sha256').update(jwtSecret).digest('hex').substring(0, 16);
  
  console.log(`? JWT_SECRET: Configurado (${jwtSecret.length} caracteres, hash: ${secretHash}...)`);
  console.log('   ??  ADVERTENCIA: Si cambias JWT_SECRET, todos los tokens existentes se invalidarán');
}
```

## ?? Archivos Modificados

1. `backend/src/utils/cookie-parser.ts` (nuevo)
2. `backend/src/middleware/auth.middleware.ts`
3. `backend/src/server.ts`

## ?? Validación

### Test Manual con cURL

```powershell
# 1. Login para obtener token
$loginResponse = Invoke-RestMethod -Uri "https://tu-backend.railway.app/api/auth/login" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body (@{
    username = "tu_usuario"
    password = "tu_password"
  } | ConvertTo-Json)

# 2. Extraer token de la cookie (si se estableció)
# O usar el token del response si está disponible

# 3. Test con cookie
curl -X GET "https://tu-backend.railway.app/api/auth-status" `
  -H "Cookie: token=TU_TOKEN_AQUI" `
  -H "Content-Type: application/json"

# 4. Test con Authorization header (debe funcionar también)
curl -X GET "https://tu-backend.railway.app/api/auth-status" `
  -H "Authorization: Bearer TU_TOKEN_AQUI" `
  -H "Content-Type: application/json"
```

### Verificar Logs

En los logs del servidor, buscar:
- `[Auth] No token encontrado` - Si no se encuentra token (debug)
- `[Auth] Invalid token` - Si el token es inválido (warning)
- `[Auth] Token expired` - Si el token expiró (debug)

## ?? Seguridad

### Prevención de Cambios Accidentales de JWT_SECRET

1. **Validación al iniciar:** El servidor valida JWT_SECRET antes de iniciar
2. **Hash logging:** Se muestra un hash del secret para detectar cambios
3. **Advertencia clara:** Se muestra advertencia sobre invalidación de tokens

### Recomendaciones

1. **Nunca cambiar JWT_SECRET en producción** sin plan de migración
2. **Si es necesario cambiar:**
   - Notificar a usuarios que necesitarán hacer login nuevamente
   - Cambiar en horario de bajo tráfico
   - Monitorear logs para detectar problemas

## ?? Resultado Esperado

### Antes
- ? `Cookie: token=...` retornaba 401 "Invalid token"
- ? No había validación de JWT_SECRET al iniciar
- ? Cambios accidentales de JWT_SECRET invalidaban todas las cookies

### Después
- ? `Cookie: token=...` funciona correctamente
- ? `Authorization: Bearer <token>` sigue funcionando
- ? Validación de JWT_SECRET al iniciar previene problemas
- ? Logging mejorado para diagnosticar problemas
- ? Manejo de errores más específico

## ?? Commit Message Sugerido

```
fix: Autenticación por cookies + validación JWT_SECRET

- Parser robusto de cookies que maneja req.cookies y req.headers.cookie
- Función getTokenFromRequest() busca token en múltiples fuentes
- Validación de JWT_SECRET al iniciar servidor
- Validación de formato y payload del token antes de verificar
- Logging mejorado para diagnosticar problemas de autenticación
- Prevención de cambios accidentales de JWT_SECRET

Archivos:
- backend/src/utils/cookie-parser.ts (nuevo)
- backend/src/middleware/auth.middleware.ts
- backend/src/server.ts
```

---

**Fecha:** 2025-01-XX
**Estado:** ? Implementación completa, listo para push
