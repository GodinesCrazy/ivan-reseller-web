# Comandos PowerShell para Login y Autenticación

## Configuración Inicial

```powershell
# Variables de entorno
$API_URL = "https://www.ivanreseller.com"
# O usar Railway backend directo:
# $API_URL = "https://tu-backend.railway.app"
```

## 1. Login y Obtener Cookie

### Método 1: ConvertTo-Json (Recomendado)

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

### Método 2: JSON Literal con curl.exe

```powershell
# Login y ver headers Set-Cookie
curl.exe -i -X POST "$API_URL/api/auth/login" `
    -H "Content-Type: application/json" `
    --data-binary '{"username":"admin","password":"admin123"}'
```

### Método 3: Usando Invoke-RestMethod (Más simple)

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

# El token viene en el body también
$tokenFromBody = $response.data.token
Write-Host "Token from body: $tokenFromBody" -ForegroundColor Green

# Y también en las cookies
$tokenCookie = $session.Cookies.GetCookies($API_URL) | Where-Object { $_.Name -eq "token" }
Write-Host "Token from cookie: $($tokenCookie.Value)" -ForegroundColor Green
```

## 2. Usar Cookie en Requests Posteriores

### Opción A: Usar WebSession (Recomendado para PowerShell)

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

# Usar la misma session para requests posteriores (envía cookies automáticamente)
$authStatus = Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -WebSession $session

$authStatus | ConvertTo-Json -Depth 10
```

### Opción B: Usar Header Cookie Manual

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

### Opción C: Usar Header Authorization Bearer

```powershell
$token = "TU_TOKEN_AQUI"

Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
    -Method GET `
    -Headers @{"Authorization" = "Bearer $token"} `
    -ContentType "application/json"
```

## 3. Endpoints con Autenticación

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

# Con WebSession (automático)
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
# Probar login automático y verificar cookies
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
        Write-Host "  ? Login falló" -ForegroundColor Red
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

## 6. Solución de Problemas

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

3. **Usar --data-binary con curl:**
   ```powershell
   curl.exe -X POST "$API_URL/api/auth/login" `
       -H "Content-Type: application/json" `
       --data-binary '{"username":"admin","password":"admin123"}'
   ```

### Si recibes 401 Invalid token

1. **Verificar que el token no haya expirado:**
   - Tokens expiran en 1 hora
   - Hacer login nuevamente

2. **Verificar formato del token:**
   ```powershell
   # Token debe ser un JWT válido
   $token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   ```

3. **Verificar JWT_SECRET no cambió:**
   - Si JWT_SECRET cambió en Railway, todos los tokens anteriores se invalidan
   - Necesitas hacer login nuevamente

### Si las cookies no funcionan

1. **Usar WebSession en PowerShell:**
   ```powershell
   -WebSession $session
   ```

2. **Verificar SameSite=None y Secure:**
   - En producción, cookies deben tener `SameSite=None; Secure`
   - Backend debe estar en HTTPS

3. **Verificar que NO se estableció Domain:**
   - En producción (Vercel -> Railway), no debe haber `Domain=...`
   - Esto permite cross-domain cookies

---

**Última actualización:** 2025-01-XX
**Notas:** Los comandos funcionan con PowerShell 5.1+ y PowerShell Core 7+
