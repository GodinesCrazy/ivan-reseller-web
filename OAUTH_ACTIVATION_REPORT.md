# OAUTH ACTIVATION REPORT
## AliExpress Dropshipping API ? OAuth completo y compras reales con placeOrder()

**Date:** 2026-02-24  
**Objective:** Activate AliExpress Dropshipping API via OAuth so the system executes real purchases using `placeOrder()` instead of Puppeteer fallback.

**Actualización (state OAuth):** El state es **JWT stateless** para evitar "Invalid authorization state signature". Detalle: **OAUTH_ALIEXPRESS_DROPSHIPPING_FIX_REPORT.md**.

---

## FASE 1 ? AUDITOR�A OAUTH BACKEND

### aliexpress-dropshipping-api.service.ts
- **getAuthUrl(redirectUri, state?, clientId?):** Builds OAuth authorization URL: `https://auth.aliexpress.com/oauth/authorize?response_type=code&force_auth=true&client_id=...&redirect_uri=...&state=...`. Uses `credentials?.appKey` or passed `clientId`.
- **exchangeCodeForToken(code, redirectUri, clientId?, clientSecret?):** POST to `https://auth.aliexpress.com/oauth/token` with `grant_type=authorization_code`, `need_refresh_token=true`, `client_id`, `client_secret`, `code`, `redirect_uri`. Returns `{ accessToken, refreshToken, expiresIn, refreshExpiresIn }`. Retry and timeout in place.
- **refreshAccessToken(refreshToken, clientId?, clientSecret?):** Same token endpoint with `grant_type=refresh_token`. Used when access token expires.
- **makeRequest(method, params):** All API calls require `this.credentials.accessToken`; throws if not set. Handles error code 41/40001 as `ACCESS_TOKEN_EXPIRED`.
- **placeOrder(request):** Uses `makeRequest` (hence requires valid credentials with accessToken). Creates order via `aliexpress.trade.buy.placeorder` or fallback method.

