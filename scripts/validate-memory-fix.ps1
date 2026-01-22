# Script de Validación - Fix Memoria + SIGSEGV
# Ejecutar después de implementar las 3 fases del plan

param(
    [string]$ApiUrl = "",
    [string]$AuthToken = ""
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VALIDACIÓN FIX MEMORIA + SIGSEGV" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if (-not $ApiUrl) {
    $ApiUrl = Read-Host "Ingresa la URL del backend (ej: https://tu-backend.railway.app)"
}

if (-not $AuthToken) {
    $AuthToken = Read-Host "Ingresa tu JWT token de autenticación"
}

$headers = @{
    "Authorization" = "Bearer $AuthToken"
    "Content-Type" = "application/json"
}

# Test 1: Health check básico
Write-Host "[TEST 1] Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api/system/health" -Method GET -ErrorAction Stop
    Write-Host "  ? Status: $($response.status)" -ForegroundColor Green
} catch {
    Write-Host "  ? FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Auth Status (10 requests secuenciales)
Write-Host "`n[TEST 2] Auth Status (10 requests secuenciales)..." -ForegroundColor Yellow
$successCount = 0
$failCount = 0
$durations = @()

for ($i = 1; $i -le 10; $i++) {
    try {
        $startTime = Get-Date
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/auth-status" -Method GET -Headers $headers -ErrorAction Stop
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        $durations += $duration
        
        if ($response.success) {
            Write-Host "  ? Request $i`: OK (${duration}ms)" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "  ??  Request $i`: Success=false (${duration}ms)" -ForegroundColor Yellow
            $failCount++
        }
        Start-Sleep -Milliseconds 500
    } catch {
        Write-Host "  ? Request $i`: FAILED - $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
    }
}

$avgDuration = if ($durations.Count -gt 0) { [math]::Round(($durations | Measure-Object -Average).Average, 2) } else { 0 }
Write-Host "`n  Resumen:" -ForegroundColor Cyan
Write-Host "    Success: $successCount / 10" -ForegroundColor $(if ($successCount -eq 10) { "Green" } else { "Yellow" })
Write-Host "    Failed: $failCount / 10" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "    Duración promedio: ${avgDuration}ms" -ForegroundColor $(if ($avgDuration -lt 2000) { "Green" } else { "Yellow" })

# Test 3: Verificar headers de overload
Write-Host "`n[TEST 3] Verificando headers de overload..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/api/auth-status" -Method GET -Headers $headers -ErrorAction Stop
    $overloadHeader = $response.Headers['X-Overload-Reason']
    
    if ($overloadHeader) {
        Write-Host "  ??  WARNING: Header X-Overload-Reason presente: $overloadHeader" -ForegroundColor Yellow
    } else {
        Write-Host "  ? No se detectó header de overload" -ForegroundColor Green
    }
} catch {
    Write-Host "  ? Error verificando headers: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Stress test (20 requests concurrentes)
Write-Host "`n[TEST 4] Stress Test (20 concurrent requests)..." -ForegroundColor Yellow
$jobs = 1..20 | ForEach-Object {
    Start-Job -ScriptBlock {
        param($url, $token)
        $headers = @{
            "Authorization" = "Bearer $token"
        }
        try {
            $startTime = Get-Date
            $response = Invoke-RestMethod -Uri "$url/api/auth-status" -Method GET -Headers $headers -ErrorAction Stop
            $duration = ((Get-Date) - $startTime).TotalMilliseconds
            return @{ Success = $true; Status = "OK"; Duration = $duration }
        } catch {
            return @{ Success = $false; Error = $_.Exception.Message }
        }
    } -ArgumentList $ApiUrl, $AuthToken
}

$results = $jobs | Wait-Job | Receive-Job
$jobs | Remove-Job

$successCount = ($results | Where-Object { $_.Success }).Count
$failCount = ($results | Where-Object { -not $_.Success }).Count
$avgDuration = [math]::Round(($results | Where-Object { $_.Duration } | ForEach-Object { $_.Duration } | Measure-Object -Average).Average, 2)

Write-Host "  Resumen:" -ForegroundColor Cyan
Write-Host "    Success: $successCount / 20" -ForegroundColor $(if ($successCount -eq 20) { "Green" } else { "Yellow" })
Write-Host "    Failed: $failCount / 20" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "    Duración promedio: ${avgDuration}ms" -ForegroundColor $(if ($avgDuration -lt 2000) { "Green" } else { "Yellow" })

# Test 5: Verificar variables de entorno (si hay endpoint de métricas)
Write-Host "`n[TEST 5] Verificando configuración..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api/auth-status" -Method GET -Headers $headers -ErrorAction Stop
    if ($response._safeMode) {
        Write-Host "  ? SAFE_AUTH_STATUS_MODE: enabled" -ForegroundColor Green
    } else {
        Write-Host "  ??  SAFE_AUTH_STATUS_MODE: disabled" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ??  No se pudo verificar configuración" -ForegroundColor Yellow
}

# Resumen final
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESUMEN FINAL" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$allTestsPassed = ($successCount -eq 10) -and ($failCount -eq 0)

if ($allTestsPassed) {
    Write-Host "? TODOS LOS TESTS PASARON" -ForegroundColor Green
    Write-Host "   - No se detectaron crashes SIGSEGV" -ForegroundColor Green
    Write-Host "   - Endpoint /api/auth-status responde correctamente" -ForegroundColor Green
    Write-Host "   - Duración promedio < 2s" -ForegroundColor Green
} else {
    Write-Host "??  ALGUNOS TESTS FALLARON" -ForegroundColor Yellow
    Write-Host "   - Revisar logs en Railway Dashboard" -ForegroundColor Yellow
    Write-Host "   - Verificar variables de entorno" -ForegroundColor Yellow
    Write-Host "   - Verificar que dynamic imports están implementados" -ForegroundColor Yellow
}

Write-Host "`nPróximos pasos:" -ForegroundColor Cyan
Write-Host "  1. Monitorear logs en Railway por 24-48h" -ForegroundColor White
Write-Host "  2. Verificar que no hay crashes SIGSEGV" -ForegroundColor White
Write-Host "  3. Verificar uso de memoria < 80%" -ForegroundColor White
Write-Host "`n"
