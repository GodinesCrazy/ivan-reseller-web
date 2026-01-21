# Fix: Prevent 500 on Invalid JSON Login

## ?? Problema Resuelto

- `POST /api/auth/login` devolvía 500 con `SyntaxError: Expected property name or '}' in JSON at position 1`
- Esto ocurre cuando el body JSON está malformado
- El login nunca debe devolver 500 por JSON inválido

## ? Soluciones Implementadas

### 1. Safe JSON Error Handler Middleware

**Archivo:** `backend/src/middleware/safe-json.middleware.ts` (nuevo)

**Funcionalidad:**
- Captura `SyntaxError` lanzado por `express.json()` body parser
- Responde 400 con error claro en lugar de dejar que llegue al error handler (500)
- Incluye `correlationId` en la respuesta
- NO llama `next(err)` para evitar que llegue al error handler global

**Código:**
```typescript
if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
  res.status(400).json({
    success: false,
    error: 'Invalid JSON body',
    errorCode: 'INVALID_JSON',
    correlationId,
    hint: 'Ensure body is valid JSON e.g. {"username":"admin","password":"..."}',
  });
  return; // NO llamar next()
}
```

### 2. Correlation ID Antes del Body Parser

**Archivo:** `backend/src/app.ts`

**Cambio:**
- ? `correlationMiddleware` ahora se ejecuta ANTES de `express.json()`
- Esto asegura que `correlationId` esté disponible en el safe-json middleware
- También guardado en `res.locals.correlationId` para acceso en error handlers

**Orden de middlewares:**
```typescript
app.use(correlationMiddleware);  // ? PRIMERO
app.use(express.json({ limit: '10mb' }));
app.use(safeJsonErrorHandler);   // ? Captura SyntaxError
```

### 3. Validación Mejorada en Login Handler

**Archivo:** `backend/src/api/routes/auth.routes.ts`

**Cambios:**
- ? Valida que `req.body` existe y es un objeto
- ? Valida campos requeridos (`username`, `password`) antes de parsear con Zod
- ? Maneja errores de Zod con 400, no 500
- ? Siempre responde JSON válido con `correlationId`

**Código:**
```typescript
// Validar que body existe
if (!req.body || typeof req.body !== 'object') {
  return res.status(400).json({
    success: false,
    error: 'Request body is required and must be a JSON object',
    errorCode: 'INVALID_BODY',
    correlationId,
  });
}

// Validar campos requeridos
if (!req.body.username || !req.body.password) {
  const missingFields: string[] = [];
  if (!req.body.username) missingFields.push('username');
  if (!req.body.password) missingFields.push('password');
  
  return res.status(400).json({
    success: false,
    error: 'Missing required fields',
    errorCode: 'MISSING_REQUIRED_FIELD',
    correlationId,
    missingFields,
  });
}
```

### 4. Error Handler Global Mejorado

**Archivo:** `backend/src/middleware/error.middleware.ts`

**Cambios:**
- ? Captura `SyntaxError` si no lo capturó el safe-json middleware
- ? Incluye `correlationId` de `req.correlationId` o `res.locals.correlationId`
- ? Stack trace incluido en logs (no se expone al cliente)
- ? Logging mejorado con información del request

## ?? Archivos Modificados

1. `backend/src/middleware/safe-json.middleware.ts` (nuevo)
2. `backend/src/middleware/correlation.middleware.ts`
3. `backend/src/app.ts`
4. `backend/src/api/routes/auth.routes.ts`
5. `backend/src/middleware/error.middleware.ts`

## ?? Comandos de Validación

### PowerShell - Con objeto convertido a JSON

```powershell
# Método 1: ConvertTo-Json (recomendado)
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
  -H "Content-Type: application/json" `
  -d $body

# Método 2: JSON literal con --data-binary (sin escape)
curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
  -H "Content-Type: application/json" `
  --data-binary '{"username":"admin","password":"admin123"}'
```

### Test de JSON Inválido (debe retornar 400, no 500)

```powershell
# Test 1: JSON malformado
curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
  -H "Content-Type: application/json" `
  --data-binary '{username:"admin",password:"admin123"}'
# Debe retornar: 400 con errorCode: INVALID_JSON

# Test 2: JSON incompleto
curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
  -H "Content-Type: application/json" `
  --data-binary '{"username":"admin"'
# Debe retornar: 400 con errorCode: INVALID_JSON

# Test 3: Sin body
curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
  -H "Content-Type: application/json"
# Debe retornar: 400 con errorCode: INVALID_BODY

# Test 4: Body vacío
curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
  -H "Content-Type: application/json" `
  --data-binary '{}'
# Debe retornar: 400 con errorCode: MISSING_REQUIRED_FIELD

# Test 5: Falta username
curl.exe -i -X POST "https://www.ivanreseller.com/api/auth/login" `
  -H "Content-Type: application/json" `
  --data-binary '{"password":"admin123"}'
# Debe retornar: 400 con errorCode: MISSING_REQUIRED_FIELD, missingFields: ["username"]
```

## ?? Resultado Esperado

### Antes
- ? JSON inválido ? 500 Internal Server Error
- ? Sin `correlationId` en respuestas de error
- ? Sin información útil sobre qué falló

### Después
- ? JSON inválido ? 400 Bad Request con `errorCode: INVALID_JSON`
- ? Body faltante ? 400 con `errorCode: INVALID_BODY`
- ? Campos faltantes ? 400 con `errorCode: MISSING_REQUIRED_FIELD` y `missingFields`
- ? Siempre incluye `correlationId` para rastreo
- ? Stack trace en logs (no expuesto al cliente)
- ? NUNCA retorna 500 por JSON inválido

## ?? Commit Message

```
fix(auth): prevent 500 on invalid login JSON and add safe json handler

- Safe JSON middleware captura SyntaxError del body parser y responde 400
- Correlation ID disponible antes del body parser
- Validación mejorada en login handler con errores específicos
- Error handler global mejorado con logging de stack trace
- Todos los endpoints ahora responden 400 por JSON inválido, nunca 500

Archivos:
- backend/src/middleware/safe-json.middleware.ts (nuevo)
- backend/src/middleware/correlation.middleware.ts
- backend/src/app.ts
- backend/src/api/routes/auth.routes.ts
- backend/src/middleware/error.middleware.ts
- docs/FIX_LOGIN_JSON_500.md (nuevo)
```

---

**Fecha:** 2025-01-XX
**Estado:** ? Implementación completa, listo para push
