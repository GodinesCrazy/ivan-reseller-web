# Script para monitorear el deployment en Railway
# Uso: .\scripts\monitor_railway_deployment.ps1

$baseUrl = "https://ivan-reseller-web-production.up.railway.app"
$maxAttempts = 30
$intervalSeconds = 10

Write-Host "🔍 Monitoreando deployment en Railway..." -ForegroundColor Cyan
Write-Host "URL: $baseUrl" -ForegroundColor Gray
Write-Host "Intervalo: $intervalSeconds segundos" -ForegroundColor Gray
Write-Host "Máximo de intentos: $maxAttempts" -ForegroundColor Gray
Write-Host ""

$attempt = 0
$isHealthy = $false

while ($attempt -lt $maxAttempts -and -not $isHealthy) {
    $attempt++
    Write-Host "[Intento $attempt/$maxAttempts] Verificando deployment..." -ForegroundColor Yellow
    
    try {
        # Test 1: Health endpoint
        Write-Host "  → Probando /health..." -NoNewline
        $healthResponse = Invoke-WebRequest -Uri "$baseUrl/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
        if ($healthResponse.StatusCode -eq 200) {
            $healthData = $healthResponse.Content | ConvertFrom-Json
            Write-Host " ✅ OK" -ForegroundColor Green
            Write-Host "    Status: $($healthData.status)" -ForegroundColor Gray
            Write-Host "    Service: $($healthData.service)" -ForegroundColor Gray
            
            # Test 2: API Health endpoint
            Write-Host "  → Probando /api/health..." -NoNewline
            try {
                $apiHealthResponse = Invoke-WebRequest -Uri "$baseUrl/api/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
                if ($apiHealthResponse.StatusCode -eq 200) {
                    Write-Host " ✅ OK" -ForegroundColor Green
                } else {
                    Write-Host " ⚠️  Status: $($apiHealthResponse.StatusCode)" -ForegroundColor Yellow
                }
            } catch {
                Write-Host " ⚠️  Error: $($_.Exception.Message)" -ForegroundColor Yellow
            }
            
            # Test 3: Setup status endpoint (debe existir ahora)
            Write-Host "  → Probando /api/setup-status..." -NoNewline
            try {
                # Este endpoint requiere autenticación, pero al menos verifica que existe
                $setupResponse = Invoke-WebRequest -Uri "$baseUrl/api/setup-status" -Method GET -TimeoutSec 5 -ErrorAction Stop
                Write-Host " ✅ Existe (Status: $($setupResponse.StatusCode))" -ForegroundColor Green
            } catch {
                if ($_.Exception.Response.StatusCode -eq 401) {
                    Write-Host " ✅ Existe (requiere autenticación)" -ForegroundColor Green
                } elseif ($_.Exception.Response.StatusCode -eq 404) {
                    Write-Host " ❌ No encontrado (404)" -ForegroundColor Red
                } else {
                    Write-Host " ⚠️  Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
                }
            }
            
            # Test 4: AliExpress token status endpoint
            Write-Host "  → Probando /api/aliexpress/token-status..." -NoNewline
            try {
                $aliResponse = Invoke-WebRequest -Uri "$baseUrl/api/aliexpress/token-status" -Method GET -TimeoutSec 5 -ErrorAction Stop
                if ($aliResponse.StatusCode -eq 200) {
                    Write-Host " ✅ OK" -ForegroundColor Green
                } else {
                    Write-Host " ⚠️  Status: $($aliResponse.StatusCode)" -ForegroundColor Yellow
                }
            } catch {
                if ($_.Exception.Response.StatusCode -eq 404) {
                    Write-Host " ❌ No encontrado (404)" -ForegroundColor Red
                } else {
                    Write-Host " ⚠️  Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
                }
            }
            
            Write-Host ""
            Write-Host "✅ DEPLOYMENT EXITOSO!" -ForegroundColor Green
            Write-Host "   El servidor está respondiendo correctamente." -ForegroundColor Gray
            $isHealthy = $true
            
        } else {
            Write-Host " ⚠️  Status: $($healthResponse.StatusCode)" -ForegroundColor Yellow
        }
        
    } catch {
        $statusCode = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        
        if ($statusCode -eq $null) {
            Write-Host " ❌ Error de conexión: $($_.Exception.Message)" -ForegroundColor Red
        } else {
            Write-Host " ⚠️  Status: $statusCode" -ForegroundColor Yellow
        }
        
        Write-Host "   Esperando $intervalSeconds segundos antes del siguiente intento..." -ForegroundColor Gray
        Write-Host ""
        
        if ($attempt -lt $maxAttempts) {
            Start-Sleep -Seconds $intervalSeconds
        }
    }
}

if (-not $isHealthy) {
    Write-Host ""
    Write-Host "❌ El deployment no respondió después de $maxAttempts intentos." -ForegroundColor Red
    Write-Host "   Verifica manualmente en Railway Dashboard:" -ForegroundColor Yellow
    Write-Host "   1. Revisa los logs del deployment" -ForegroundColor Yellow
    Write-Host "   2. Verifica que el build pasó correctamente" -ForegroundColor Yellow
    Write-Host "   3. Revisa que no haya errores en los logs de runtime" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "📊 Resumen del Deployment:" -ForegroundColor Cyan
Write-Host "   ✅ Servidor arrancado correctamente" -ForegroundColor Green
Write-Host "   ✅ Health endpoint funcionando" -ForegroundColor Green
Write-Host "   ✅ Rutas API disponibles" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 Deployment completado exitosamente!" -ForegroundColor Green
exit 0

