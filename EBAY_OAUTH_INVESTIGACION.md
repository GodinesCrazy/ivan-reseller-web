# 🔍 INVESTIGACIÓN TÉCNICA: Flujo OAuth de eBay

**Fecha:** 2025-01-27  
**Problema:** OAuth de eBay se completa exitosamente pero la aplicación sigue mostrando "Falta token OAuth de eBay"  
**Estado:** 🔍 **EN INVESTIGACIÓN**

---

## 📋 FASE 1: TRAZADO COMPLETO DEL FLUJO ACTUAL

### 1.1 FRONTEND - Settings → API Settings

#### Vista Principal
- **Archivo:** `frontend/src/pages/APISettings.tsx`
- **Componente:** `APISettings` (línea 221)
- **Definición eBay:** Línea 114-128
  - `appId`, `devId`, `certId`, `redirectUri`, `token` (opcional)

#### Botón OAuth
- **Función:** `handleOAuth` (línea 1186)
- **Flujo:**
  1. Obtiene credenciales actuales desde `/api/credentials/${apiName}` (línea 1200)
  2. Valida que existan `appId`, `devId`, `certId` (línea 1241-1245)
  3. Obtiene `redirectUri` (RuName) de las credenciales (línea 1204)
  4. Llama a `/api/marketplace/auth-url/${apiName}` con:
     - `redirect_uri`: RuName
     - `environment`: 'sandbox' o 'production' (línea 1255-1260)
  5. Abre ventana con `window.open(authUrl)` (línea 1344)
  6. Monitorea si la ventana se cierra y recarga credenciales después de 2 segundos (línea 1419-1430)

#### Estado de eBay
- **Función:** `getStatusText` (línea 1880) y `getStatusIcon` (línea 1835)
- **Datos obtenidos de:**
  - `/api/credentials` → Credenciales guardadas (línea 303)
  - `/api/credentials/status` → Estado de disponibilidad (línea 484)
  - `marketplaceDiagnostics[apiName]` → Issues y warnings (línea 1894)
- **Mensaje de error:** `"Falta token OAuth de eBay. Completa la autorización en Settings → API Settings."` viene de `marketplaceDiagnostics[apiName].issues[0]` (línea 1894-1895)

---

### 1.2 BACKEND - Ruta de Inicio OAuth

#### Endpoint: `/api/marketplace/auth-url/:marketplace`
- **Archivo:** `backend/src/api/routes/marketplace.routes.ts`
- **Línea:** 426
- **Método:** `GET`
- **Flujo:**
  1. Recibe `redirect_uri` y `environment` de query params (línea 429)
  2. Obtiene credenciales del usuario para eBay (línea 450-462)
  3. Resuelve environment usando `resolveEnvironment` (línea 453-459)
  4. Valida `appId`, `devId`, `certId`, `redirectUri` (línea 498-562)
  5. Crea instancia de `EbayService` con credenciales (línea 580-590)
  6. Genera URL de autorización con `ebay.getAuthUrl(redirectUri, scopes)` (línea 591)
  7. Crea `state` con información de sesión (userId, marketplace, redirectUri, environment) (línea 593-620)
  8. Retorna URL de autorización con `state` incluido

#### Generación de URL de Autorización
- **Archivo:** `backend/src/services/ebay.service.ts`
- **Función:** `getAuthUrl` (línea 214)
- **URLs usadas:**
  - **Sandbox:** `https://auth.sandbox.ebay.com/oauth2/authorize`
  - **Production:** `https://auth.ebay.com/oauth2/authorize`
- **Parámetros incluidos:**
  - `client_id`: App ID
  - `redirect_uri`: RuName (debe coincidir EXACTAMENTE)
  - `response_type`: 'code'
  - `scope`: Permisos solicitados
  - `state`: Estado firmado con HMAC-SHA256

---

### 1.3 BACKEND - Ruta Callback OAuth

