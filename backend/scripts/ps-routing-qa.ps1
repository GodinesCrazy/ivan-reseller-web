# Routing QA Script - Diagnóstico definitivo de 502 en producción
# Valida Railway directo y Vercel proxy con retries automáticos
# Run: backend\scripts\ps-routing-qa.ps1

$ErrorActionPreference = "Stop"
$RailwayDirect = "https://ivan-reseller-web-production.up.railway.app"
$VercelProxy = "https://www.ivanreseller.com"

$script:PassCount = 0
$script:FailCount = 0
$script:RailwayDirectOk = $false
$script:VercelProxyOk = $false
$script:Results = @()

function Write-Pass { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green; $script:PassCount++ }
function Write-Fail { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:FailCount++ }

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Source,
        [int]$MaxRetries = 3,
        [int]$RetryDelayMs = 2000
    )
    
    Write-Host ""
    Write-Host "[$Source] Testing $Name ..." -ForegroundColor Yellow
    Write-Host "  URL: $Url" -ForegroundColor Gray
    
    $attempt = 0
    $success = $false
    
    while ($attempt -lt $MaxRetries -and -not $success) {
        $attempt++
        
        if ($attempt -gt 1) {
            Write-Host "  Retry attempt $attempt/$MaxRetries after ${RetryDelayMs}ms delay..." -ForegroundColor Yellow
            Start-Sleep -Milliseconds $RetryDelayMs
        }
        
        try {
            $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            
            if ($response.StatusCode -eq 200) {
                $body = $response.Content
                $bodyPreview = if ($body.Length -gt 200) { $body.Substring(0, 200) + "..." } else { $body }
                
                Write-Pass "$Name returned 200 (attempt $attempt)"
                Write-Host "  StatusCode: $($response.StatusCode)" -ForegroundColor Gray
                
                # Try to parse JSON
                try {
                    $json = $body | ConvertFrom-Json
                    if ($json.ok -or $json.status) {
                        Write-Host "  Response: $bodyPreview" -ForegroundColor Gray
                    }
                } catch {
                    Write-Host "  Response (non-JSON): $bodyPreview" -ForegroundColor Gray
                }
                
                # Check for correlationId header
                $correlationId = $response.Headers['x-correlation-id'] -or $response.Headers['correlation-id']
                if ($correlationId) {
                    Write-Host "  CorrelationId: $correlationId" -ForegroundColor Gray
                }
                
                $script:Results += @{
                    Test = "$Source - $Name"
                    Status = "PASS"
                    StatusCode = 200
                    Attempt = $attempt
                }
                
                $success = $true
                
                if ($Source -eq "Railway") {
                    $script:RailwayDirectOk = $true
                } elseif ($Source -eq "Vercel") {
                    $script:VercelProxyOk = $true
                }
                
            } else {
                Write-Fail "$Name returned $($response.StatusCode) (attempt $attempt)"
                Write-Host "  StatusCode: $($response.StatusCode)" -ForegroundColor Yellow
                
                if ($attempt -eq $MaxRetries) {
                    $script:Results += @{
                        Test = "$Source - $Name"
                        Status = "FAIL"
                        StatusCode = $response.StatusCode
                        Attempt = $attempt
                    }
                }
            }
            
        } catch {
            $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "ERROR" }
            $errorMsg = $_.Exception.Message
            
            Write-Fail "$Name exception (attempt $attempt): $errorMsg"
            Write-Host "  Status: $statusCode" -ForegroundColor Yellow
            
            # Try to extract response body
            if ($_.Exception.Response) {
                try {
                    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                    $responseBody = $reader.ReadToEnd()
                    $bodyPreview = if ($responseBody.Length -gt 200) { $responseBody.Substring(0, 200) + "..." } else { $responseBody }
                    Write-Host "  Response: $bodyPreview" -ForegroundColor Yellow
                } catch {
                    Write-Host "  Response: (unable to read)" -ForegroundColor Yellow
                }
            }
            
            # Check for correlationId in error response
            if ($_.Exception.Response) {
                try {
                    $correlationId = $_.Exception.Response.Headers['x-correlation-id'] -or $_.Exception.Response.Headers['correlation-id']
                    if ($correlationId) {
                        Write-Host "  CorrelationId: $correlationId" -ForegroundColor Gray
                    }
                } catch {}
            }
            
            if ($attempt -eq $MaxRetries) {
                $script:Results += @{
                    Test = "$Source - $Name"
                    Status = "FAIL"
                    StatusCode = $statusCode
                    Error = $errorMsg
                    Attempt = $attempt
                }
            }
        }
    }
    
    if (-not $success) {
        Write-Host "  ? $Name failed after $MaxRetries attempts" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Routing QA - Diagnóstico de 502" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Railway Direct: $RailwayDirect"
Write-Host "Vercel Proxy: $VercelProxy"
Write-Host ""

# Phase 1: Railway Direct Tests
Write-Host "=== Phase 1: Railway Direct Routing ===" -ForegroundColor Cyan
Test-Endpoint -Name "/health" -Url "$RailwayDirect/health" -Source "Railway"
Test-Endpoint -Name "/ready" -Url "$RailwayDirect/ready" -Source "Railway"
Test-Endpoint -Name "/api/debug/ping" -Url "$RailwayDirect/api/debug/ping" -Source "Railway"
Test-Endpoint -Name "/api/debug/build-info" -Url "$RailwayDirect/api/debug/build-info" -Source "Railway"

# Phase 2: Vercel Proxy Tests
Write-Host ""
Write-Host "=== Phase 2: Vercel Proxy Routing ===" -ForegroundColor Cyan
Test-Endpoint -Name "/health" -Url "$VercelProxy/health" -Source "Vercel"
Test-Endpoint -Name "/ready" -Url "$VercelProxy/ready" -Source "Vercel"
Test-Endpoint -Name "/api/debug/ping" -Url "$VercelProxy/api/debug/ping" -Source "Vercel"
Test-Endpoint -Name "/api/debug/build-info" -Url "$VercelProxy/api/debug/build-info" -Source "Vercel"

# Phase 3: Diagnóstico Automático
Write-Host ""
Write-Host "=== Phase 3: Diagnóstico Automático ===" -ForegroundColor Cyan
Write-Host ""

if ($script:RailwayDirectOk -and -not $script:VercelProxyOk) {
    Write-Host "?? DIAGNÓSTICO: Problema es Vercel routing/rewrites" -ForegroundColor Yellow
    Write-Host "   - Railway direct funciona correctamente" -ForegroundColor Gray
    Write-Host "   - Vercel proxy no está proxyeando correctamente" -ForegroundColor Gray
    Write-Host "   - Verificar vercel.json rewrites" -ForegroundColor Gray
    Write-Host "   - Verificar que Vercel está apuntando al dominio correcto de Railway" -ForegroundColor Gray
} elseif (-not $script:RailwayDirectOk -and -not $script:VercelProxyOk) {
    Write-Host "?? DIAGNÓSTICO: Problema es Railway service / restart / entrypoint" -ForegroundColor Red
    Write-Host "   - Railway direct NO responde" -ForegroundColor Gray
    Write-Host "   - Vercel proxy NO responde (porque Railway está caído)" -ForegroundColor Gray
    Write-Host "   - Verificar Railway logs para 'LISTENING OK'" -ForegroundColor Gray
    Write-Host "   - Verificar que el proceso está corriendo en Railway" -ForegroundColor Gray
    Write-Host "   - Verificar que PORT está configurado correctamente" -ForegroundColor Gray
} elseif ($script:RailwayDirectOk -and $script:VercelProxyOk) {
    Write-Host "? DIAGNÓSTICO: Routing OK - Ambos funcionan" -ForegroundColor Green
    Write-Host "   - Railway direct funciona" -ForegroundColor Gray
    Write-Host "   - Vercel proxy funciona" -ForegroundColor Gray
    Write-Host "   - Si login falla, problema es en bootstrap/login (SAFE_BOOT / DB)" -ForegroundColor Gray
} else {
    Write-Host "??  DIAGNÓSTICO: Resultados mixtos" -ForegroundColor Yellow
    Write-Host "   - Revisar resultados individuales arriba" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "PASS: $script:PassCount | FAIL: $script:FailCount"
Write-Host ""

if ($script:FailCount -eq 0) {
    Write-Host "? All tests PASSED - Routing is working correctly" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify Railway logs show request logs for /health and /api/debug/ping" -ForegroundColor Gray
    Write-Host "  2. If routing works but login fails, check SAFE_BOOT and DB connection" -ForegroundColor Gray
    Write-Host "  3. Follow docs/SAFE_BOOT_GO_LIVE.md to activate full bootstrap if needed" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "? Some tests FAILED - Routing has issues" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check Railway logs for 'LISTENING OK' and request logs" -ForegroundColor Gray
    Write-Host "  2. Verify Railway Variables: NO PORT variable, SAFE_BOOT=true" -ForegroundColor Gray
    Write-Host "  3. Check vercel.json rewrites configuration" -ForegroundColor Gray
    Write-Host "  4. Check docs/RAILWAY_502_FIX_PLAYBOOK.md for detailed steps" -ForegroundColor Gray
    exit 1
}
