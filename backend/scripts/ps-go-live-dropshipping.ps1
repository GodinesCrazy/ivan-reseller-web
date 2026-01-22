# Go-Live Dropshipping Production QA Script
# Valida que el sistema dropshipping está listo para producción.
# NO usa curl.exe. Usa Invoke-WebRequest con -SessionVariable.
# Run: backend\scripts\ps-go-live-dropshipping.ps1

$ErrorActionPreference = "Stop"
$RailwayDirect = "https://ivan-reseller-web-production.up.railway.app"
$VercelProxy = if ($env:API_URL) { $env:API_URL } else { "https://www.ivanreseller.com" }
$Username = if ($env:TEST_USERNAME) { $env:TEST_USERNAME } else { "admin" }
$Password = if ($env:TEST_PASSWORD) { $env:TEST_PASSWORD } else { "admin123" }

$script:PassCount = 0
$script:FailCount = 0
$script:Results = @()

function Write-Pass { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green; $script:PassCount++ }
function Write-Fail { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:FailCount++ }

Write-Host ""
Write-Host "=== Go-Live Dropshipping Production QA ===" -ForegroundColor Cyan
Write-Host "Railway Direct: $RailwayDirect"
Write-Host "Vercel Proxy: $VercelProxy"
Write-Host "User: $Username"
Write-Host ""

# Phase 0: Validate Railway Direct Routing
Write-Host "=== Phase 0: Railway Direct Routing Validation ===" -ForegroundColor Cyan
Write-Host ""

# 0.1 Railway Direct - /health
Write-Host "[0.1] Railway Direct GET /health ..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "$RailwayDirect/health" -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($health.StatusCode -eq 200) {
        Write-Pass "Railway /health returned 200"
        $healthJson = $health.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($healthJson) {
            Write-Host "  safeBoot: $($healthJson.safeBoot)" -ForegroundColor Gray
            Write-Host "  port: $($healthJson.port)" -ForegroundColor Gray
            Write-Host "  pid: $($healthJson.pid)" -ForegroundColor Gray
        }
        $script:Results += @{ Test = "Railway /health"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Railway /health returned $($health.StatusCode)"
        $script:Results += @{ Test = "Railway /health"; Status = "FAIL"; StatusCode = $health.StatusCode }
        Write-Host "  ? Railway direct routing FAILED - cannot proceed" -ForegroundColor Red
        exit 1
    }
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "ERROR" }
    Write-Fail "Railway /health exception: $_"
    Write-Host "  Status: $statusCode" -ForegroundColor Yellow
    Write-Host "  ? Railway direct routing FAILED - cannot proceed" -ForegroundColor Red
    exit 1
}

# 0.2 Railway Direct - /api/debug/ping
Write-Host ""
Write-Host "[0.2] Railway Direct GET /api/debug/ping ..." -ForegroundColor Yellow
try {
    $ping = Invoke-WebRequest -Uri "$RailwayDirect/api/debug/ping" -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($ping.StatusCode -eq 200) {
        Write-Pass "Railway /api/debug/ping returned 200"
        $script:Results += @{ Test = "Railway /api/debug/ping"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Railway /api/debug/ping returned $($ping.StatusCode)"
        $script:Results += @{ Test = "Railway /api/debug/ping"; Status = "FAIL"; StatusCode = $ping.StatusCode }
        Write-Host "  ? Railway direct routing FAILED - cannot proceed" -ForegroundColor Red
        exit 1
    }
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "ERROR" }
    Write-Fail "Railway /api/debug/ping exception: $_"
    Write-Host "  Status: $statusCode" -ForegroundColor Yellow
    Write-Host "  ? Railway direct routing FAILED - cannot proceed" -ForegroundColor Red
    exit 1
}

# Phase 1: Validate Vercel Proxy Routing
Write-Host ""
Write-Host "=== Phase 1: Vercel Proxy Routing Validation ===" -ForegroundColor Cyan
Write-Host ""