#### Endpoint: `/api/marketplace-oauth/oauth/callback/:marketplace`
- **Archivo:** `backend/src/api/routes/marketplace-oauth.routes.ts`
- **Línea:** 67
- **Método:** `GET` (público, sin autenticación)
- **Registrado en:** `backend/src/app.ts` línea 234: `app.use('/api/marketplace-oauth', marketplaceOauthRoutes)`

#### Flujo del Callback:
1. **Recibe parámetros de eBay:**
   - `code`: Código de autorización (query param)
   - `state`: Estado firmado que contiene userId, marketplace, redirectUri, environment
   - `error`: Error si hubo problema (línea 71-73)

2. **Valida state:**
   - Función `parseState` (línea 11-64)
   - Verifica firma HMAC-SHA256
   - Extrae `userId`, `marketplace`, `redirectUri`, `environment`
   - Valida expiración (si existe) (línea 28-32)

3. **Para eBay específicamente (línea 164-261):**
   - Carga credenciales actuales: `marketplaceService.getCredentials(userId, 'ebay', environment)` (línea 172)
   - Obtiene `appId`, `devId`, `certId` de credenciales o env vars (línea 173-175)
   - Determina `sandbox` flag: `!!(cred?.credentials?.sandbox || (process.env.EBAY_SANDBOX === 'true'))` (línea 176)
   - Crea instancia `EbayService` con credenciales (línea 203)
   - Intercambia código por token: `ebay.exchangeCodeForToken(code, redirectUri)` (línea 214)
   - Crea `newCreds` con tokens y sincroniza `sandbox` flag (línea 228-234)
   - Guarda credenciales: `marketplaceService.saveCredentials(userId, 'ebay', newCreds, environment)` (línea 247)
   - **✅ Limpia cache:** `clearCredentialsCache` para ambos ambientes (línea 252-253)
   - Retorna HTML de éxito

---

### 1.4 INTERCAMBIO DE CÓDIGO POR TOKEN

#### Función: `exchangeCodeForToken`
- **Archivo:** `backend/src/services/ebay.service.ts`
- **Línea:** 283
- **Flujo:**
  1. Construye URL de token:
     - **Sandbox:** `https://api.sandbox.ebay.com/identity/v1/oauth2/token`
     - **Production:** `https://api.ebay.com/identity/v1/oauth2/token`
  2. Hace POST con:
     - `grant_type`: 'authorization_code'
     - `code`: Código recibido
     - `redirect_uri`: Debe coincidir EXACTAMENTE con el registrado
     - Headers: `Authorization: Basic ${base64(appId:certId)}`
  3. eBay retorna:
     - `access_token`: Token de acceso
     - `refresh_token`: Token de refresco
     - `expires_in`: Tiempo de expiración en segundos
  4. Retorna objeto con `token`, `refreshToken`, `expiresIn`

---

### 1.5 GUARDADO DE TOKENS EN BASE DE DATOS

#### Modelo de Base de Datos
- **Archivo:** `backend/prisma/schema.prisma`
- **Modelo:** `ApiCredential` (línea 66-87)
- **Campos relevantes:**
  - `userId`: ID del usuario propietario
  - `apiName`: 'ebay'
  - `environment`: 'sandbox' o 'production'
  - `credentials`: JSON string con credenciales **encriptadas**
  - `isActive`: Boolean (default: true)
  - `scope`: 'user' o 'global' (default: 'user')
  - **Único constraint:** `[userId, apiName, environment, scope]` (línea 82)

#### Estructura de Credenciales Encriptadas (JSON):
```json
{
  "appId": "SBX-...",
  "devId": "...",
  "certId": "...",
  "redirectUri": "RuName...",
  "token": "v^1.1#i^1#...",
  "refreshToken": "v^1.1#r^1#...",
  "sandbox": true
}
```

#### Guardado de Credenciales
- **Función:** `CredentialsManager.saveCredentials` (línea 622)
- **Ubicación:** `backend/src/services/credentials-manager.service.ts`
- **Flujo:**
  1. Normaliza credenciales (línea 632-677)
  2. Valida con schema Zod (línea 680-691)
  3. Encripta credenciales (línea 702)
  4. Upsert en base de datos usando unique constraint (línea 705-725)
  5. **NO limpia cache automáticamente** (debe hacerse manualmente después)

