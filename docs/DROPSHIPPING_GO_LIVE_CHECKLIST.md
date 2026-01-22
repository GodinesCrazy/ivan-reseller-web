# Dropshipping Go/No-Go Checklist

Checklist operativo para validar que el sistema dropshipping est� listo para producci�n.

---

## Pre-requisitos

- [ ] Backend desplegado en Railway y saludable
- [ ] Vercel proxy configurado y funcionando
- [ ] Variables de entorno configuradas en Railway:

### Variables Railway Necesarias

**Cr�ticas (sin estas el backend no arranca):**
- `PORT` - Inyectado autom�ticamente por Railway (NO configurar manualmente)
- `JWT_SECRET` - M�nimo 32 caracteres
- `DATABASE_URL` - URL completa de PostgreSQL (formato: `postgresql://user:pass@host:port/db`)

**Opcionales pero recomendadas:**
- `ENCRYPTION_KEY` - M�nimo 32 caracteres (o usa JWT_SECRET como fallback)
- `REDIS_URL` - Si se usa Redis para cache/queues
- `CORS_ORIGIN` o `CORS_ORIGINS` - Or�genes permitidos (comma-separated)
- `FRONTEND_URL` - URL del frontend (Vercel)
- `API_URL` - URL p�blica del backend (Railway)

**Nota:** `PORT` es inyectado autom�ticamente por Railway. Si los logs muestran `PORT=3000` en producci�n, verifica que Railway est� inyectando PORT correctamente.

---

## 1. Healthcheck y Disponibilidad

### Railway Healthcheck
- [ ] `GET /health` retorna 200 en Railway
- [ ] `GET /api/health` retorna 200
- [ ] Healthcheck pasa en el primer minuto despu�s del deploy
- [ ] Logs muestran "Listening on host=0.0.0.0 port=<PORT>" (PORT debe ser el inyectado por Railway, NO 3000)
- [ ] Logs muestran "Health endpoint ready - server accepting connections"

**Comando de verificaci�n:**
```powershell
Invoke-WebRequest -Uri "https://www.ivanreseller.com/health" -UseBasicParsing
```

---

## 2. Login y Autenticaci�n

### Login Funcional
- [ ] `POST /api/auth/login` retorna 200 con `success: true`
- [ ] Cookies se establecen correctamente (`token`, `refreshToken`)
- [ ] Cookies tienen `SameSite=None`, `Secure=true`, `httpOnly=true` en producci�n
- [ ] Token viene en el body tambi�n (fallback)

**Script de verificación (GO-LIVE):**
```powershell
cd backend
.\scripts\ps-go-live-dropshipping.ps1
```

**Validaciones esperadas (todas deben ser PASS):**
- [PASS] Login success
- [PASS] Auth-status returned 200
- [PASS] Products returned 200
- [PASS] Auth-URL returned 200 with authUrl
- [PASS] Debug credentials returned 200

**Nota:** Este script NO usa `curl.exe`. Usa PowerShell `Invoke-WebRequest` con `-SessionVariable` para mantener cookies. `curl.exe` en Windows puede fallar con 400 INVALID_JSON y NO es considerado bug crítico.

---

## 3. Session Cookie Persistencia

### Cookies Cross-Domain
- [ ] Cookies persisten entre requests usando `-WebSession` en PowerShell
- [ ] `GET /api/auth-status` con `-WebSession $session` retorna 200
- [ ] `GET /api/products` con `-WebSession $session` retorna 200
- [ ] No se requiere re-login entre requests

**Verificaci�n:**
```powershell
$body = @{username="admin";password="admin123"} | ConvertTo-Json -Compress
$null = Invoke-WebRequest -Uri "https://www.ivanreseller.com/api/auth/login" `
    -Method Post -Body $body -ContentType "application/json; charset=utf-8" `
    -SessionVariable session -UseBasicParsing

Invoke-WebRequest -Uri "https://www.ivanreseller.com/api/auth-status" `
    -Method Get -WebSession $session -UseBasicParsing
