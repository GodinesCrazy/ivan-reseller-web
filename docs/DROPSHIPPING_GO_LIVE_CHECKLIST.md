# Dropshipping Go/No-Go Checklist

Checklist operativo para validar que el sistema dropshipping está listo para producción.

---

## Pre-requisitos

- [ ] Backend desplegado en Railway y saludable
- [ ] Vercel proxy configurado y funcionando
- [ ] Variables de entorno configuradas (DATABASE_URL, JWT_SECRET, etc.)

---

## 1. Healthcheck y Disponibilidad

### Railway Healthcheck
- [ ] `GET /health` retorna 200 en Railway
- [ ] `GET /api/health` retorna 200
- [ ] Healthcheck pasa en el primer minuto después del deploy
- [ ] Logs muestran "Listening on PORT=..." y "Health endpoint ready"

**Comando de verificación:**
```powershell
Invoke-WebRequest -Uri "https://www.ivanreseller.com/health" -UseBasicParsing
```

---

## 2. Login y Autenticación

### Login Funcional
- [ ] `POST /api/auth/login` retorna 200 con `success: true`
- [ ] Cookies se establecen correctamente (`token`, `refreshToken`)
- [ ] Cookies tienen `SameSite=None`, `Secure=true`, `httpOnly=true` en producción
- [ ] Token viene en el body también (fallback)

**Script de verificación:**
```powershell
backend\scripts\ps-login-and-session-smoke.ps1
```

**Validaciones esperadas:**
- [PASS] Login success
- [PASS] Auth-status returned 200
- [PASS] Products returned 200
- [PASS] Auth-URL returned 200 with authUrl

---

## 3. Session Cookie Persistencia

### Cookies Cross-Domain
- [ ] Cookies persisten entre requests usando `-WebSession` en PowerShell
- [ ] `GET /api/auth-status` con `-WebSession $session` retorna 200
- [ ] `GET /api/products` con `-WebSession $session` retorna 200
- [ ] No se requiere re-login entre requests

**Verificación:**
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
- [ ] Auth URL es válida y apunta a `auth.aliexpress.com`
- [ ] Auth URL contiene parámetros correctos (client_id, redirect_uri, state, etc.)

**Script de verificación:**
```powershell
backend\scripts\ps-aliexpress-oauth-e2e.ps1
```

### OAuth Callback Path
- [ ] Callback URL configurada: `https://www.ivanreseller.com/api/aliexpress/callback`
- [ ] Callback endpoint existe y está montado
- [ ] Callback guarda tokens correctamente después de autorización
- [ ] Callback redirige al frontend con query params (`oauth=success&...`)

### Debug Credentials Endpoint
- [ ] `GET /api/debug/aliexpress-dropshipping-credentials` retorna 200 (autenticado)
- [ ] Response contiene `ok: true` y `summary`
- [ ] `summary.hasProductionToken` o `summary.hasSandboxToken` es `true` después de OAuth
- [ ] No se exponen tokens completos (solo últimos 4 caracteres o hash)

---

## 5. Vercel Proxy Headers

### Headers de Trazabilidad
- [ ] Requests a `/api/*` incluyen header `X-Railway-Proxy: railway-backend`
- [ ] Header `X-Proxy-Target` está presente
- [ ] Logs en Railway muestran requests con `[VERCEL-PROXY]`

**Verificación:**
```powershell
$r = Invoke-WebRequest -Uri "https://www.ivanreseller.com/api/auth-status" -UseBasicParsing
$r.Headers['X-Railway-Proxy']  # Debe existir
```

---

## 6. Errores y Diagnóstico

### Errores de Login (400, nunca 500)
- [ ] Invalid JSON body ? `400` con `errorCode: "INVALID_JSON"` y `diagnostic`
- [ ] Body no es objeto ? `400` con `errorCode: "INVALID_BODY"`
- [ ] Faltan username/password ? `400` con `errorCode: "MISSING_REQUIRED_FIELD"`
- [ ] Ningún caso retorna 500

### Endpoint de Diagnóstico
- [ ] `POST /api/debug/echo-json` retorna información de parsing sin exponer valores sensibles
- [ ] Response incluye `contentType`, `contentLength`, `bodyType`, `bodyKeys`
- [ ] Campos sensibles (password, token, etc.) se marcan como redacted

---

## 7. Scripts de QA

### Scripts Oficiales
- [ ] `backend/scripts/ps-login-and-session-smoke.ps1` ejecuta sin errores
- [ ] `backend/scripts/ps-aliexpress-oauth-e2e.ps1` ejecuta sin errores
- [ ] `backend/scripts/smoke-test-aliexpress-oauth.js` ejecuta sin errores (Node)
- [ ] Todos los scripts usan PowerShell/Node, NO curl.exe

---

## 8. Documentación

### Docs Actualizadas
- [ ] `docs/COMANDOS_POWERSHELL_LOGIN.md` indica PowerShell como método oficial
- [ ] `docs/ALIEXPRESS_OAUTH_E2E_PROD.md` describe flujo completo OAuth
- [ ] `docs/DROPSHIPPING_GO_LIVE_CHECKLIST.md` (este documento) está completo

---

## Resultado Final

### Go/No-Go Decision

**GO si:**
- ? Todos los items de secciones 1-4 están marcados
- ? Healthcheck Railway verde
- ? Login funciona con PowerShell
- ? OAuth auth-url genera URL válida
- ? Callback path configurado correctamente

**NO-GO si:**
- ? Healthcheck falla en Railway
- ? Login retorna 500 o falla consistentemente
- ? Cookies no persisten entre requests
- ? Auth URL no se genera o es inválida
- ? Callback no guarda tokens

---

## Comandos Rápidos

```powershell
# Smoke test completo
backend\scripts\ps-login-and-session-smoke.ps1

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

**Última actualización:** 2025-01-22  
**Responsable:** Backend/QA Team