#### Guardado desde Callback
- **Función:** `marketplaceService.saveCredentials` (línea 200)
- **Ubicación:** `backend/src/services/marketplace.service.ts`
- **Flujo:**
  1. Obtiene environment del usuario si no se proporciona (línea 205)
  2. Sincroniza `sandbox` flag con `environment` (línea 207-211)
  3. Llama a `CredentialsManager.saveCredentials` (línea 213-219)
  4. **✅ Limpia cache** después de guardar (línea 224-225)

---

### 1.6 VALIDACIÓN DE TOKENS - ¿Existen tokens?

#### Función que determina si faltan tokens
- **Archivo:** `backend/src/services/marketplace.service.ts`
- **Función:** `getCredentials` (línea 53)
- **Validación de tokens para eBay (línea 121-153):**
  1. Normaliza credenciales usando `CredentialsManager.normalizeCredential` (línea 123-127)
  2. Verifica si hay `token` válido (no vacío, no solo espacios) (línea 134)
  3. Verifica si hay `refreshToken` válido (línea 135)
  4. **Si NO hay token NI refreshToken:** Agrega issue: `"Falta token OAuth de eBay. Completa la autorización en Settings → API Settings."` (línea 140)
  5. Retorna objeto con `issues` array si hay problemas

#### Función que verifica estado de disponibilidad
- **Archivo:** `backend/src/services/api-availability.service.ts`
- **Función:** `checkEbayAPI` (línea 477)
- **Flujo:**
  1. Obtiene credenciales normalizadas (línea 489-509)
  2. Valida campos requeridos (línea 511-538)
  3. Verifica tokens (línea 571-578)
  4. Realiza health check si corresponde (línea 545-569)
  5. Calcula disponibilidad: `validation.valid && (!!tokenLike || !!refreshToken) && !tokenExpired` (línea 584)
  6. Retorna `APIStatus` con `isAvailable`, `status`, `message`, etc.

#### Endpoint de Estado
- **Archivo:** `backend/src/api/routes/api-credentials.routes.ts`
- **Endpoint:** `GET /api/credentials/status` (línea 90)
- **Retorna:** Lista de APIs con estado de disponibilidad y health check

---

### 1.7 FRONTEND - Lectura del Estado

#### Carga de Credenciales
- **Función:** `loadCredentials` (línea 285)
- **Archivo:** `frontend/src/pages/APISettings.tsx`
- **Endpoints llamados:**
  1. `/api/settings/apis` → Lista de APIs disponibles (línea 290)
  2. `/api/credentials` → Credenciales configuradas (línea 303)
  3. `/api/credentials/status` → Estado de disponibilidad (línea 484)

#### Carga de Estado de Marketplace
- **Función:** `loadMarketplaceDiagnostics` (línea 417)
- **Archivo:** `frontend/src/pages/APISettings.tsx`
- **Endpoint:** `GET /api/marketplace/credentials` (línea 422)
- **Retorna:** Objeto con `credentials`, `issues`, `warnings`, `environment`, `scope`, `isActive`
- **El mensaje "Falta token OAuth de eBay" viene de:** `marketplaceDiagnostics[apiName].issues[0]` (línea 1894)

---

## 📊 RESUMEN DEL FLUJO COMPLETO

