# 🔍 Auditoría Profunda: AliExpress Dropshipping API

**Fecha**: 2025-12-11  
**Alcance**: Auditoría completa del flujo OAuth, validación de credenciales, y consistencia para AliExpress Dropshipping API

---

## 📋 RESUMEN EJECUTIVO

### Problemas Encontrados y Corregidos

1. ❌ **CRÍTICO**: No existía método `checkAliExpressDropshippingAPI` en el servicio de disponibilidad
2. ❌ **CRÍTICO**: Callback OAuth no sincronizaba flag `sandbox` con `environment`
3. ❌ **IMPORTANTE**: Callback OAuth no limpiaba cache del servicio de disponibilidad
4. ❌ **IMPORTANTE**: No se validaba si había tokens OAuth vs solo credenciales básicas
5. ❌ **FRONTEND**: No se manejaba AliExpress Dropshipping como API con OAuth (similar a eBay/MercadoLibre)

---

## 🔧 CORRECCIONES IMPLEMENTADAS

### 1. Creación de Método de Validación ✅

**Problema**: No existía `checkAliExpressDropshippingAPI` en `APIAvailabilityService`, por lo que el sistema nunca verificaba el estado de esta API.

**Corrección** (`backend/src/services/api-availability.service.ts`):
- ✅ Creado método `checkAliExpressDropshippingAPI(userId, environment, forceRefresh)`
- ✅ Valida credenciales básicas (`appKey`, `appSecret`)
- ✅ Verifica presencia de tokens OAuth (`accessToken`, `refreshToken`)
- ✅ Distingue entre estados: "no configurado", "degraded" (falta OAuth), "healthy" (completo)
- ✅ Detecta desincronización entre flag `sandbox` y `environment`
- ✅ Agregado a `getAllAPIStatus()` para incluirla en el monitoreo general

### 2. Callback OAuth - Sincronización de Sandbox ✅

**Problema**: El callback no sincronizaba el flag `sandbox` con el `environment` recibido en el OAuth state.

**Corrección** (`backend/src/api/routes/marketplace-oauth.routes.ts`):
```typescript
// ✅ ANTES (incorrecto):
const updatedCreds: any = {
  ...cred,
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  // ❌ No sincronizaba sandbox con environment
};

// ✅ DESPUÉS (correcto):
const updatedCreds: any = {
  ...cred,
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  // ✅ CRÍTICO: Sincronizar sandbox flag con environment
  sandbox: environment === 'sandbox'
};
```

### 3. Callback OAuth - Limpieza de Cache ✅

**Problema**: Después de guardar tokens OAuth, no se limpiaba el cache del servicio de disponibilidad, causando que el frontend siguiera mostrando estado antiguo.

**Corrección** (`backend/src/api/routes/marketplace-oauth.routes.ts`):
```typescript
// ✅ Agregado:
// Limpiar cache de credenciales
clearCredentialsCache(userId, 'aliexpress-dropshipping', environment);
clearCredentialsCache(userId, 'aliexpress-dropshipping', environment === 'sandbox' ? 'production' : 'sandbox');

// ✅ NUEVO: Limpiar cache de API availability
const apiAvailabilityService = new APIAvailabilityService();
await apiAvailabilityService.checkAliExpressDropshippingAPI(userId, environment, true).catch((err) => {
  logger.warn('[OAuth Callback] Error forcing AliExpress Dropshipping API status refresh', {
    error: err?.message || String(err),
    userId,
    environment
  });
});
```

### 4. Validación de Tokens OAuth ✅

**Problema**: La validación no distinguía entre "credenciales básicas guardadas" vs "tokens OAuth presentes".

**Corrección** (`backend/src/services/api-availability.service.ts`):
```typescript
// ✅ Verificar tokens OAuth
const accessToken = credentials['accessToken'] || '';
const refreshToken = credentials['refreshToken'] || '';
const hasToken = !!(accessToken || refreshToken);

// ✅ Distinguir estados
if (!validation.valid) {
  // Faltan credenciales básicas
} else if (!hasToken) {
  // Credenciales básicas OK pero falta OAuth
  status.status = 'degraded';
  status.message = 'Credenciales básicas guardadas. Completa la autorización OAuth para activar.';
} else {
  // Todo configurado
  status.status = 'healthy';
  status.message = 'API configurada correctamente';
}
```

### 5. Frontend - Manejo de AliExpress Dropshipping como OAuth ✅

**Problema**: El frontend no trataba AliExpress Dropshipping como una API que requiere OAuth (similar a eBay/MercadoLibre).