### marketplace-oauth.routes.ts (AliExpress Dropshipping)
- **OAuth start (auth URL):** Not in this file. Auth URL is generated in **marketplace.routes.ts**.
- **GET /callback** (mounted at `/aliexpress` in app.ts): Direct AliExpress callback.
  - Reads `code`, `state`, `error` from query.
  - **State:** JWT stateless. **verifyStateAliExpressSafe(state)** (desde `utils/oauth-state.ts`) obtiene `userId`; si falla, redirect 302 a `api-settings?oauth=error&provider=aliexpress-dropshipping&reason=...`. Ya no se usa `parseState` para AliExpress.
  - Loads base credentials: `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment)` � must have **appKey** and **appSecret** (user must save them before OAuth).
  - Calls **aliexpressDropshippingAPIService.exchangeCodeForToken(code, redirectUri || defaultCallbackUrl, appKey, appSecret)**.
  - Builds **updatedCreds** with `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `sandbox`.
  - **CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment)** � saves to DB (encrypted).
  - Clears credential cache and triggers API availability refresh. Optionally verifies token with `getAccountInfo()`.
  - On success: HTML con postMessage al opener y/o redirect a `api-settings?oauth=success&provider=aliexpress-dropshipping`. On error: redirect 302 a `api-settings?oauth=error&...`.

### marketplace.routes.ts (OAuth start for AliExpress)
- **GET /api/marketplace/auth-url/:marketplace** (authenticated).
- For **aliexpress-dropshipping:**
  - Resolves environment (sandbox/production).
  - **Callback canonical:** `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI` or `WEB_BASE_URL + '/api/marketplace-oauth/callback'`. Frontend does **not** send `redirect_uri`; backend always uses this canonical URL (avoids mismatch and session issues).
  - Loads creds: **CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', resolvedEnv)**. Requires **appKey** and **appSecret** already saved (returns 422 if missing).
  - Builds **state** via **signStateAliExpress(userId)** (JWT stateless).
  - **aliexpressDropshippingAPIService.getAuthUrl(callbackUrl, state, appKey)** → authUrl.
  - Returns **JSON: { success: true, data: { authUrl } }**.

### auth.service.ts
- No AliExpress-specific logic. OAuth is handled in marketplace-oauth and marketplace routes; auth.service is for app auth (login/JWT).

**Resumen Fase 1:**  
Inicio OAuth: GET `/api/marketplace/auth-url/aliexpress-dropshipping` (auth) ? devuelve `authUrl`.  
Callback: GET `/aliexpress/callback` o GET `/api/marketplace-oauth/callback` (mismo router) con `code` y `state` ? exchange ? saveCredentials.  
Token se guarda en BD v�a **CredentialsManager.saveCredentials** (tabla `api_credentials`).

---

## FASE 2 ? AUDITOR�A BASE DE DATOS

### prisma/schema.prisma

**Tabla que almacena access_token:** `api_credentials` (model `ApiCredential`).

| Campo        | Tipo    | Descripci�n |
|-------------|---------|-------------|
| id          | Int     | PK          |
| userId      | Int     | Usuario due?o de la credencial |
| apiName     | String  | `'aliexpress-dropshipping'` |
| environment | String  | `'sandbox'` \| `'production'` |
| credentials | String  | JSON **cifrado** (incluye appKey, appSecret, accessToken, refreshToken, sandbox, etc.) |
| isActive    | Boolean | default true |
| scope       | CredentialScope | default user |
| sharedById  | Int?    | opcional |

**Relaci�n con userId:** `User` 1 ? N `ApiCredential` (userId en ApiCredential).

**Campos requeridos para OAuth + placeOrder:**  
En el JSON deserializado (despu�s de decrypt): `appKey`, `appSecret`, `accessToken`. Opcional pero recomendado: `refreshToken`, `sandbox`.  
El callback guarda adem�s `accessTokenExpiresAt`, `refreshTokenExpiresAt` en ese JSON.

**Conclusi�n:** La tabla y relaci�n son correctas para almacenar y recuperar tokens por usuario y ambiente.

---

## FASE 3 ? AUDITOR�A FRONTEND

### Frontend (frontend/src)

- **APISettings.tsx**
  - API `aliexpress-dropshipping` definida con campos: App Key, App Secret (required), sandbox, etc. No exige accessToken manual (se obtiene por OAuth).
  - **Conectar / OAuth:** Para `ebay`, `mercadolibre`, `aliexpress-dropshipping` hay bot�n que llama a **GET `/api/marketplace/auth-url/${apiName}`** con `redirect_uri` y `environment`.
  - Respuesta: `data.data.authUrl` o `data.authUrl` ? se abre en popup `window.open(authUrl, 'oauth', 'width=500,height=700')` o, si el popup est� bloqueado, redirect en la misma pesta?a.
  - Tras OAuth, redirecci�n a `api-settings?oauth=success&provider=aliexpress-dropshipping`; el componente escucha `postMessage` `oauth_success` y cierra popup/refresca estado.
  - Redirect URI usado para AliExpress en frontend: producci�n `https://ivanreseller.com/aliexpress/callback`, desarrollo `${origin}/aliexpress/callback`.  
    **Nota:** El backend por defecto usa `WEB_BASE_URL + '/api/aliexpress/callback'`. La URL registrada en la consola de AliExpress debe coincidir exactamente con la que usa el backend en el exchange (redirect_uri).

- **Endpoint usado para iniciar OAuth:**  
  **GET /api/marketplace/auth-url/aliexpress-dropshipping** (con query opcional `redirect_uri`, `environment`). Requiere usuario autenticado (cookie/JWT).

**Conclusi�n:** Existe bot�n/acci�n para ?Conectar? AliExpress Dropshipping y el endpoint de inicio OAuth es el indicado.

---

## FASE 4 ? VALIDACI�N EXECUTE PURCHASE

### executePurchase(request, userId)

**Ubicaci�n:** `backend/src/services/aliexpress-auto-purchase.service.ts`.

- Si **userId** est� presente:
  1. Obtiene credenciales: `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env)` para `sandbox` y `production` (preferido seg�n resolver).
  2. Si existe credencial con **accessToken**:
     - `aliexpressDropshippingAPIService.setCredentials(dropshippingCreds)`.
     - Extrae `productId` de la URL del producto.
     - Opcional: `getProductInfo(productId)` para validar precio y SKU.
     - **aliexpressDropshippingAPIService.placeOrder({ productId, skuId, quantity, shippingAddress, ... })**.
     - Si placeOrder tiene �xito, devuelve `{ success: true, orderId, orderNumber }`.
  3. Si no hay credenciales o no hay accessToken, o la API falla (p. ej. token expirado), hace **fallback a Puppeteer**.