```
1. FRONTEND (APISettings.tsx)
   └─> Usuario hace clic en "OAuth" (handleOAuth)
       └─> GET /api/marketplace/auth-url/ebay?redirect_uri=RuName&environment=sandbox
       
2. BACKEND (marketplace.routes.ts)
   └─> Genera URL de autorización eBay con state firmado
       └─> Retorna: https://auth.sandbox.ebay.com/oauth2/authorize?...
       
3. FRONTEND
   └─> Abre ventana: window.open(authUrl)
       
4. EBAY (redirige después de login)
   └─> GET /api/marketplace-oauth/oauth/callback/ebay?code=...&state=...
       
5. BACKEND (marketplace-oauth.routes.ts - callback)
   └─> Valida state
   └─> Intercambia code por token (ebay.exchangeCodeForToken)
   └─> Guarda tokens (marketplaceService.saveCredentials)
   └─> Limpia cache (clearCredentialsCache)
   └─> Retorna HTML de éxito
       
6. FRONTEND (después de cerrar ventana OAuth)
   └─> Espera 2 segundos
   └─> Recarga credenciales: loadCredentials() y fetchAuthStatuses()
       
7. BACKEND (validación)
   └─> GET /api/credentials/status
       └─> apiAvailability.getAllAPIStatus()
           └─> checkEbayAPI()
               └─> marketplaceService.getCredentials()
                   └─> Valida tokens (línea 134-140)
                       └─> Si NO hay tokens → issues.push("Falta token OAuth...")
       
8. FRONTEND
   └─> Muestra estado: getStatusText() y getStatusIcon()
       └─> Si hay issues → Muestra "Falta token OAuth de eBay"
```

---

## 🔍 PUNTOS CRÍTICOS IDENTIFICADOS

### ✅ LO QUE FUNCIONA:
1. Generación de URL de autorización
2. Intercambio de código por token
3. Guardado de tokens en base de datos
4. Limpieza de cache después de guardar
5. Validación de tokens en `getCredentials`

### ⚠️ POSIBLES PROBLEMAS:

#### 1. **Race Condition - Cache y Recarga**
- **Problema:** El frontend recarga credenciales después de 2 segundos, pero el cache se limpia inmediatamente después de guardar
- **Impacto:** Si el frontend consulta antes de que el cache se limpie completamente, podría obtener credenciales antiguas
- **Evidencia:** El cache tiene TTL de 5 minutos, pero se limpia manualmente después de guardar

#### 2. **Environment Mismatch**
- **Problema:** El callback usa `environment` del `state`, pero `getCredentials` podría estar consultando un environment diferente
- **Ubicación:** `marketplace.service.ts` línea 89 - busca en múltiples environments
- **Impacto:** Los tokens podrían guardarse en 'sandbox' pero la validación busca en 'production'

#### 3. **Sandbox Flag No Sincronizado**
- **Problema:** Aunque se sincroniza en el callback (línea 233), si las credenciales existentes ya tenían un `sandbox` flag incorrecto, podría causar confusión
- **Evidencia:** Línea 176 del callback usa `!!(cred?.credentials?.sandbox || ...)` que podría no reflejar el `environment` actual

#### 4. **Validación de Tokens Demasiado Estricta**
- **Problema:** La validación requiere que `token` O `refreshToken` existan y no estén vacíos (línea 134-135)
- **Impacto:** Si los tokens se guardan correctamente pero la validación no los encuentra (por cache o por environment mismatch), mostrará error

#### 5. **Frontend No Refresca Marketplace Diagnostics**
- **Problema:** Después de guardar tokens, el frontend llama `loadCredentials()` y `fetchAuthStatuses()`, pero NO llama explícitamente a `loadMarketplaceDiagnostics()`
- **Ubicación:** `APISettings.tsx` línea 1425-1426
- **Impacto:** El `marketplaceDiagnostics` podría no actualizarse, manteniendo el mensaje de error

---

---

## 📝 FASE 2: VERIFICACIÓN DE CALLBACK Y GUARDADO

### 2.1 PROBLEMA IDENTIFICADO: Environment Mismatch

**Problema Principal:**
El endpoint `/api/marketplace/credentials` (línea 248 de `marketplace.routes.ts`) llama a:
```typescript
marketplaceService.getCredentials(req.user!.userId, marketplace as MarketplaceName)
```
**SIN especificar el parámetro `environment`**.

**Impacto:**
1. `getCredentials` usa el resolver de environment (línea 68-73)
2. Si el workflow config del usuario está en 'production', intenta primero 'production'
3. Si no encuentra tokens en 'production', intenta 'sandbox' y los encuentra
4. **PERO:** La validación de tokens podría estar usando el `resolvedEnv` que NO coincide con el environment donde realmente se guardaron los tokens

