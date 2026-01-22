# AliExpress Dropshipping OAuth E2E � Production

Gu�a para pruebas end-to-end del OAuth de AliExpress Dropshipping en producci�n (o staging) usando scripts oficiales. **No usar `curl.exe` en Windows** para peticiones JSON; usar PowerShell o Node.

---

## Pruebas recomendadas

### 0. Smoke Test Rápido (Login + Session)

```powershell
cd backend
.\scripts\ps-login-and-session-smoke.ps1
```

Valida login, auth-status, products y auth-url en un solo script. **Método oficial para QA rápida.**

### 1. Node.js (fetch, Node 18+)

```bash
cd backend
node scripts/smoke-test-aliexpress-oauth.js
```

Variables opcionales: `API_URL`, `TEST_USERNAME`, `TEST_PASSWORD` (por defecto `https://www.ivanreseller.com`, `admin`, `admin123`).

El script:

- Hace login con `fetch` contra `POST /api/auth/login`
- Guarda cookies y consulta `/api/auth-status` y `/api/products`
- Obtiene la auth URL: `GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production`
- Muestra instrucciones para abrir la auth URL en el navegador
- Llama a `GET /api/debug/aliexpress-dropshipping-credentials` y muestra si hay tokens guardados

### 2. PowerShell (Invoke-WebRequest + WebSession)

```powershell
cd backend
.\scripts\ps-aliexpress-oauth-e2e.ps1
```

Variables opcionales: `$env:API_URL`, `$env:TEST_USERNAME`, `$env:TEST_PASSWORD`.

El script:

- Hace login con `Invoke-WebRequest -SessionVariable session`
- Consulta `/api/auth-status` y `/api/products` con la misma sesi�n
- Obtiene la auth URL y la abre con `Start-Process`
- Indica que tras autorizar se debe revisar el endpoint de debug
- Llama a `/api/debug/aliexpress-dropshipping-credentials` con la misma sesi�n

---

## No usar curl.exe en Windows para JSON

En Windows, `curl.exe` suele dar problemas de encoding y comillas con JSON (p. ej. 400 INVALID_JSON). **No se considera bug cr�tico** si falla solo con `curl.exe`. Usar siempre:

- **PowerShell:** `Invoke-WebRequest` con `-WebSession` para mantener cookies.
- **Node:** `node backend/scripts/smoke-test-aliexpress-oauth.js` (fetch).

Los endpoints `/api/auth/login` y el resto aceptan `Content-Type: application/json` y cuerpo JSON válido. Si `curl.exe` falla por Windows, usar los scripts anteriores.

---

## Flujo OAuth completo

1. **Login**  
   `POST /api/auth/login` con `{"username":"...","password":"..."}`.  
   Respuesta: token en body y cookies (`token`, `refreshToken`). En producci�n: `SameSite=None`, `Secure`, `httpOnly`.

2. **Auth URL**  
   `GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production`  
   Requiere autenticaci�n (cookie o Bearer). Devuelve `{ success, data: { authUrl } }`.

3. **Abrir authUrl**  
   Abrir la URL en el navegador, iniciar sesi�n en AliExpress y autorizar la app.

4. **Callback**  
   Tras autorizar, el callback guarda los tokens. La app redirige al frontend (p. ej. `/#/api-settings?oauth=success&...`).

5. **Verificar credenciales**  
   `GET /api/debug/aliexpress-dropshipping-credentials` (autenticado).  
   Respuesta: `ok`, `summary.hasProductionToken`, `summary.hasSandboxToken`, `summary.anyConfigured`.

---

## Errores de login (400, nunca 500)

- **Body no es JSON válido** -> `400` con `errorCode: "INVALID_JSON"` (middleware safe-json).
- **Body no es objeto JSON** -> `400` con `errorCode: "INVALID_BODY"`.
- **Faltan username o password** -> `400` con `errorCode: "MISSING_REQUIRED_FIELD"`.

Ninguno de estos casos debe devolver 500.

---

## Build y tests (Windows)

### EPERM al hacer `npm run build`

Si aparece `EPERM` al renombrar en `node_modules/.prisma` (p. ej. `query_engine-windows.dll.node`):

1. Cerrar todos los procesos Node (servidor, tests, etc.).
2. Borrar `backend/node_modules/.prisma` (o solo el `.prisma` dentro de `node_modules`).
3. Volver a ejecutar `npm run build` en `backend`.

```powershell
# Ejemplo
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force backend/node_modules/.prisma -ErrorAction SilentlyContinue
cd backend; npm run build
```

### Tests

```bash
cd backend
npm test
```

---

## Referencia r�pida

| Acci�n              | Comando / Endpoint                                                                 |
|---------------------|-------------------------------------------------------------------------------------|
| Smoke Node          | `node backend/scripts/smoke-test-aliexpress-oauth.js`                              |
| Smoke PowerShell    | `backend\scripts\ps-aliexpress-oauth-e2e.ps1`                                      |
| Login               | `POST /api/auth/login`                                                             |
| Auth URL            | `GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production`     |
| Debug credentials   | `GET /api/debug/aliexpress-dropshipping-credentials`                               |

Configurar antes de OAuth: **App Key** y **App Secret** de AliExpress Dropshipping en la configuraci�n de APIs de la app.
