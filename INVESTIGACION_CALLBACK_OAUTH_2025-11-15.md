# 🔍 INVESTIGACIÓN: Callback OAuth No Guarda Token - 2025-11-15

**Fecha**: 2025-11-15  
**Problema**: OAuth se completa exitosamente en eBay pero el token no se guarda  
**Estado**: ✅ **LOGGING MEJORADO - LISTO PARA DIAGNÓSTICO**

---

## 📋 RESUMEN DEL PROBLEMA

### Síntoma
- ✅ eBay muestra: "Autorización completada correctamente" (`isAuthSuccessful=true`)
- ❌ Aplicación muestra: "Error: eBay account info error: Resource not found"
- ❌ Token OAuth no se guarda en las credenciales

### Evidencia
- Los logs muestran que el callback se llama pero no hay logs de éxito
- No hay errores visibles en los logs del callback
- El token nunca llega a guardarse

---

## 🔍 ANÁLISIS DEL CÓDIGO

### Endpoint del Callback
**Ruta**: `GET /api/marketplace-oauth/oauth/callback/:marketplace`  
**Archivo**: `backend/src/api/routes/marketplace-oauth.routes.ts`

### Flujo Actual
1. ✅ Recibe `code` y `state` de eBay
2. ✅ Parsea el `state` para obtener `userId`, `redirectUri`, `environment`
3. ✅ Obtiene credenciales de eBay
4. ✅ Crea instancia de `EbayService`
5. ⚠️ Llama a `exchangeCodeForToken(code, redirectUri)`
6. ⚠️ Guarda tokens en credenciales

### Problemas Identificados

#### 1. ❌ Falta de Logging
**Antes**: No había logging en el callback, imposible diagnosticar problemas

**Solución Implementada**:
- ✅ Logging detallado en cada paso del callback
- ✅ Logging de errores con información completa
- ✅ Logging en `exchangeCodeForToken` con detalles del request/response

#### 2. ❌ No Validaba Código Vacío
**Antes**: Si eBay no enviaba código, el sistema intentaba intercambiarlo y fallaba silenciosamente

**Solución Implementada**:
- ✅ Validación que el código no esté vacío
- ✅ Validación que no haya errores en los parámetros de query
- ✅ Mensajes de error claros para el usuario

#### 3. ❌ Manejo de Errores Insuficiente
**Antes**: Los errores se capturaban pero no se logueaban con suficiente detalle

**Solución Implementada**:
- ✅ Logging completo de errores con stack trace
- ✅ Logging de respuesta de error de eBay
- ✅ Logging de duración del proceso

---

## ✅ MEJORAS IMPLEMENTADAS

### 1. Logging Detallado en Callback

**Archivo**: `backend/src/api/routes/marketplace-oauth.routes.ts`

**Logs Agregados**:
```typescript
// Inicio del callback
logger.info('[OAuth Callback] Received callback request', {
  marketplace, hasCode, codeLength, hasState, stateLength, hasError
});

// Estado parseado
logger.info('[OAuth Callback] State parsed successfully', {
  userId, environment, redirectUriLength, redirectUriPreview
});

// Credenciales cargadas
logger.info('[OAuth Callback] eBay credentials loaded', {
  hasAppId, appIdLength, hasDevId, hasCertId, sandbox
});

// Intercambio de código
logger.info('[OAuth Callback] Exchanging code for token', {
  codeLength, redirectUriLength, redirectUriPreview
});

// Token obtenido
logger.info('[OAuth Callback] Token exchange successful', {
  hasToken, tokenLength, hasRefreshToken, refreshTokenLength, expiresIn
});

// Credenciales guardadas
logger.info('[OAuth Callback] Credentials saved successfully', {
  duration
});

// Errores
logger.error('[OAuth Callback] Error processing OAuth callback', {
  error, errorStatus, errorResponse, stack, duration
});
```

### 2. Logging en exchangeCodeForToken

**Archivo**: `backend/src/services/ebay.service.ts`

**Logs Agregados**:
```typescript
// Antes de intercambiar
logger.info('[EbayService] Exchanging authorization code for token', {
  sandbox, codeLength, redirectUriLength, redirectUriPreview, tokenUrl
});

// Después de intercambiar (éxito)
logger.info('[EbayService] Token exchange successful', {
  hasAccessToken, accessTokenLength, hasRefreshToken, refreshTokenLength, expiresIn
});

// Error al intercambiar
logger.error('[EbayService] Token exchange failed', {
  error, errorCode, statusCode, errorResponse, redirectUriLength, redirectUriPreview
});
```