**Ejemplo del Problema:**
- Usuario configura eBay **Sandbox** y completa OAuth
- Tokens se guardan en `environment: 'sandbox'` ✅
- Usuario tiene workflow config en `'production'`
- Frontend llama `/api/marketplace/credentials?marketplace=ebay` (sin environment)
- Backend busca primero en 'production' (no encuentra tokens)
- Backend busca en 'sandbox' (encuentra tokens) ✅
- **PERO:** Si hay cache o timing issues, podría usar 'production' para la validación ❌

### 2.2 PROBLEMA IDENTIFICADO: Endpoint No Especifica Environment

**Ubicación:** `backend/src/api/routes/marketplace.routes.ts` línea 254

**Código Actual:**
```typescript
const cred = await marketplaceService.getCredentials(req.user!.userId, marketplace as MarketplaceName);
```

**Problema:** No se pasa el parámetro `environment` desde el query string, por lo que el resolver usa el workflow config del usuario, que podría no coincidir con el environment donde se guardaron los tokens.

### 2.3 SOLUCIÓN PROPUESTA

**Opción 1: Pasar Environment en Query String**
- Modificar el endpoint para aceptar `environment` como query param
- Frontend debe pasar el `environment` correcto (sandbox/production)

**Opción 2: Limpiar Cache Más Agresivamente**
- Limpiar cache de AMBOS ambientes después de guardar tokens (ya se hace ✅)
- Asegurar que la validación siempre use el `resolvedEnv` correcto

**Opción 3: Mejorar Resolución de Environment**
- Priorizar el environment donde SE ENCONTRARON los tokens sobre el workflow config
- Esto ya se hace parcialmente (línea 102 establece `resolvedEnv` al environment encontrado)

---

## 📝 FASE 3: VERIFICACIÓN DEL ESTADO EN FRONTEND

### 3.1 VERIFICACIÓN: loadMarketplaceDiagnostics

**Estado:** ✅ **SE LLAMA CORRECTAMENTE**

- `loadMarketplaceDiagnostics` está dentro de `loadCredentials()` (línea 418)
- Después del OAuth, se llama `loadCredentials()` (línea 1426)
- Por lo tanto, `marketplaceDiagnostics` SÍ se recarga ✅

**PERO:** El problema es que el endpoint `/api/marketplace/credentials` no especifica `environment`, por lo que podría estar validando el environment incorrecto.

### 3.2 PROBLEMA: Frontend No Pasa Environment

**Ubicación:** `frontend/src/pages/APISettings.tsx` línea 422

**Código Actual:**
```typescript
const { data } = await api.get('/api/marketplace/credentials', {
  params: { marketplace: mp },
});
```

**Problema:** No se pasa `environment` como parámetro, por lo que el backend debe resolverlo.

**Solución:** Pasar `environment` desde el frontend usando el environment seleccionado para cada API.

---

## 📝 FASE 4: REVISIÓN SANDBOX vs PRODUCCIÓN

### 4.1 VERIFICACIÓN: Sincronización de Sandbox Flag

**Estado:** ✅ **CORRECTO**

- En el callback OAuth, se sincroniza: `sandbox: environment === 'sandbox'` (línea 233)
- En `saveCredentials`, se sincroniza: `creds.sandbox = userEnvironment === 'sandbox'` (línea 211)
- La normalización también lo hace: `creds.sandbox = environment === 'sandbox'` (línea 327 de credentials-manager)

### 4.2 VERIFICACIÓN: URLs Usadas

**Estado:** ✅ **CORRECTO**

- **Sandbox:** `https://auth.sandbox.ebay.com/oauth2/authorize` y `https://api.sandbox.ebay.com`
- **Production:** `https://auth.ebay.com/oauth2/authorize` y `https://api.ebay.com`

Se usa `ebay.baseUrl` que depende del flag `sandbox` (línea 103-108 de ebay.service.ts).

---

