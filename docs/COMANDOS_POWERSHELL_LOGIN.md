# Comandos PowerShell para Login y Autenticaciùn

## Configuraciùn Inicial

```powershell
# Variables de entorno
$API_URL = "https://www.ivanreseller.com"
# O usar Railway backend directo:
# $API_URL = "https://tu-backend.railway.app"
```

## 1. Login y Obtener Cookie

### Mùtodo 1: ConvertTo-Json (Recomendado)

```powershell
# Crear body como objeto PowerShell
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

# Login y capturar respuesta completa con headers
$response = Invoke-WebRequest -Uri "$API_URL/api/auth/login" `
    -Method POST `
    -Headers @{"Content-Type" = "application/json"} `
    -Body $body `
    -SessionVariable session

# Extraer cookie token
$tokenCookie = $session.Cookies.GetCookies($API_URL) | Where-Object { $_.Name -eq "token" }
$tokenValue = $tokenCookie.Value

Write-Host "Token: $tokenValue" -ForegroundColor Green
```

### Mùtodo 2: NO USAR curl.exe en Windows

?? **IMPORTANTE:** `curl.exe` en Windows puede fallar con 400 INVALID_JSON por problemas de encoding/quotes.  
**Usar siempre PowerShell `Invoke-WebRequest` o `Invoke-RestMethod` con `-SessionVariable`.**

Si necesitas usar curl por alguna razùn, asegùrate de usar `--data-binary` y verificar encoding UTF-8, pero **no es el mùtodo recomendado**.

### Mùtodo 3: Usando Invoke-RestMethod (Mùs simple)

```powershell
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "$API_URL/api/auth/login" `
    -Method POST `
    -Headers @{"Content-Type" = "application/json"} `
    -Body $body `
    -SessionVariable session

# El token viene en el body tambiùn
$tokenFromBody = $response.data.token
Write-Host "Token from body: $tokenFromBody" -ForegroundColor Green

# Y tambiùn en las cookies
$tokenCookie = $session.Cookies.GetCookies($API_URL) | Where-Object { $_.Name -eq "token" }
Write-Host "Token from cookie: $($tokenCookie.Value)" -ForegroundColor Green
```

## 2. Usar Cookie en Requests Posteriores

### Opciùn A: Usar WebSession (Recomendado para PowerShell)

```powershell
# Login primero (crea session)
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$null = Invoke-RestMethod -Uri "$API_URL/api/auth/login" `
    -Method POST `
    -Headers @{"Content-Type" = "application/json"} `
    -Body $body `
    -WebSession $session

# Usar la misma session para requests posteriores (envùa cookies automùticamente)
$authStatus = Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -WebSession $session

$authStatus | ConvertTo-Json -Depth 10
```

### Opciùn B: Usar Header Cookie Manual

```powershell
# Obtener token (del body o de la cookie)
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$API_URL/api/auth/login" `
    -Method POST `
    -Headers @{"Content-Type" = "application/json"} `
    -Body $body

$token = $loginResponse.data.token

# Usar token en header Cookie
Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -Headers @{"Cookie" = "token=$token"} `
    -ContentType "application/json"
```

### Opciùn C: Usar Header Authorization Bearer

```powershell
$token = "TU_TOKEN_AQUI"

Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -Headers @{"Authorization" = "Bearer $token"} `
    -ContentType "application/json"
```

## 3. Endpoints con Autenticaciùn

### Auth Status

```powershell
# Con Cookie header
Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -Headers @{"Cookie" = "token=$token"} `
    -ContentType "application/json"

# Con Authorization Bearer
Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -Headers @{"Authorization" = "Bearer $token"} `
    -ContentType "application/json"

# Con WebSession (automùtico)
Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -WebSession $session
```

### Products

```powershell
Invoke-RestMethod -Uri "$API_URL/api/products" `
    -Method GET `
    -Headers @{"Cookie" = "token=$token"} `
    -ContentType "application/json"
```

### Automation Config

```powershell
Invoke-RestMethod -Uri "$API_URL/api/automation/config" `
    -Method GET `
    -Headers @{"Cookie" = "token=$token"} `
    -ContentType "application/json"
```

## 4. Debug Endpoint

### Login Smoke Test

```powershell
# Probar login automùtico y verificar cookies
Invoke-RestMethod -Uri "$API_URL/api/debug/login-smoke" `
    -Method GET `
    -ContentType "application/json" | ConvertTo-Json -Depth 5
```

## 5. Script Completo de Ejemplo

```powershell
# Script completo: Login ? Auth Status ? Products

$API_URL = "https://www.ivanreseller.com"

Write-Host "`n1. Login..." -ForegroundColor Cyan
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api/auth/login" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body $body `
        -SessionVariable session
    
    if ($loginResponse.success) {
        Write-Host "  ? Login exitoso" -ForegroundColor Green
        $token = $loginResponse.data.token
        Write-Host "  Token obtenido: $($token.Substring(0, 20))..." -ForegroundColor Green
    } else {
        Write-Host "  ? Login fallù" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ? Error en login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n2. Auth Status..." -ForegroundColor Cyan
try {
    $authStatus = Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
        -Method GET `
        -WebSession $session
    
    Write-Host "  ? Auth status OK" -ForegroundColor Green
    Write-Host "  Statuses: $($authStatus.data.statuses | ConvertTo-Json -Compress)" -ForegroundColor Yellow
} catch {
    Write-Host "  ? Error en auth-status: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n3. Products..." -ForegroundColor Cyan
try {
    $products = Invoke-RestMethod -Uri "$API_URL/api/products" `
        -Method GET `
        -WebSession $session
    
    Write-Host "  ? Products OK" -ForegroundColor Green
    Write-Host "  Total productos: $($products.products.Count)" -ForegroundColor Yellow
} catch {
    Write-Host "  ? Error en products: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n? Tests completados" -ForegroundColor Green
```

## 6. Soluciùn de Problemas

### Si recibes 400 INVALID_JSON

1. **Verificar Content-Type:**
   ```powershell
   $headers = @{
       "Content-Type" = "application/json; charset=utf-8"
   }
   ```

2. **Usar ConvertTo-Json correctamente:**
   ```powershell
   $body = @{username="admin";password="admin123"} | ConvertTo-Json -Compress
   ```

3. **NO usar curl.exe en Windows:**
   - Usar `Invoke-WebRequest` o `Invoke-RestMethod` con `-SessionVariable session`
   - Ver script oficial: `backend/scripts/ps-login-and-session-smoke.ps1`

### Si recibes 401 Invalid token

1. **Verificar que el token no haya expirado:**
   - Tokens expiran en 1 hora
   - Hacer login nuevamente

2. **Verificar formato del token:**
   ```powershell
   # Token debe ser un JWT vùlido
   $token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   ```

3. **Verificar JWT_SECRET no cambiù:**
   - Si JWT_SECRET cambiù en Railway, todos los tokens anteriores se invalidan
   - Necesitas hacer login nuevamente

### Si las cookies no funcionan

1. **Usar WebSession en PowerShell:**
   ```powershell
   -WebSession $session
   ```

2. **Verificar SameSite=None y Secure:**
   - En producciùn, cookies deben tener `SameSite=None; Secure`
   - Backend debe estar en HTTPS

3. **Verificar que NO se estableciù Domain:**
   - En producciùn (Vercel -> Railway), no debe haber `Domain=...`
   - Esto permite cross-domain cookies

---

**ùltima actualizaciùn:** 2025-01-XX
**Notas:** Los comandos funcionan con PowerShell 5.1+ y PowerShell Core 7+