# 1.1 Vercel Proxy - /health
Write-Host "[1.1] Vercel Proxy GET /health ..." -ForegroundColor Yellow
try {
    $healthVercel = Invoke-WebRequest -Uri "$VercelProxy/health" -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($healthVercel.StatusCode -eq 200) {
        Write-Pass "Vercel /health returned 200"
        $script:Results += @{ Test = "Vercel /health"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Vercel /health returned $($healthVercel.StatusCode)"
        $script:Results += @{ Test = "Vercel /health"; Status = "FAIL"; StatusCode = $healthVercel.StatusCode }
        Write-Host "  ??  Vercel proxy routing issue - but Railway direct works" -ForegroundColor Yellow
    }
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "ERROR" }
    Write-Fail "Vercel /health exception: $_"
    Write-Host "  Status: $statusCode" -ForegroundColor Yellow
    Write-Host "  ??  Vercel proxy routing issue - but Railway direct works" -ForegroundColor Yellow
}

# 1.2 Vercel Proxy - /api/debug/ping
Write-Host ""
Write-Host "[1.2] Vercel Proxy GET /api/debug/ping ..." -ForegroundColor Yellow
try {
    $pingVercel = Invoke-WebRequest -Uri "$VercelProxy/api/debug/ping" -Method Get -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($pingVercel.StatusCode -eq 200) {
        Write-Pass "Vercel /api/debug/ping returned 200"
        $script:Results += @{ Test = "Vercel /api/debug/ping"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Vercel /api/debug/ping returned $($pingVercel.StatusCode)"
        $script:Results += @{ Test = "Vercel /api/debug/ping"; Status = "FAIL"; StatusCode = $pingVercel.StatusCode }
        Write-Host "  ??  Vercel proxy routing issue - but Railway direct works" -ForegroundColor Yellow
    }
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "ERROR" }
    Write-Fail "Vercel /api/debug/ping exception: $_"
    Write-Host "  Status: $statusCode" -ForegroundColor Yellow
    Write-Host "  ??  Vercel proxy routing issue - but Railway direct works" -ForegroundColor Yellow
}

# Phase 2: Login with Retries
Write-Host ""
Write-Host "=== Phase 2: Login and Session Validation ===" -ForegroundColor Cyan
Write-Host ""