### 3. Validaciones Agregadas

```typescript
// Validar error en query params
if (errorParam) {
  logger.error('[OAuth Callback] OAuth error from provider', {
    error: errorParam, errorDescription
  });
  return res.status(400).send(...);
}

// Validar código no vacío
if (!code || code.trim().length === 0) {
  logger.error('[OAuth Callback] Missing authorization code', {
    marketplace, hasState
  });
  return res.status(400).send(...);
}
```

---

## 🔍 POSIBLES CAUSAS DEL PROBLEMA

### 1. RedirectUri No Coincide Exactamente
**Síntoma**: Error `unauthorized_client` o `invalid_grant`

**Causa**:
- El `redirectUri` usado en el intercambio no coincide exactamente con el registrado en eBay
- Puede tener espacios, mayúsculas/minúsculas diferentes, o caracteres codificados incorrectamente

**Diagnóstico**:
- Los logs ahora muestran el `redirectUri` exacto que se está usando
- Comparar con el registrado en eBay Developer Portal

### 2. Código de Autorización Expirado
**Síntoma**: Error `invalid_grant` o `expired_token`

**Causa**:
- Los códigos de autorización de eBay expiran rápidamente (típicamente 10 minutos)
- Si el usuario tarda mucho en completar el OAuth, el código expira

**Diagnóstico**:
- Los logs ahora muestran cuánto tiempo tarda el proceso completo
- Verificar si hay demoras significativas

### 3. App ID / Cert ID Incorrectos
**Síntoma**: Error `unauthorized_client`

**Causa**:
- El App ID o Cert ID no coinciden con los registrados en eBay
- Puede ser que se estén usando credenciales de Production en Sandbox (o viceversa)

**Diagnóstico**:
- Los logs ahora muestran qué App ID se está usando
- Verificar que coincida con el ambiente correcto

### 4. Callback No Se Está Llamando
**Síntoma**: No hay logs del callback en absoluto

**Causa**:
- El redirectUri registrado en eBay no apunta al endpoint correcto
- El callback no está siendo llamado por eBay

**Diagnóstico**:
- Verificar que el redirectUri registrado en eBay sea exactamente:
  - `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay`
  - O la URL correcta según el ambiente

---

## 📊 PRÓXIMOS PASOS PARA DIAGNÓSTICO

### 1. Desplegar Código con Logging
- ✅ Código con logging detallado está listo
- ⚠️ **URGENTE**: Hacer redeploy del backend

### 2. Repetir OAuth y Revisar Logs
- Intentar OAuth nuevamente
- Revisar logs en Railway para ver:
  - Si el callback se está llamando
  - Qué valores tiene `code`, `state`, `redirectUri`
  - Si `exchangeCodeForToken` se ejecuta
  - Qué error específico retorna eBay (si hay)

### 3. Verificar RedirectUri
- Comparar el `redirectUri` en los logs con el registrado en eBay
- Asegurarse de que coincidan **exactamente** (sin espacios, misma capitalización)

### 4. Verificar Credenciales
- Confirmar que App ID, Dev ID, Cert ID sean correctos
- Confirmar que sean del ambiente correcto (Sandbox vs Production)

---

## 🎯 RESULTADO ESPERADO

Con el logging mejorado, ahora deberíamos poder ver:

1. ✅ Si el callback se está llamando
2. ✅ Qué valores recibe (code, state, redirectUri)
3. ✅ Si las credenciales se cargan correctamente
4. ✅ Si el intercambio de código por token se ejecuta
5. ✅ Qué error específico retorna eBay (si falla)
6. ✅ Si el token se guarda correctamente

---

## 📝 ARCHIVOS MODIFICADOS

1. ✅ `backend/src/api/routes/marketplace-oauth.routes.ts`
   - Agregado logging detallado
   - Agregadas validaciones de código y errores
   - Mejorado manejo de errores

2. ✅ `backend/src/services/ebay.service.ts`
   - Agregado logging en `exchangeCodeForToken`
   - Mejorado logging de errores con detalles completos

---

**Fecha de investigación**: 2025-11-15  
**Estado**: ✅ **LOGGING IMPLEMENTADO - LISTO PARA DIAGNÓSTICO**  
**Próximo paso**: **URGENTE - Desplegar y probar OAuth nuevamente**