# Debe retornar 200
```

---

## 4. AliExpress Dropshipping OAuth

### Auth URL Generation
- [ ] `GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production` retorna 200
- [ ] Response contiene `success: true` y `data.authUrl`
- [ ] Auth URL es v�lida y apunta a `auth.aliexpress.com`
- [ ] Auth URL contiene par�metros correctos (client_id, redirect_uri, state, etc.)

**Script de verificaciÃ³n (GO-LIVE):**
```powershell
backend\scripts\ps-aliexpress-oauth-e2e.ps1
```

### OAuth Callback Path
- [ ] Callback URL configurada: `https://www.ivanreseller.com/api/aliexpress/callback`
- [ ] Callback endpoint existe y est� montado
- [ ] Callback guarda tokens correctamente despu�s de autorizaci�n
- [ ] Callback redirige al frontend con query params (`oauth=success&...`)

### Debug Credentials Endpoint
- [ ] `GET /api/debug/aliexpress-dropshipping-credentials` retorna 200 (autenticado)
- [ ] Response contiene `ok: true` y `summary`
- [ ] `summary.hasProductionToken` o `summary.hasSandboxToken` es `true` despu�s de OAuth
- [ ] No se exponen tokens completos (solo �ltimos 4 caracteres o hash)

---

## 5. Vercel Proxy Headers

### Headers de Trazabilidad
- [ ] Requests a `/api/*` incluyen header `X-Railway-Proxy: railway-backend`
- [ ] Header `X-Proxy-Target` est� presente
- [ ] Logs en Railway muestran requests con `[VERCEL-PROXY]`

**Verificaci�n:**
```powershell
$r = Invoke-WebRequest -Uri "https://www.ivanreseller.com/api/auth-status" -UseBasicParsing
$r.Headers['X-Railway-Proxy']  # Debe existir
```

---

## 6. Errores y Diagn�stico

### Errores de Login (400, nunca 500)
- [ ] Invalid JSON body -> `400` con `errorCode: "INVALID_JSON"` y `diagnostic`
- [ ] Body no es objeto -> `400` con `errorCode: "INVALID_BODY"`
- [ ] Faltan username/password -> `400` con `errorCode: "MISSING_REQUIRED_FIELD"`
- [ ] Ning�n caso retorna 500

### Endpoint de Diagn�stico
- [ ] `POST /api/debug/echo-json` retorna informaci�n de parsing sin exponer valores sensibles
- [ ] Response incluye `contentType`, `contentLength`, `bodyType`, `bodyKeys`
- [ ] Campos sensibles (password, token, etc.) se marcan como redacted

---

## 7. Scripts de QA

### Scripts Oficiales
- [ ] `backend/scripts/ps-go-live-dropshipping.ps1` ejecuta sin errores
- [ ] `backend/scripts/ps-aliexpress-oauth-e2e.ps1` ejecuta sin errores
- [ ] `backend/scripts/smoke-test-aliexpress-oauth.js` ejecuta sin errores (Node)
- [ ] Todos los scripts usan PowerShell/Node, NO curl.exe

---

## 8. Documentaci�n

### Docs Actualizadas
- [ ] `docs/COMANDOS_POWERSHELL_LOGIN.md` indica PowerShell como m�todo oficial
- [ ] `docs/ALIEXPRESS_OAUTH_E2E_PROD.md` describe flujo completo OAuth
- [ ] `docs/DROPSHIPPING_GO_LIVE_CHECKLIST.md` (este documento) est� completo

---

## Resultado Final

### Go/No-Go Decision

****GO si:****
- âœ… Todos los items de secciones 1-4 est�n marcados
- âœ… Healthcheck Railway verde
- âœ… Login funciona con PowerShell
- âœ… OAuth auth-url genera URL v�lida
- âœ… Callback path configurado correctamente

**NO-**GO si:****
- âœ… Healthcheck falla en Railway
- âœ… Login retorna 500 o falla consistentemente
- âœ… Cookies no persisten entre requests
- âœ… Auth URL no se genera o es inv�lida
- âœ… Callback no guarda tokens

---

## Comandos R�pidos

```powershell
# Smoke test completo
cd backend
.\scripts\ps-go-live-dropshipping.ps1

# OAuth E2E
backend\scripts\ps-aliexpress-oauth-e2e.ps1

# Healthcheck
Invoke-WebRequest -Uri "https://www.ivanreseller.com/health" -UseBasicParsing

# Debug JSON parsing
$body = '{"test":"value"}' | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://www.ivanreseller.com/api/debug/echo-json" `
    -Method Post -Body $body -ContentType "application/json; charset=utf-8"
```

---

**�ltima actualizaci�n:** 2025-01-22  
**Responsable:** Backend/QA Team
