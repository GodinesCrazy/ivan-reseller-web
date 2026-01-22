# Fix Completo: AliExpress Dropshipping OAuth Flow

## ?? Problemas Resueltos

1. ? `curl.exe --data-binary` devolvía 400 INVALID_JSON por BOM/CRLF/encoding
2. ? OAuth callback podía fallar silenciosamente al guardar tokens
3. ? Token exchange no tenía retries ni timeout robusto
4. ? Tokens null/undefined podían guardarse sin validación
5. ? Falta de endpoint debug para verificar credenciales
6. ? Falta de smoke test para validar el flujo completo

## ? Soluciones Implementadas

### A) Middleware Raw Body Capture

**Archivo:** `backend/src/middleware/raw-body-capture.middleware.ts` (nuevo)

**Funcionalidad:**
- ? Captura body crudo ANTES de express.json()
- ? Normaliza BOM (Byte Order Mark) UTF-8/UTF-16
- ? Reemplaza CRLF (\r\n) ? LF (\n)
- ? Trim espacios extremos
- ? Guarda en `req.rawBody` para uso posterior

**Ejecución:**
- Se ejecuta ANTES de `express.json()` en `app.ts`
- Solo procesa requests con Content-Type JSON

### B) Express JSON Parser Mejorado

**Archivo:** `backend/src/app.ts`

**Cambios:**
- ? `limit: '1mb'` (reducido de 10mb para seguridad)
- ? `strict: false` (permite JSON más flexible)
- ? `type: ['application/json', 'application/*+json']`
- ? `verify` function para capturar rawBody normalizado
- ? Safe JSON error handler mejorado con logging de rawBody

**Orden de middlewares:**
```typescript
app.use(rawBodyCaptureMiddleware);  // ? PRIMERO: Captura raw body
app.use(express.json({ ... }));     // ? SEGUNDO: Parsea JSON
app.use(safeJsonErrorHandler);      // ? TERCERO: Captura SyntaxError
```

### C) Safe JSON Error Handler Mejorado

**Archivo:** `backend/src/middleware/safe-json.middleware.ts`

**Mejoras:**
- ? Lee `rawBody` normalizado desde `RequestWithRawBody`
- ? Logging robusto con:
  - `bodyLength`
  - `bodyPreview` (primeros 120 chars, password redactado)
  - `contentType`
  - `contentLength`
- ? Siempre responde 400 con `errorCode: INVALID_JSON`
- ? Incluye `correlationId` y hint útil

### D) Token Exchange Robusto

**Archivo:** `backend/src/services/aliexpress-dropshipping-api.service.ts`

**Mejoras:**
- ? Retry con exponential backoff (2 intentos)
- ? Timeout de 10 segundos
- ? Logging de elapsed time
- ? Validación robusta de tokens (no null/undefined/empty)
- ? Manejo de errores mejorado

**Código:**
```typescript
const result = await retryWithBackoff(
  async () => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Token exchange timeout after 10s')), 10000);
    });
    const requestPromise = httpClient.post(tokenUrl, payload, {...});
    return await Promise.race([requestPromise, timeoutPromise]);
  },
  {
    maxRetries: 2,
    initialDelay: 1000,
    maxDelay: 3000,
    timeout: 10000,
  }
);
```

### E) Callback OAuth Mejorado

**Archivo:** `backend/src/api/routes/marketplace-oauth.routes.ts`

**Validaciones:**
- ? Valida `code` no vacío antes de token exchange
- ? Valida `state` antes de parsear
- ? Valida tokens recibidos antes de guardar (no null/undefined/empty)
- ? Valida `accessToken` es string no vacío

**Persistencia:**
- ? Guarda `accessToken` (validado)
- ? Guarda `refreshToken` (puede ser null si no se recibe)
- ? Guarda `accessTokenExpiresAt` calculado
- ? Guarda `refreshTokenExpiresAt` (si existe)
- ? Guarda `updatedAt` timestamp
- ? NO permite guardar tokens inválidos

**Redirect:**
- ? Success: `${webBaseUrl}/#/api-settings?oauth=success&provider=aliexpress-dropshipping&correlationId=...`
- ? Error: `${webBaseUrl}/#/api-settings?oauth=error&provider=aliexpress-dropshipping&correlationId=...&error=...`
- ? HTML fallback con postMessage y redirect automático
- ? Incluye `correlationId` en todos los redirects

**Error Handling:**
- ? NUNCA devuelve 500 por errores de validación
- ? Errores de token exchange ? 400 (no 500)
- ? Logging completo con elapsed time, correlationId, stack

### F) Endpoint Debug

**Archivo:** `backend/src/api/routes/debug.routes.ts`

**Endpoint:** `GET /api/debug/aliexpress-dropshipping-credentials`

**Funcionalidad:**
- ? Requiere autenticación
- ? Devuelve credenciales de producción y sandbox
- ? NO devuelve tokens completos (solo last4 caracteres)
- ? Incluye:
  - `hasAccessToken: boolean`
  - `hasRefreshToken: boolean`
  - `accessTokenLast4: string | null`
  - `refreshTokenLast4: string | null`
  - `expiresAt: string | null`
  - `refreshExpiresAt: string | null`
  - `updatedAt: string | null`
  - `configured: boolean`

