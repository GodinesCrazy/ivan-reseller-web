# Verification Script for Railway Deployment
# Uso: .\verify-deployment.ps1 [URL]

param(
    [string]$BaseUrl = ""
)

Write-Host "?? Railway Deployment Verification" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Obtener URL desde Railway CLI si no se proporciona
if ([string]::IsNullOrEmpty($BaseUrl)) {
    Write-Host "?? Obteniendo URL desde Railway..." -ForegroundColor Yellow
    $domain = railway domain 2>&1
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrEmpty($domain)) {
        $BaseUrl = $domain.Trim()
        Write-Host "? URL encontrada: $BaseUrl" -ForegroundColor Green
    } else {
        Write-Host "??  No se pudo obtener URL automáticamente" -ForegroundColor Yellow
        $BaseUrl = Read-Host "Ingresa la URL del backend (ej: https://xxx.up.railway.app)"
    }
}

if ([string]::IsNullOrEmpty($BaseUrl)) {
    Write-Host "? URL requerida" -ForegroundColor Red
    exit 1
}

# Asegurar que la URL no termine en /
$BaseUrl = $BaseUrl.TrimEnd('/')

Write-Host ""
Write-Host "?? Verificando endpoints..." -ForegroundColor Cyan
Write-Host ""

$endpoints = @(
    @{ Path = "/health"; Name = "Health Check (Root)"; Critical = $true },
    @{ Path = "/api/health"; Name = "Health Check (API)"; Critical = $true },
    @{ Path = "/api/debug/ping"; Name = "Debug Ping"; Critical = $true },
    @{ Path = "/api/debug/build-info"; Name = "Build Info"; Critical = $false },
    @{ Path = "/api/debug/aliexpress/probe"; Name = "AliExpress Probe"; Critical = $false },
    @{ Path = "/api/debug/ebay/probe"; Name = "eBay Probe"; Critical = $false }
)

$results = @()
$allCriticalPassed = $true

foreach ($endpoint in $endpoints) {
    $url = "$BaseUrl$($endpoint.Path)"
    Write-Host "  Testing: $($endpoint.Name) ($($endpoint.Path))" -ForegroundColor Yellow -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        $status = $response.StatusCode
        
        if ($status -eq 200) {
            Write-Host " ? OK ($status)" -ForegroundColor Green
            $results += @{
                Name = $endpoint.Name
                Path = $endpoint.Path
                Status = "? PASS"
                Code = $status
                Critical = $endpoint.Critical
            }
        } else {
            Write-Host " ??  Unexpected status: $status" -ForegroundColor Yellow
            $results += @{
                Name = $endpoint.Name
                Path = $endpoint.Path
                Status = "??  WARN"
                Code = $status
                Critical = $endpoint.Critical
            }
            if ($endpoint.Critical) {
                $allCriticalPassed = $false
            }
        }
    } catch {
        $errorMsg = $_.Exception.Message
        Write-Host " ? FAILED" -ForegroundColor Red
        Write-Host "     Error: $errorMsg" -ForegroundColor Red
        $results += @{
            Name = $endpoint.Name
            Path = $endpoint.Path
            Status = "? FAIL"
            Code = "N/A"
            Error = $errorMsg
            Critical = $endpoint.Critical
        }
        if ($endpoint.Critical) {
            $allCriticalPassed = $false
        }
    }
}

Write-Host ""
Write-Host "?? Resumen de Verificación" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

foreach ($result in $results) {
    $statusColor = if ($result.Status -eq "? PASS") { "Green" } 
                   elseif ($result.Status -eq "??  WARN") { "Yellow" } 
                   else { "Red" }
    
    $criticalMark = if ($result.Critical) { " [CRITICAL]" } else { "" }
    Write-Host "  $($result.Status) $($result.Name)$criticalMark" -ForegroundColor $statusColor
    Write-Host "     Path: $($result.Path)" -ForegroundColor Gray
    Write-Host "     Code: $($result.Code)" -ForegroundColor Gray
    if ($result.Error) {
        Write-Host "     Error: $($result.Error)" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "============================" -ForegroundColor Cyan
if ($allCriticalPassed) {
    Write-Host "? Todos los endpoints críticos están funcionando" -ForegroundColor Green
    Write-Host ""
    Write-Host "?? Deployment verificado exitosamente!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "? Algunos endpoints críticos fallaron" -ForegroundColor Red
    Write-Host ""
    Write-Host "?? Próximos pasos:" -ForegroundColor Yellow
    Write-Host "   1. Revisa logs: railway logs --follow" -ForegroundColor White
    Write-Host "   2. Verifica variables: railway variables" -ForegroundColor White
    Write-Host "   3. Verifica build: Busca 'dist/server.js' en logs" -ForegroundColor White
    exit 1
}
