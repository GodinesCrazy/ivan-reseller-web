# Comandos cURL para Validación - AliExpress Dropshipping OAuth

## Configuración

```powershell
# Variables de entorno (ajustar según tu entorno)
$API_URL = "https://tu-backend.railway.app"
$AUTH_TOKEN = "TU_JWT_TOKEN_AQUI"
```

## Comandos de Validación

### 1. Auth Status (Endpoint Crítico)

```powershell
# Test básico
curl -X GET "$API_URL/api/auth-status" `
  -H "Authorization: Bearer $AUTH_TOKEN" `
  -H "Content-Type: application/json" `
  -v

# Verificar headers de degraded
curl -X GET "$API_URL/api/auth-status" `
  -H "Authorization: Bearer $AUTH_TOKEN" `
  -H "Content-Type: application/json" `
  -i | Select-String -Pattern "X-Degraded|X-Overload-Reason|HTTP/"
```

### 2. Products

```powershell
curl -X GET "$API_URL/api/products" `
  -H "Authorization: Bearer $AUTH_TOKEN" `
  -H "Content-Type: application/json" `
  -v
```

### 3. Automation Config

```powershell
curl -X GET "$API_URL/api/automation/config" `
  -H "Authorization: Bearer $AUTH_TOKEN" `
  -H "Content-Type: application/json" `
  -v
```

### 4. Marketplace Auth URL (AliExpress Dropshipping)

```powershell
curl -X GET "$API_URL/api/marketplace/auth-url/aliexpress-dropshipping?redirect_uri=https://ivanreseller.com/aliexpress/callback" `
  -H "Authorization: Bearer $AUTH_TOKEN" `
  -H "Content-Type: application/json" `
  -v
```

## Script PowerShell Completo

```powershell
# Configuración
$API_URL = "https://tu-backend.railway.app"
$AUTH_TOKEN = "TU_JWT_TOKEN_AQUI"

Write-Host "?? Validación de Endpoints Críticos`n" -ForegroundColor Cyan

# Test 1: Auth Status
Write-Host "[TEST 1] /api/auth-status" -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "$API_URL/api/auth-status" `
  -Method GET `
  -Headers @{
    "Authorization" = "Bearer $AUTH_TOKEN"
    "Content-Type" = "application/json"
  } `
  -ErrorAction Stop

$headers = (Invoke-WebRequest -Uri "$API_URL/api/auth-status" `
  -Method GET `
  -Headers @{
    "Authorization" = "Bearer $AUTH_TOKEN"
  } `
  -ErrorAction Stop).Headers

if ($headers['X-Degraded'] -eq 'true') {
  Write-Host "  ??  WARNING: Endpoint degradado (reason: $($headers['X-Overload-Reason']))" -ForegroundColor Yellow
} else {
  Write-Host "  ? OK: Endpoint funcionando normalmente" -ForegroundColor Green
}

# Test 2: Products
Write-Host "`n[TEST 2] /api/products" -ForegroundColor Yellow
try {
  $response = Invoke-RestMethod -Uri "$API_URL/api/products" `
    -Method GET `
    -Headers @{
      "Authorization" = "Bearer $AUTH_TOKEN"
      "Content-Type" = "application/json"
    }
  Write-Host "  ? OK" -ForegroundColor Green
} catch {
  Write-Host "  ? ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Automation Config
Write-Host "`n[TEST 3] /api/automation/config" -ForegroundColor Yellow
try {
  $response = Invoke-RestMethod -Uri "$API_URL/api/automation/config" `
    -Method GET `
    -Headers @{
      "Authorization" = "Bearer $AUTH_TOKEN"
      "Content-Type" = "application/json"
    }
  Write-Host "  ? OK" -ForegroundColor Green
} catch {
  Write-Host "  ? ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Marketplace Auth URL
Write-Host "`n[TEST 4] /api/marketplace/auth-url/aliexpress-dropshipping" -ForegroundColor Yellow
try {
  $response = Invoke-RestMethod -Uri "$API_URL/api/marketplace/auth-url/aliexpress-dropshipping?redirect_uri=https://ivanreseller.com/aliexpress/callback" `
    -Method GET `
    -Headers @{
      "Authorization" = "Bearer $AUTH_TOKEN"
      "Content-Type" = "application/json"
    }
  
  if ($response.success -and $response.data.authUrl) {
    Write-Host "  ? OK: Auth URL generada correctamente" -ForegroundColor Green
  } else {
    Write-Host "  ??  WARNING: Respuesta inesperada" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  ? ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n? Validación completada" -ForegroundColor Green
```

## Validación de Headers

Para verificar que NO hay degraded innecesario:

```powershell
# Verificar headers de auth-status (debe estar limpio)
$response = Invoke-WebRequest -Uri "$API_URL/api/auth-status" `
  -Method GET `
  -Headers @{
    "Authorization" = "Bearer $AUTH_TOKEN"
  }

Write-Host "X-Degraded: $($response.Headers['X-Degraded'])"
Write-Host "X-Overload-Reason: $($response.Headers['X-Overload-Reason'])"
Write-Host "Status Code: $($response.StatusCode)"

# Si X-Degraded es 'true', verificar el reason
if ($response.Headers['X-Degraded'] -eq 'true') {
  $reason = $response.Headers['X-Overload-Reason']
  if ($reason -like '*memory_high_rss_*') {
    $rssMB = ($reason -replace '.*memory_high_rss_(\d+)MB.*', '$1')
    Write-Host "??  Memoria RSS: ${rssMB}MB (umbral: 6800MB para Railway Pro)"
  }
}
```

## Notas

- **auth-status** es crítico y NUNCA debe tener X-Degraded salvo overload real (>6.8GB RSS)
- **products** y **automation/config** pueden degradarse si hay overload
- **marketplace/auth-url** es crítico para OAuth y NUNCA debe degradarse