**Ejemplo respuesta:**
```json
{
  "ok": true,
  "correlationId": "...",
  "userId": 1,
  "credentials": {
    "production": {
      "environment": "production",
      "hasAccessToken": true,
      "hasRefreshToken": true,
      "accessTokenLast4": "xyz9",
      "configured": true
    },
    "sandbox": { ... }
  },
  "summary": {
    "hasProductionToken": true,
    "hasSandboxToken": false,
    "anyConfigured": true
  }
}
```

### G) Script Smoke Test

**Archivo:** `backend/scripts/smoke-test-aliexpress-oauth.js`

**Tests:**
1. ? Login (obtener token)
2. ? GET `/api/marketplace/auth-url/aliexpress-dropshipping` (obtener authUrl)
3. ? GET `/api/debug/aliexpress-dropshipping-credentials` (verificar credenciales)
4. ? Validar que endpoints no devuelven 500 (`/api/auth-status`, `/api/products`)

**Uso:**
```bash
# Con variables de entorno
API_URL=https://www.ivanreseller.com \
TEST_USERNAME=admin \
TEST_PASSWORD=admin123 \
node backend/scripts/smoke-test-aliexpress-oauth.js

# O directamente
node backend/scripts/smoke-test-aliexpress-oauth.js
```

## ?? Archivos Modificados

1. `backend/src/middleware/raw-body-capture.middleware.ts` (nuevo)
2. `backend/src/middleware/safe-json.middleware.ts` (mejorado)
3. `backend/src/app.ts` (express.json mejorado)
4. `backend/src/services/aliexpress-dropshipping-api.service.ts` (token exchange robusto)
5. `backend/src/api/routes/marketplace-oauth.routes.ts` (callback mejorado)
6. `backend/src/api/routes/debug.routes.ts` (endpoint debug)
7. `backend/scripts/smoke-test-aliexpress-oauth.js` (nuevo)

## ?? Comandos de Validación

### PowerShell - Login con curl

```powershell
# Login
curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
    -H "Content-Type: application/json" `
    --data-binary '{"username":"admin","password":"admin123"}'

# Debe devolver 200 con Set-Cookie y token en body
```

### PowerShell - Auth URL

```powershell
# Obtener auth URL (requiere token)
$token = "TU_TOKEN_AQUI"
curl.exe -i -X GET "https://www.ivanreseller.com/api/marketplace/auth-url/aliexpress-dropshipping?redirect_uri=https://www.ivanreseller.com/api/aliexpress/callback" `
    -H "Cookie: token=$token" `
    -H "Content-Type: application/json"

# Debe devolver 200 con authUrl
```

### PowerShell - Debug Credentials

```powershell
# Ver credenciales guardadas
curl.exe -i -X GET "https://www.ivanreseller.com/api/debug/aliexpress-dropshipping-credentials" `
    -H "Cookie: token=$token" `
    -H "Content-Type: application/json"

# Debe devolver 200 con información de credenciales (sin tokens completos)
```

### Node.js - Smoke Test

```bash
cd backend
API_URL=https://www.ivanreseller.com \
TEST_USERNAME=admin \
TEST_PASSWORD=admin123 \
node scripts/smoke-test-aliexpress-oauth.js
```

## ?? Flujo Completo OAuth

1. **Usuario hace clic en "Autorizar"** en frontend
   - Frontend llama a `GET /api/marketplace/auth-url/aliexpress-dropshipping`
   - Backend devuelve `authUrl` con `state` firmado

2. **Usuario autoriza en AliExpress**
   - Redirige a `/api/aliexpress/callback?code=...&state=...`

3. **Backend procesa callback**
   - Valida `code` y `state`
   - Hace token exchange con retries (2 intentos, timeout 10s)
   - Valida tokens recibidos
   - Guarda tokens en DB
   - Limpia cache de credenciales y API status
   - Redirect a frontend con success/error

4. **Frontend muestra estado**
   - Lee query params `oauth=success` o `oauth=error`
   - Refresca estado de credenciales
   - Muestra "Paso 2/2" si token está guardado

5. **Verificación**
   - `GET /api/debug/aliexpress-dropshipping-credentials` confirma tokens guardados
   - `GET /api/credentials/status` refleja `configured: true`

## ?? Resultado Esperado

### Antes
- ? curl con --data-binary ? 400 INVALID_JSON
- ? Token exchange falla sin retries
- ? Tokens null/undefined pueden guardarse
- ? Callback no valida tokens antes de guardar
- ? Errores devuelven 500 genérico
- ? No hay endpoint debug
- ? No hay smoke test

### Después
- ? curl con --data-binary funciona (BOM/CRLF normalizados)
- ? Token exchange con retries y timeout robusto
- ? Tokens validados antes de guardar
- ? Callback valida todos los campos requeridos
- ? Errores devuelven 400/401/403 controlados (nunca 500 por validación)
- ? Endpoint debug para verificar credenciales
- ? Smoke test completo para validar flujo

---

**Fecha:** 2025-01-XX
**Estado:** ? Implementación completa, listo para push