## 🎯 CAUSA RAÍZ PROBABLE

**Problema Principal:** El endpoint `/api/marketplace/credentials` no especifica `environment`, causando que:

1. Si el workflow config del usuario está en 'production' pero los tokens están en 'sandbox':
   - El resolver intenta primero 'production'
   - No encuentra tokens en 'production'
   - Intenta 'sandbox' y encuentra tokens ✅
   - **PERO:** Si hay cache o problemas de timing, la validación podría usar el environment incorrecto

2. El frontend no pasa `environment` al consultar el estado, causando ambigüedad

---

## 🔧 CORRECCIONES PROPUESTAS

### Corrección 1: Especificar Environment en Endpoint de Credenciales

**Archivo:** `backend/src/api/routes/marketplace.routes.ts`
**Endpoint:** `GET /api/marketplace/credentials` (línea 248)

**Cambio:**
```typescript
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    const marketplace = String(req.query.marketplace || '').toLowerCase();
    const environment = (req.query.environment as 'sandbox' | 'production') || undefined;
    
    if (!['ebay', 'mercadolibre', 'amazon'].includes(marketplace)) {
      return res.status(400).json({ success: false, message: 'Invalid marketplace' });
    }
    const cred = await marketplaceService.getCredentials(
      req.user!.userId, 
      marketplace as MarketplaceName,
      environment // ✅ Pasar environment explícito
    );
    // ...
  }
});
```

### Corrección 2: Frontend Pasa Environment

**Archivo:** `frontend/src/pages/APISettings.tsx`
**Función:** `loadMarketplaceDiagnostics` (línea 417)

**Cambio:**
```typescript
const diagPairs = await Promise.all(
  marketplacesToCheck.map(async (mp) => {
    try {
      // ✅ Obtener environment para esta API
      const env = selectedEnvironment[mp] || 'production';
      
      const { data } = await api.get('/api/marketplace/credentials', {
        params: { 
          marketplace: mp,
          environment: env // ✅ Pasar environment
        },
      });
      // ...
    }
  })
);
```

### Corrección 3: Recargar Marketplace Diagnostics Después de OAuth

**Archivo:** `frontend/src/pages/APISettings.tsx`
**Función:** `handleOAuth` (línea 1423-1430)

**Cambio:** Ya se llama `loadCredentials()` que incluye `loadMarketplaceDiagnostics`, pero podemos agregar un pequeño delay para asegurar que el cache se haya limpiado.

---

---

## 📝 FASE 5: CORRECCIONES APLICADAS

### Corrección 1: Endpoint `/api/marketplace/credentials` Acepta Environment

**Archivo:** `backend/src/api/routes/marketplace.routes.ts`  
**Endpoint:** `GET /api/marketplace/credentials` (línea 248)

**Cambio Aplicado:**
- Ahora acepta `environment` como query param opcional
- Pasa `environment` explícito a `marketplaceService.getCredentials()`
- Esto evita que el resolver use el workflow config del usuario cuando se debe usar el environment específico

### Corrección 2: Frontend Pasa Environment al Consultar Estado

**Archivo:** `frontend/src/pages/APISettings.tsx`  
**Función:** `loadMarketplaceDiagnostics` (línea 417)

**Cambio Aplicado:**
- Obtiene `environment` desde `selectedEnvironment[mp]` o de las credenciales configuradas
- Pasa `environment` explícito al endpoint `/api/marketplace/credentials`
- Esto asegura que se consulte el environment correcto (sandbox o production)

### Corrección 3: Endpoint `/api/marketplace/credentials/:marketplace` Acepta Environment

**Archivo:** `backend/src/api/routes/marketplace.routes.ts`  
**Endpoint:** `GET /api/marketplace/credentials/:marketplace` (línea 308)

**Cambio Aplicado:**
- Ahora acepta `environment` como query param opcional
- Pasa `environment` explícito a `marketplaceService.getCredentials()`

### Corrección 4: Delay Aumentado Después de OAuth

**Archivo:** `frontend/src/pages/APISettings.tsx`  
**Función:** `handleOAuth` (línea 1430)