# 2. Login with retries
Write-Host "[2] Login POST /api/auth/login (with retries) ..." -ForegroundColor Yellow
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json -Compress
Write-Host "  Request body (sanitized): $($loginBody -replace '"password":"[^"]+"', '"password":"***"')" -ForegroundColor Gray

$maxRetries = 3
$retryDelays = @(500, 1000, 2000) # ms
$loginSuccess = $false

for ($attempt = 0; $attempt -lt $maxRetries; $attempt++) {
    if ($attempt -gt 0) {
        $delay = $retryDelays[$attempt - 1]
        Write-Host "  Retry attempt $attempt/$maxRetries after ${delay}ms delay..." -ForegroundColor Yellow
        Start-Sleep -Milliseconds $delay
    }
    
    try {
        $login = Invoke-WebRequest -Uri "$VercelProxy/api/auth/login" -Method Post `
            -Body $loginBody -ContentType "application/json; charset=utf-8" `
            -SessionVariable session -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        
        if ($login.StatusCode -eq 200) {
            $loginJson = $login.Content | ConvertFrom-Json
            if ($loginJson.success) {
                Write-Pass "Login success (attempt $($attempt + 1))"
                if ($loginJson.correlationId) { Write-Host "  CorrelationId: $($loginJson.correlationId)" -ForegroundColor Gray }
                $script:Results += @{ Test = "Login"; Status = "PASS"; CorrelationId = $loginJson.correlationId }
                $loginSuccess = $true
                break
            } else {
                Write-Fail "Login success=false (attempt $($attempt + 1))"
                Write-Host "  Response: $($login.Content)" -ForegroundColor Yellow
                $errJson = $login.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($errJson.correlationId) { Write-Host "  CorrelationId: $($errJson.correlationId)" -ForegroundColor Gray }
                if ($errJson.errorId) { Write-Host "  ErrorId: $($errJson.errorId)" -ForegroundColor Gray }
                # Don't retry on 200 with success=false (invalid credentials)
                break
            }
        } else {
            Write-Fail "Login returned status $($login.StatusCode) (attempt $($attempt + 1))"
            Write-Host "  Response: $($login.Content)" -ForegroundColor Yellow
            if ($attempt -lt $maxRetries - 1) {
                continue # Retry
            } else {
                exit 1
            }
        }
    } catch {
        $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "ERROR" }
        Write-Fail "Login exception (attempt $($attempt + 1)): $_"
        Write-Host "  Status: $statusCode" -ForegroundColor Yellow
        
        # Extract response details
        $responseBody = ""
        $xRequestId = ""
        $correlationId = ""
        $errorId = ""
        
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                Write-Host "  Response body: $responseBody" -ForegroundColor Yellow
                
                $errJson = $responseBody | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($errJson) {
                    if ($errJson.correlationId) { 
                        $correlationId = $errJson.correlationId
                        Write-Host "  CorrelationId: $correlationId" -ForegroundColor Gray
                    }
                    if ($errJson.errorId) { 
                        $errorId = $errJson.errorId
                        Write-Host "  ErrorId: $errorId" -ForegroundColor Gray
                    }
                }
            } catch {}
            
            # Try to get x-request-id from headers
            try {
                $xRequestId = $_.Exception.Response.Headers['x-request-id'] -or $_.Exception.Response.Headers['x-vercel-id']
                if ($xRequestId) {
                    Write-Host "  x-request-id: $xRequestId" -ForegroundColor Gray
                }
            } catch {}
        }
        
        if ($attempt -lt $maxRetries - 1) {
            continue # Retry
        } else {
            Write-Host "  ? Login failed after $maxRetries attempts" -ForegroundColor Red
            exit 1
        }
    }
}

if (-not $loginSuccess) {
    Write-Host "  ? Login failed - cannot proceed" -ForegroundColor Red
    exit 1
}

