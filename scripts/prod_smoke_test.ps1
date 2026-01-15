# ✅ GO-LIVE: Production Smoke Test Script (PowerShell)
# Valida que las rutas críticas de producción funcionen correctamente
# NO usa secrets - solo prueba endpoints públicos

$ErrorActionPreference = "Continue"
$script:HasErrors = $false

$PRODUCTION_DOMAIN = "www.ivanreseller.com"

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

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Gray
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

Write-Host "`n🔥 PRODUCTION SMOKE TEST" -ForegroundColor Magenta
Write-Host "=======================" -ForegroundColor Magenta
Write-Host "Domain: https://${PRODUCTION_DOMAIN}" -ForegroundColor Gray
Write-Host ""

# 1. Test /health
Write-Step "Testing /health endpoint"
try {
    $healthResponse = Invoke-WebRequest -Uri "https://${PRODUCTION_DOMAIN}/health" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($healthResponse.StatusCode -eq 200) {
        Write-Success "/health responded with 200"
        try {
            $healthData = $healthResponse.Content | ConvertFrom-Json
            Write-Info "  Status: $($healthData.status)"
        } catch {
            # Not JSON, that's OK
        }
    } else {
        Write-Error "/health returned status $($healthResponse.StatusCode) (expected 200)"
    }
} catch {
    Write-Error "/health failed: $($_.Exception.Message)"
}

# 2. Test /api/aliexpress/token-status
Write-Step "Testing /api/aliexpress/token-status endpoint"
try {
    $tokenStatusResponse = Invoke-WebRequest -Uri "https://${PRODUCTION_DOMAIN}/api/aliexpress/token-status" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($tokenStatusResponse.StatusCode -eq 200) {
        Write-Success "/api/aliexpress/token-status responded with 200"
    } elseif ($tokenStatusResponse.StatusCode -eq 401 -or $tokenStatusResponse.StatusCode -eq 403) {
        Write-Success "/api/aliexpress/token-status responded with $($tokenStatusResponse.StatusCode) (expected auth required)"
    } else {
        Write-Error "/api/aliexpress/token-status returned status $($tokenStatusResponse.StatusCode) (expected 200/401/403, NOT 502)"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 502) {
        Write-Error "/api/aliexpress/token-status returned 502 (backend not reachable - rewrite may not be working)"
    } elseif ($statusCode -eq 401 -or $statusCode -eq 403) {
        Write-Success "/api/aliexpress/token-status responded with $statusCode (expected auth required)"
    } else {
        Write-Error "/api/aliexpress/token-status failed: $($_.Exception.Message)"
    }
}

# 3. Test /api/aliexpress/auth (should redirect 302 or 301)
Write-Step "Testing /api/aliexpress/auth endpoint (should redirect)"
try {
    $authResponse = Invoke-WebRequest -Uri "https://${PRODUCTION_DOMAIN}/api/aliexpress/auth" -Method GET -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue
    # If we get here, no redirect happened
    Write-Error "/api/aliexpress/auth did not redirect (expected 302/301)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 302 -or $statusCode -eq 301 -or $statusCode -eq 307 -or $statusCode -eq 308) {
        Write-Success "/api/aliexpress/auth redirects correctly ($statusCode)"
        try {
            $location = $_.Exception.Response.Headers.Location
            if ($location) {
                Write-Info "  Redirects to: $location"
            }
        } catch {
            # Location header not available
        }
    } elseif ($statusCode -eq 502) {
        Write-Error "/api/aliexpress/auth returned 502 (backend not reachable - rewrite not working)"
    } elseif ($statusCode -eq 404) {
        Write-Error "/api/aliexpress/auth returned 404 (route not found or rewrite not working)"
    } else {
        Write-Error "/api/aliexpress/auth returned status $statusCode (expected 302/301 redirect)"
    }
}

# 4. Test /api/aliexpress/test-link
Write-Step "Testing /api/aliexpress/test-link endpoint"
try {
    $testLinkUrl = "https://${PRODUCTION_DOMAIN}/api/aliexpress/test-link?productId=1005001234567890"
    $testLinkResponse = Invoke-WebRequest -Uri $testLinkUrl -Method GET -UseBasicParsing -ErrorAction Stop
    if ($testLinkResponse.StatusCode -eq 200) {
        Write-Success "/api/aliexpress/test-link responded with 200"
        $body = $testLinkResponse.Content
        if ($body -match "env missing|ALIEXPRESS_APP_KEY no configurado") {
            Write-Error "/api/aliexpress/test-link body contains 'env missing' or 'APP_KEY no configurado'"
            Write-Info "  Body preview: $($body.Substring(0, [Math]::Min(200, $body.Length)))"
        } else {
            Write-Info "  Response OK (not 'env missing')"
        }
    } else {
        Write-Warning "/api/aliexpress/test-link returned status $($testLinkResponse.StatusCode)"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 502) {
        Write-Error "/api/aliexpress/test-link returned 502 (backend not reachable)"
    } elseif ($statusCode -eq 404) {
        Write-Error "/api/aliexpress/test-link returned 404 (route not found)"
    } else {
        Write-Warning "/api/aliexpress/test-link returned status $statusCode"
        try {
            $body = $_.Exception.Response | Get-Member -MemberType Method | Where-Object { $_.Name -eq 'GetResponseStream' }
            # Try to get body if available
        } catch {
            # Can't get body
        }
    }
}

# Summary
Write-Host "`n📊 SMOKE TEST SUMMARY" -ForegroundColor Magenta
Write-Host "====================" -ForegroundColor Magenta

if ($script:HasErrors) {
    Write-Host ""
    Write-Error "❌ FAIL - Some tests failed. Production wiring may not be correct."
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  - 502 errors: Backend not reachable, check vercel.json rewrites" -ForegroundColor Yellow
    Write-Host "  - 404 errors: Routes not found, check rewrite patterns" -ForegroundColor Yellow
    Write-Host "  - 'env missing' errors: Backend responding but config missing (different issue)" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host ""
    Write-Success "✅ PASS - All production endpoints responded correctly!"
    Write-Host ""
    Write-Host "Production wiring is correct. ✅" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test URLs:" -ForegroundColor Cyan
    $baseUrl = "https://$PRODUCTION_DOMAIN"
    Write-Host "  - Health: $baseUrl/health"
    Write-Host "  - Token Status: $baseUrl/api/aliexpress/token-status"
    Write-Host "  - OAuth Auth: $baseUrl/api/aliexpress/auth"
    $testLinkParam = "productId=1005001234567890"
    Write-Host "  - Test Link: $baseUrl/api/aliexpress/test-link?$testLinkParam"
    exit 0
}