La cadena de propagaci�n de **userId** (fulfillment ? attemptPurchase ? placeOrder ? executePurchase) ya est� implementada (ver DROPSHIPPING_API_FULL_SYSTEM_ACTIVATION_REPORT.md).

**Conclusi�n:** Cuando el usuario tiene access_token v�lido en BD, **executePurchase(request, userId)** usa **aliexpressDropshippingAPIService.placeOrder()**. Estado: OK.

---

# FORMATO DE RESPUESTA

## OAUTH FLOW STATUS
**OK**

- Authorization URL: `aliexpressDropshippingAPIService.getAuthUrl(redirectUri, state, appKey)`; generada en GET `/api/marketplace/auth-url/aliexpress-dropshipping`.
- Authorization code: Recibido en GET `/aliexpress/callback` (o `/api/marketplace-oauth/callback`) v�a query `code`.
- Exchange: `aliexpressDropshippingAPIService.exchangeCodeForToken(code, redirectUri, appKey, appSecret)`.
- Guardado: `CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment)` ? tabla `api_credentials` (credentials cifrado).

---

## DATABASE TOKEN STORAGE STATUS
**OK**

- Tabla: `api_credentials` (model `ApiCredential`).
- Relaci�n: `userId` + `apiName = 'aliexpress-dropshipping'` + `environment`.
- Campos: `credentials` (JSON cifrado con accessToken, refreshToken, appKey, appSecret, sandbox, etc.). Lectura/escritura v�a `CredentialsManager.getCredentials` / `saveCredentials`.

---

## FRONTEND OAUTH INTEGRATION STATUS
**OK**

- Bot�n/acci�n para conectar AliExpress Dropshipping en **APISettings** (api `aliexpress-dropshipping`).
- Endpoint para iniciar OAuth: **GET /api/marketplace/auth-url/aliexpress-dropshipping** (con auth). Frontend abre la URL en popup o redirect.
- Callback redirige a `api-settings?oauth=success&provider=aliexpress-dropshipping`; postMessage y refresh de estado implementados.

---

## API PURCHASE EXECUTION STATUS
**OK**

- **executePurchase(request, userId)** usa **aliexpressDropshippingAPIService.placeOrder()** cuando el usuario tiene credenciales `aliexpress-dropshipping` con **accessToken** v�lido.
- userId se propaga desde fulfillment hasta executePurchase (order-fulfillment ? purchase-retry ? aliexpress-checkout ? executePurchase).

---

## MISSING OAUTH REQUIREMENTS

1. **Redirect URI consistente:** En producci�n, el `redirect_uri` usado en `getAuthUrl` y en `exchangeCodeForToken` debe ser exactamente el mismo y estar registrado en la consola de AliExpress (Open Platform). Actualmente el backend usa por defecto `WEB_BASE_URL + '/api/aliexpress/callback'`. El frontend en producci�n referencia `https://ivanreseller.com/aliexpress/callback`. Debe asegurarse de que la URL real del callback (seg�n c�mo est� montado el backend, p. ej. con o sin `/api`) coincida en backend y en la app de AliExpress.
2. **App Key y App Secret guardados antes de OAuth:** El usuario debe guardar primero App Key y App Secret en API Settings (credenciales base). Sin ellos, GET auth-url devuelve 422 y el callback no puede hacer el exchange.
3. **Refresh token en producci�n:** Si el access token expira, el flujo actual puede devolver error y hacer fallback a Puppeteer. Opcional: llamar a `refreshAccessToken` antes de placeOrder cuando el token est� expirado y actualizar credenciales en BD.
4. **ENV:** `WEB_BASE_URL` (o equivalente) y opcionalmente `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI` para que el callback URL sea el correcto en cada entorno.

---

## ACTIVATION STEPS