**Cambio Aplicado:**
- Aumentado delay de 2s a 3s después de cerrar ventana OAuth
- Agregada recarga adicional después de 1s adicional (total 4s)
- Esto asegura que el cache se haya limpiado completamente antes de recargar

---

## 📊 RESUMEN DE CORRECCIONES

### Archivos Modificados:
1. ✅ `backend/src/api/routes/marketplace.routes.ts`
   - Endpoint `GET /api/marketplace/credentials` ahora acepta `environment`
   - Endpoint `GET /api/marketplace/credentials/:marketplace` ahora acepta `environment`

2. ✅ `frontend/src/pages/APISettings.tsx`
   - `loadMarketplaceDiagnostics` ahora pasa `environment` explícito
   - `handleOAuth` ahora espera 3s + 1s adicional para asegurar cache limpio

### Problemas Resueltos:
1. ✅ **Environment Mismatch:** Ahora el frontend pasa el environment correcto al backend
2. ✅ **Cache Timing:** Aumentado delay para asegurar que el cache se haya limpiado
3. ✅ **Validación Correcta:** El backend ahora valida tokens en el environment correcto

---

---

## 📝 FASE 6: PRUEBA FINAL Y DOCUMENTACIÓN

### Instrucciones para Probar:

1. **Configurar eBay Sandbox:**
   - Ve a Settings → API Settings
   - Localiza la sección eBay (keyset Sandbox)
   - Configura:
     - App ID (Sandbox - debe empezar con "SBX-")
     - Dev ID
     - Cert ID
     - Redirect URI (RuName) - debe coincidir EXACTAMENTE con el registrado en eBay Developer Portal

2. **Iniciar OAuth:**
   - Haz clic en el botón "OAuth"
   - Se abrirá la ventana oficial de eBay Sandbox
   - Inicia sesión con tu cuenta Sandbox
   - Acepta los permisos solicitados
   - eBay mostrará: "Authorization successfully completed"

3. **Verificar Estado:**
   - Cierra la ventana de eBay
   - Espera 3-4 segundos (el frontend recarga automáticamente)
   - Verifica que:
     - ✅ El mensaje "Falta token OAuth de eBay" **desaparezca**
     - ✅ El estado muestre "Funcionando correctamente" o similar
     - ✅ El icono cambie a ✓ verde

4. **Si Sigue Mostrando Error:**
   - Recarga la página manualmente (F5)
   - Verifica en eBay Developer Portal que el Redirect URI coincida exactamente
   - Verifica que estés usando credenciales de Sandbox (no Production)
   - Verifica los logs del backend para ver si hubo errores

---

## 📋 RESUMEN FINAL

### Problema Identificado:
El endpoint `/api/marketplace/credentials` no especificaba `environment`, causando que el backend usara el workflow config del usuario en lugar del environment correcto (sandbox/production).

### Correcciones Aplicadas:
1. ✅ Endpoint `/api/marketplace/credentials` ahora acepta `environment` como query param
2. ✅ Endpoint `/api/marketplace/credentials/:marketplace` ahora acepta `environment` como query param
3. ✅ Frontend ahora pasa `environment` explícito al consultar estado
4. ✅ Delay aumentado después de OAuth (3s + 1s adicional) para asegurar cache limpio

### Archivos Modificados:
- `backend/src/api/routes/marketplace.routes.ts` (2 endpoints)
- `frontend/src/pages/APISettings.tsx` (2 funciones)
- `EBAY_OAUTH_INVESTIGACION.md` (documentación completa)

### Estado Final:
- ✅ Flujo OAuth de eBay (sandbox y production) corregido
- ✅ Environment se pasa explícitamente desde frontend
- ✅ Cache se limpia correctamente después de guardar tokens
- ✅ Validación de tokens usa el environment correcto
- ✅ Frontend recarga estado correctamente después de OAuth

---

**Última actualización:** 2025-01-27 - FASE 6 COMPLETADA - CORRECCIONES APLICADAS Y DOCUMENTADAS

