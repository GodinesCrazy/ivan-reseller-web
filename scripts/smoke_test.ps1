# ✅ GO-LIVE: Smoke Test Script for Windows (PowerShell)
# Valida que los endpoints críticos del backend respondan correctamente

param(
    [Parameter(Mandatory=$true)]
    [string]$BackendUrl,
    
    [string]$FrontendUrl = ""
)

$ErrorActionPreference = "Stop"
$script:HasErrors = $false

function Write-Step {
    param([string]$Message)
    Write-Host "`n▶ $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
    $script:HasErrors = $true
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Gray
}

Write-Host "`n🔥 SMOKE TEST - Backend Endpoints" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta
Write-Host "Backend URL: $BackendUrl" -ForegroundColor Gray
if ($FrontendUrl) {
    Write-Host "Frontend URL: $FrontendUrl" -ForegroundColor Gray
}
Write-Host ""

# Normalizar URL (eliminar trailing slash)
$BackendUrl = $BackendUrl.TrimEnd('/')

# 1. Test /health
Write-Step "Testing /health endpoint"
try {
    $healthResponse = Invoke-WebRequest -Uri "$BackendUrl/health" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($healthResponse.StatusCode -eq 200) {
        $healthData = $healthResponse.Content | ConvertFrom-Json
        Write-Success "/health responded with 200"
        Write-Info "  Status: $($healthData.status)"
        Write-Info "  Service: $($healthData.service)"
        Write-Info "  Uptime: $([math]::Round($healthData.uptime, 2))s"
    } else {
        Write-Error "/health returned status $($healthResponse.StatusCode)"
    }
} catch {
    Write-Error "/health failed: $($_.Exception.Message)"
}

# 2. Test /ready
Write-Step "Testing /ready endpoint"
try {
    $readyResponse = Invoke-WebRequest -Uri "$BackendUrl/ready" -Method GET -UseBasicParsing -ErrorAction Stop
    $readyData = $readyResponse.Content | ConvertFrom-Json
    if ($readyResponse.StatusCode -eq 200 -and $readyData.ready) {
        Write-Success "/ready responded with 200 (ready: true)"
    } elseif ($readyResponse.StatusCode -eq 503) {
        Write-Warning "/ready returned 503 (not ready)"
        Write-Info "  Checks: $($readyData.checks | ConvertTo-Json -Compress)"
    } else {
        Write-Error "/ready returned unexpected status $($readyResponse.StatusCode)"
    }
} catch {
    Write-Error "/ready failed: $($_.Exception.Message)"
}

# 3. Test /version
Write-Step "Testing /version endpoint"
try {
    $versionResponse = Invoke-WebRequest -Uri "$BackendUrl/version" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($versionResponse.StatusCode -eq 200) {
        $versionData = $versionResponse.Content | ConvertFrom-Json
        Write-Success "/version responded with 200"
        Write-Info "  Environment: $($versionData.env)"
        Write-Info "  Service: $($versionData.serviceName)"
        Write-Info "  Node: $($versionData.node)"
    } else {
        Write-Error "/version returned status $($versionResponse.StatusCode)"
    }
} catch {
    Write-Error "/version failed: $($_.Exception.Message)"
}

# 4. Test /config
Write-Step "Testing /config endpoint"
try {
    $configResponse = Invoke-WebRequest -Uri "$BackendUrl/config" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($configResponse.StatusCode -eq 200) {
        $configData = $configResponse.Content | ConvertFrom-Json
        Write-Success "/config responded with 200"
        Write-Info "  CORS Origins: $($configData.corsOriginCount)"
        Write-Info "  Database: $($configData.hasDbUrl)"
        Write-Info "  Redis: $($configData.hasRedisUrl)"
        Write-Info "  API URL Host: $($configData.apiUrl)"
    } else {
        Write-Error "/config returned status $($configResponse.StatusCode)"
    }
} catch {
    Write-Error "/config failed: $($_.Exception.Message)"
}

# 5. Test CORS Preflight (OPTIONS)
Write-Step "Testing CORS preflight (OPTIONS)"
try {
    $corsResponse = Invoke-WebRequest -Uri "$BackendUrl/health" -Method OPTIONS -UseBasicParsing -Headers @{
        "Origin" = if ($FrontendUrl) { $FrontendUrl } else { "https://test.example.com" }
        "Access-Control-Request-Method" = "GET"
    } -ErrorAction Stop
    if ($corsResponse.StatusCode -eq 204 -or $corsResponse.StatusCode -eq 200) {
        Write-Success "CORS preflight responded correctly ($($corsResponse.StatusCode))"
        $corsHeaders = $corsResponse.Headers
        if ($corsHeaders['Access-Control-Allow-Origin']) {
            Write-Info "  Access-Control-Allow-Origin: $($corsHeaders['Access-Control-Allow-Origin'])"
        }
        if ($corsHeaders['Access-Control-Allow-Credentials']) {
            Write-Info "  Access-Control-Allow-Credentials: $($corsHeaders['Access-Control-Allow-Credentials'])"
        }
    } else {
        Write-Warning "CORS preflight returned status $($corsResponse.StatusCode)"
    }
} catch {
    Write-Warning "CORS preflight test failed (may be expected if Origin not in allowlist): $($_.Exception.Message)"
}

# 6. Test Frontend (if provided)
if ($FrontendUrl) {
    Write-Step "Testing Frontend URL"
    try {
        $frontendResponse = Invoke-WebRequest -Uri $FrontendUrl -Method GET -UseBasicParsing -ErrorAction Stop
        if ($frontendResponse.StatusCode -eq 200) {
            Write-Success "Frontend responded with 200"
        } else {
            Write-Warning "Frontend returned status $($frontendResponse.StatusCode)"
        }
    } catch {
        Write-Warning "Frontend test failed: $($_.Exception.Message)"
    }
}

# Summary
Write-Host "`n📊 SMOKE TEST SUMMARY" -ForegroundColor Magenta
Write-Host "====================" -ForegroundColor Magenta

if ($script:HasErrors) {
    Write-Error "Smoke test completed with errors. Backend may not be ready for production."
    exit 1
} else {
    Write-Success "All critical endpoints responded correctly!"
    Write-Host "`nBackend is ready for production. ✅" -ForegroundColor Green
    exit 0
}