**Corrección** (`frontend/src/pages/APISettings.tsx`):
- ✅ Agregado `'aliexpress-dropshipping'` a la lista de APIs con OAuth en `getUnifiedAPIStatus()`
- ✅ Agregado validación de credenciales básicas (`appKey`, `appSecret`)
- ✅ Agregado validación de tokens OAuth (`accessToken`, `refreshToken`)
- ✅ Agregado mensajes apropiados para "Paso 1/2" (básicas) vs "Configurado" (OAuth completo)

---

## 📊 FLUJO OAUTH CORREGIDO

### AliExpress Dropshipping OAuth Flow (Completo)

1. **Usuario configura credenciales básicas**:
   - Guarda `appKey` y `appSecret`
   - Selecciona ambiente (sandbox/production)

2. **Usuario hace clic en "OAuth"**:
   - Frontend genera URL de autorización con `client_id`, `redirect_uri`, `state` (incluye `userId`, `environment`, `redirectUri`)
   - Se abre ventana de autorización de AliExpress

3. **Usuario autoriza en AliExpress**:
   - AliExpress redirige a `/aliexpress/callback?code=XXX&state=YYY`

4. **Backend procesa callback** (`/api/marketplace-oauth/oauth/callback/aliexpress-dropshipping`):
   - Parsea `state` para obtener `userId`, `environment`, `redirectUri`
   - Obtiene credenciales base (`appKey`, `appSecret`)
   - Intercambia `code` por `accessToken` y `refreshToken` usando `exchangeCodeForToken()`
   - **✅ NUEVO**: Sincroniza flag `sandbox` con `environment`
   - Guarda tokens con `CredentialsManager.saveCredentials()`
   - **✅ NUEVO**: Limpia cache de credenciales (ambos ambientes)
   - **✅ NUEVO**: Fuerza refresh del estado de API availability
   - Opcionalmente verifica que el token funciona con `getAccountInfo()`
   - Envía mensaje `oauth_success` al frontend

5. **Frontend recibe OAuth success**:
   - Recarga credenciales y estados
   - Muestra "Configurado y funcionando"

---

## 🔄 ESTADOS DE CONFIGURACIÓN

### Estados Distinguidos

| Estado | Condición | Mensaje |
|--------|-----------|---------|
| `not_configured` | No hay credenciales básicas | "No configurado" |
| `partially_configured` | Credenciales básicas OK, falta OAuth | "Paso 1/2 completado" |
| `configured` | Credenciales básicas + OAuth OK | "Configurado y funcionando" |
| `error` | Error en configuración | "Configurado pero con problemas" |
| `degraded` | Sandbox flag desincronizado | "Advertencia: El flag sandbox no coincide con el ambiente" |

---

## 📝 VALIDACIÓN DE CREDENCIALES

### Campos Requeridos

**Básicos** (requeridos para OAuth):
- `appKey` - App Key de AliExpress Open Platform
- `appSecret` - App Secret para firmar requests

**OAuth** (obtenidos después de autorización):
- `accessToken` - Token de acceso OAuth
- `refreshToken` - Token para renovar accessToken (opcional pero recomendado)

**Metadatos**:
- `sandbox` - Boolean que indica si es ambiente sandbox
- `accessTokenExpiresAt` - Fecha de expiración del accessToken
- `refreshTokenExpiresAt` - Fecha de expiración del refreshToken

### Validación en `checkAliExpressDropshippingAPI`

```typescript
// 1. Verificar credenciales básicas
const validation = hasRequiredFields(credentials, ['appKey', 'appSecret']);

// 2. Verificar tokens OAuth
const hasToken = !!(credentials.accessToken || credentials.refreshToken);

// 3. Verificar sincronización sandbox/environment
const sandboxMismatch = credentials.sandbox !== (environment === 'sandbox');

// 4. Determinar estado
if (!validation.valid) {
  // No configurado
} else if (sandboxMismatch) {
  // Degraded (warning)
} else if (!hasToken) {
  // Degraded (falta OAuth)
} else {
  // Healthy
}
```

---

## 🔍 DETECCIÓN DE PROBLEMAS

### Desincronización Sandbox/Environment

**Problema Detectado**:
```typescript
const credSandbox = credentials['sandbox']; // true
const envSandbox = environment === 'sandbox'; // false (production)
const sandboxMismatch = credSandbox !== undefined && credSandbox !== envSandbox; // true
```