1. **Configurar en consola de AliExpress (Open Platform):**
   - Crear/uso de aplicaci�n con permisos Dropshipping.
   - Registrar **Redirect URI** exacta (la que usar� el backend en el exchange), p. ej. `https://<tu-dominio>/api/aliexpress/callback` o `https://<tu-dominio>/aliexpress/callback` seg�n el mount en producci�n.

2. **Backend ENV (producci�n):**
   - `WEB_BASE_URL` = URL p�blica del frontend o del backend seg�n c�mo se construya el callback (p. ej. `https://www.ivanreseller.com` si el callback es ese dominio).
   - Opcional: `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI` = URL completa del callback si difiere del default.

3. **Usuario (reseller):**
   - En **API Settings**, secci�n **aliexpress-dropshipping**: guardar **App Key** y **App Secret** (y opcionalmente ambiente sandbox/production).
   - Pulsar **Conectar / Autorizar** ? se abre GET `/api/marketplace/auth-url/aliexpress-dropshipping` ? redirige a AliExpress ? tras autorizar, callback guarda access_token y refresh_token.

4. **Verificaci�n:**
   - GET `/api/debug/aliexpress-dropshipping-credentials` (autenticado) o comprobar en API Settings que el estado muestre ?Conectado? o que exista accessToken en `api_credentials` para ese userId.
   - Ejecutar un flujo de compra real (checkout PayPal ? fulfillment) con ese usuario; en logs debe aparecer uso de Dropshipping API y `placeOrder()` en lugar de Puppeteer.

5. **Opcional (refresco de token):** Antes de placeOrder, si `accessTokenExpiresAt` est� en el pasado, llamar a `aliexpressDropshippingAPIService.refreshAccessToken(refreshToken)` y guardar los nuevos tokens con `CredentialsManager.saveCredentials` para ese usuario/ambiente.

---

## FINAL STATUS
**READY**

El flujo OAuth est� implementado de extremo a extremo (auth URL, callback, exchange, guardado en BD). El frontend tiene bot�n y endpoint para iniciar OAuth. **executePurchase(request, userId)** usa **placeOrder()** de la Dropshipping API cuando hay access_token v�lido. Para activaci�n en producci�n solo hace falta: configurar Redirect URI en AliExpress, ENV correctos, que el usuario guarde App Key/App Secret y complete OAuth una vez; tras eso el sistema puede ejecutar compras reales con la API.

---

---

## ACTUALIZACIÓN 2026-02-24 — Una ventana y sesión persistente

- **Una sola ventana OAuth:** Target `oauth_<apiName>`; comprobación de ventana existente al inicio de `handleOAuth`; ref "abriendo" antes de `window.open` para evitar doble clic; eliminado botón "Abrir aquí" en AliExpress Dropshipping.
- **Sin pérdida de sesión:** En el callback de éxito, si existe `window.opener` (popup), solo se envía `postMessage` y se cierra el popup (`window.close()`); no se redirige el popup a api-settings, así la sesión permanece en la ventana principal.
- **Callback canonical:** Backend usa siempre `/api/marketplace-oauth/callback`; frontend no envía `redirect_uri` para aliexpress-dropshipping.

---

## ACTUALIZACIÓN 2026-02-27 — Refresh automático y token exchange robusto

- **Refresh automático antes de compra:** Se agregó la función `refreshAliExpressDropshippingToken(userId, environment)` para renovar credenciales cuando `accessTokenExpiresAt` está vencido o próximo a vencer. Si falta `refreshToken`/`appKey`/`appSecret`, no rompe el flujo: registra warning y mantiene fallback.
- **Persistencia validada tras refresh:** Luego de renovar, se guarda con `CredentialsManager.saveCredentials`, se limpia caché, se vuelve a leer y se valida que `accessToken` y `refreshToken` realmente quedaron persistidos.
- **Token exchange más tolerante a firmas:** `exchangeCodeForToken` ahora prueba múltiples variantes de firma (`sha256`/`md5` y formatos alternos), con `retryWithBackoff` y timeout, reduciendo fallas por `IncompleteSignature`.
- **Observabilidad reforzada:** Logs estructurados para intento, retry, variante de firma usada, elapsed time y error final, facilitando diagnóstico en producción.

*End of report. Last updated: 2026-02-27.*
