# Railway 502 Routing Fix - QA Script
# Valida que Railway responde 200 para endpoints críticos (directo y vía proxy)
# Run: backend\scripts\ps-railway-502-routing-fix.ps1

$ErrorActionPreference = "Stop"
$RailwayDirect = "https://ivan-reseller-web-production.up.railway.app"
$VercelProxy = "https://www.ivanreseller.com"

$script:PassCount = 0
$script:FailCount = 0
$script:Results = @()

function Write-Pass { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green; $script:PassCount++ }
function Write-Fail { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:FailCount++ }

Write-Host ""
Write-Host "=== Railway 502 Routing Fix - QA Validation ===" -ForegroundColor Cyan
Write-Host "Railway Direct: $RailwayDirect"
Write-Host "Vercel Proxy: $VercelProxy"
Write-Host ""

# Test function
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Source
    )
    
    Write-Host "[$Source] Testing $Name ..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        
        if ($response.StatusCode -eq 200) {
            Write-Pass "$Name returned 200 ($Source)"
            $bodyPreview = if ($response.Content.Length -gt 100) {
                $response.Content.Substring(0, 100) + "..."
            } else {
                $response.Content
            }
            Write-Host "  Body preview: $bodyPreview" -ForegroundColor Gray
            
            # Check for X-Health header (for /health)
            if ($response.Headers['X-Health']) {
                Write-Host "  X-Health header: $($response.Headers['X-Health'])" -ForegroundColor Gray
            }
            
            $script:Results += @{ Test = "$Name ($Source)"; Status = "PASS"; StatusCode = 200 }
            return $true
        } else {
            Write-Fail "$Name returned $($response.StatusCode) ($Source)"
            $script:Results += @{ Test = "$Name ($Source)"; Status = "FAIL"; StatusCode = $response.StatusCode }
            return $false
        }
    } catch {
        $statusCode = if ($_.Exception.Response) {
            $_.Exception.Response.StatusCode.value__
        } else {
            "ERROR"
        }
        Write-Fail "$Name exception: $_ ($Source)"
        Write-Host "  Status: $statusCode" -ForegroundColor Yellow
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                Write-Host "  Response: $responseBody" -ForegroundColor Yellow
            } catch {}
        }
        $script:Results += @{ Test = "$Name ($Source)"; Status = "FAIL"; StatusCode = $statusCode; Error = $_.Exception.Message }
        return $false
    }
}

# 1. Railway Direct - /health
Write-Host ""
Write-Host "=== Railway Direct Tests ===" -ForegroundColor Cyan
Test-Endpoint -Name "/health" -Url "$RailwayDirect/health" -Source "Railway"
Test-Endpoint -Name "/api/debug/ping" -Url "$RailwayDirect/api/debug/ping" -Source "Railway"

# 2. Vercel Proxy - /health
Write-Host ""
Write-Host "=== Vercel Proxy Tests ===" -ForegroundColor Cyan
Test-Endpoint -Name "/health" -Url "$VercelProxy/health" -Source "Vercel"
Test-Endpoint -Name "/api/debug/ping" -Url "$VercelProxy/api/debug/ping" -Source "Vercel"

# Summary
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "PASS: $script:PassCount | FAIL: $script:FailCount"
Write-Host ""

if ($script:FailCount -eq 0) {
    Write-Host "? All tests PASSED - Railway routing is working correctly" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify Railway logs show 'LISTENING OK' and request logs" -ForegroundColor Gray
    Write-Host "  2. If all endpoints work, set SAFE_BOOT=false to reactivate full bootstrap" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "? Some tests FAILED - Railway routing has issues" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check Railway logs for 'BOOT START' and 'LISTENING OK'" -ForegroundColor Gray
    Write-Host "  2. Verify Railway Variables: NO PORT variable, SAFE_BOOT=true" -ForegroundColor Gray
    Write-Host "  3. Verify Railway Settings: Type=Web Service, Public Networking=Enabled" -ForegroundColor Gray
    Write-Host "  4. Check docs/RAILWAY_502_FIX_PLAYBOOK.md for detailed steps" -ForegroundColor Gray
    exit 1
}