**Solución**:
- El callback OAuth ahora **siempre** sincroniza: `sandbox: environment === 'sandbox'`
- La validación detecta y reporta esta desincronización como `degraded` status

---

## 📁 ARCHIVOS MODIFICADOS

1. **`backend/src/services/api-availability.service.ts`**
   - Creado método `checkAliExpressDropshippingAPI()`
   - Agregado a `getAllAPIStatus()` para monitoreo general
   - Agregado soporte para sandbox en `getAllAPIStatus()`

2. **`backend/src/api/routes/marketplace-oauth.routes.ts`**
   - Sincronización de `sandbox` flag con `environment`
   - Limpieza de cache de credenciales (ambos ambientes)
   - Forzar refresh del estado de API availability

3. **`frontend/src/pages/APISettings.tsx`**
   - Agregado `'aliexpress-dropshipping'` a APIs con OAuth
   - Validación de credenciales básicas y tokens
   - Mensajes apropiados para estados parciales

---

## ✅ VERIFICACIÓN DE CONSISTENCIA

### Sandbox vs Production

✅ **AliExpress Dropshipping**:
- El `environment` se pasa correctamente en el `state` del OAuth
- El flag `sandbox` se sincroniza con `environment` al guardar ✅ **NUEVO**
- Las credenciales se buscan por ambiente correctamente
- El estado se valida por ambiente ✅ **NUEVO**

### Cache Management

✅ **AliExpress Dropshipping**: Limpia cache después de OAuth ✅ **NUEVO**
- Cache de credenciales (ambos ambientes)
- Cache de API availability (fuerza refresh)

### Estado después de OAuth

✅ **AliExpress Dropshipping**: Frontend obtiene estado correcto ✅ **NUEVO**
- Obtiene estado desde `statusMap` (como eBay/MercadoLibre)
- Muestra "Paso 1/2" cuando faltan tokens OAuth
- Muestra "Configurado y funcionando" cuando está completo

---

## 🧪 PRUEBAS RECOMENDADAS

### Prueba 1: AliExpress Dropshipping OAuth en Production
1. Configurar `appKey` y `appSecret` (ambiente production)
2. Hacer clic en "OAuth"
3. Autorizar en AliExpress
4. **Verificar**: 
   - Estado cambia a "Configurado y funcionando" sin refrescar página
   - Flag `sandbox` en credenciales es `false`
   - Tokens (`accessToken`, `refreshToken`) están guardados

### Prueba 2: Validación de Estados
1. Guardar solo `appKey` y `appSecret` (sin OAuth)
2. **Verificar**: Muestra "Paso 1/2 completado"
3. Completar OAuth
4. **Verificar**: Muestra "Configurado y funcionando"

### Prueba 3: Sandbox vs Production
1. Configurar y autorizar OAuth en sandbox
2. **Verificar**: Flag `sandbox` es `true` y estado es correcto
3. Configurar y autorizar OAuth en production
4. **Verificar**: Flag `sandbox` es `false` y estado es correcto

---

## ⚠️ NOTAS IMPORTANTES

### Sobre `supportsEnvironments()`

La función `supportsEnvironments('aliexpress-dropshipping')` devuelve `false` porque AliExpress Dropshipping no tiene una estructura `SANDBOX`/`PRODUCTION` en `API_KEY_NAMES` (solo tiene campos planos con un campo `sandbox` boolean).

**Esto es correcto** porque:
- AliExpress Dropshipping usa el mismo endpoint para ambos ambientes
- La diferencia está en el flag `sandbox` (boolean), no en endpoints diferentes
- El sistema maneja esto correctamente usando el campo `environment` en las credenciales

### Refresh Token

AliExpress Dropshipping devuelve un `refreshToken` opcional. Se recomienda guardarlo para renovar automáticamente el `accessToken` cuando expire. El sistema actual guarda ambos tokens y sus fechas de expiración.

---

## ✅ ESTADO FINAL

- ✅ AliExpress Dropshipping: Validación de estado implementada
- ✅ AliExpress Dropshipping: Callback sincroniza `sandbox` con `environment`
- ✅ AliExpress Dropshipping: Cache se limpia después de OAuth
- ✅ AliExpress Dropshipping: Frontend maneja estados OAuth correctamente
- ✅ AliExpress Dropshipping: Validación distingue entre "básicas" vs "OAuth completo"
- ✅ Consistencia: Sandbox/Production funcionan correctamente
- ✅ Cache: Se limpia después de OAuth

---

**Última actualización**: 2025-12-11