# 3. Auth-status
Write-Host ""
Write-Host "[3] GET /api/auth-status ..." -ForegroundColor Yellow
try {
    $as = Invoke-WebRequest -Uri "$VercelProxy/api/auth-status" -Method Get -WebSession $session -UseBasicParsing -ErrorAction Stop
    if ($as.StatusCode -eq 200) {
        Write-Pass "Auth-status returned 200"
        $script:Results += @{ Test = "Auth-status"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Auth-status returned $($as.StatusCode)"
        $script:Results += @{ Test = "Auth-status"; Status = "FAIL"; StatusCode = $as.StatusCode }
        exit 1
    }
} catch {
    Write-Fail "Auth-status exception: $_"
    $script:Results += @{ Test = "Auth-status"; Status = "FAIL"; Error = $_.Exception.Message }
    exit 1
}

# 4. Products
Write-Host ""
Write-Host "[4] GET /api/products ..." -ForegroundColor Yellow
try {
    $pr = Invoke-WebRequest -Uri "$VercelProxy/api/products" -Method Get -WebSession $session -UseBasicParsing -ErrorAction Stop
    if ($pr.StatusCode -eq 200) {
        Write-Pass "Products returned 200"
        $script:Results += @{ Test = "Products"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Products returned $($pr.StatusCode)"
        $script:Results += @{ Test = "Products"; Status = "FAIL"; StatusCode = $pr.StatusCode }
        exit 1
    }
} catch {
    Write-Fail "Products exception: $_"
    $script:Results += @{ Test = "Products"; Status = "FAIL"; Error = $_.Exception.Message }
    exit 1
}

# 5. Auth URL
Write-Host ""
Write-Host "[5] GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production ..." -ForegroundColor Yellow
try {
    $authUrlReq = Invoke-WebRequest -Uri "$VercelProxy/api/marketplace/auth-url/aliexpress-dropshipping?environment=production" `
        -Method Get -WebSession $session -UseBasicParsing -ErrorAction Stop
    if ($authUrlReq.StatusCode -eq 200) {
        $authUrlJson = $authUrlReq.Content | ConvertFrom-Json
        if ($authUrlJson.success -and $authUrlJson.data.authUrl) {
            Write-Pass "Auth URL returned 200 with authUrl"
            $script:Results += @{ Test = "Auth-URL"; Status = "PASS"; StatusCode = 200 }
        } else {
            Write-Fail "Auth URL success=false or missing authUrl"
            $script:Results += @{ Test = "Auth-URL"; Status = "FAIL"; Reason = "No authUrl in response" }
            exit 1
        }
    } else {
        Write-Fail "Auth URL returned $($authUrlReq.StatusCode)"
        $script:Results += @{ Test = "Auth-URL"; Status = "FAIL"; StatusCode = $authUrlReq.StatusCode }
        exit 1
    }
} catch {
    Write-Fail "Auth URL exception: $_"
    $script:Results += @{ Test = "Auth-URL"; Status = "FAIL"; Error = $_.Exception.Message }
    exit 1
}

# 6. Debug credentials
Write-Host ""
Write-Host "[6] GET /api/debug/aliexpress-dropshipping-credentials ..." -ForegroundColor Yellow
try {
    $debug = Invoke-WebRequest -Uri "$VercelProxy/api/debug/aliexpress-dropshipping-credentials" `
        -Method Get -WebSession $session -UseBasicParsing -ErrorAction Stop
    if ($debug.StatusCode -eq 200) {
        $dj = $debug.Content | ConvertFrom-Json
        if ($dj.ok) {
            Write-Pass "Debug credentials returned 200"
            $s = $dj.summary
            Write-Host "  Production token: $(if ($s.hasProductionToken) { 'yes' } else { 'no' })" -ForegroundColor Gray
            Write-Host "  Sandbox token: $(if ($s.hasSandboxToken) { 'yes' } else { 'no' })" -ForegroundColor Gray
            Write-Host "  Any configured: $(if ($s.anyConfigured) { 'yes' } else { 'no' })" -ForegroundColor Gray
            $script:Results += @{ Test = "Debug-Credentials"; Status = "PASS"; StatusCode = 200 }
        } else {
            Write-Fail "Debug credentials ok=false"
            $script:Results += @{ Test = "Debug-Credentials"; Status = "FAIL"; Reason = "ok=false" }
            exit 1
        }
    } else {
        Write-Fail "Debug credentials returned $($debug.StatusCode)"
        $script:Results += @{ Test = "Debug-Credentials"; Status = "FAIL"; StatusCode = $debug.StatusCode }
        exit 1
    }
} catch {
    Write-Fail "Debug credentials exception: $_"
    $script:Results += @{ Test = "Debug-Credentials"; Status = "FAIL"; Error = $_.Exception.Message }
    exit 1
}

# Summary
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "PASS: $script:PassCount | FAIL: $script:FailCount"
Write-Host ""

if ($script:FailCount -eq 0) {
    Write-Host "? All tests PASSED - System ready for go-live" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify Railway logs show request logs for /health and /api/debug/ping" -ForegroundColor Gray
    Write-Host "  2. If all endpoints work, follow docs/SAFE_BOOT_GO_LIVE.md to set SAFE_BOOT=false" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "? Some tests FAILED - System NOT ready for go-live" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check Railway logs for 'LISTENING OK' and request logs" -ForegroundColor Gray
    Write-Host "  2. Verify Railway Variables: NO PORT variable, SAFE_BOOT=true" -ForegroundColor Gray
    Write-Host "  3. Check docs/RAILWAY_502_FIX_PLAYBOOK.md for detailed steps" -ForegroundColor Gray
    exit 1
}
