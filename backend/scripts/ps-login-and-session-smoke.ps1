# Production Smoke Test: Login + Session Validation (PowerShell)
# NO usa curl.exe. Usa Invoke-WebRequest/Invoke-RestMethod con -SessionVariable.
# Run: backend\scripts\ps-login-and-session-smoke.ps1

$ErrorActionPreference = "Stop"
$API = "https://www.ivanreseller.com"
$Username = if ($env:TEST_USERNAME) { $env:TEST_USERNAME } else { "admin" }
$Password = if ($env:TEST_PASSWORD) { $env:TEST_PASSWORD } else { "admin123" }

$script:PassCount = 0
$script:FailCount = 0
$script:Results = @()

function Write-Pass { param($msg) Write-Host "[PASS] $msg" -ForegroundColor Green; $script:PassCount++ }
function Write-Fail { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:FailCount++ }

Write-Host ""
Write-Host "=== Login + Session Smoke Test (PowerShell) ===" -ForegroundColor Cyan
Write-Host "API: $API | User: $Username"
Write-Host ""

# 1. Login
Write-Host "[1] Login POST /api/auth/login ..." -ForegroundColor Yellow
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json -Compress
Write-Host "  Request body (sanitized): $($loginBody -replace '"password":"[^"]+"', '"password":"***"')" -ForegroundColor Gray

try {
    $login = Invoke-WebRequest -Uri "$API/api/auth/login" -Method Post `
        -Body $loginBody -ContentType "application/json; charset=utf-8" `
        -SessionVariable session -UseBasicParsing -ErrorAction Stop
    
    if ($login.StatusCode -ne 200) {
        Write-Fail "Login returned status $($login.StatusCode)"
        Write-Host "  Response headers:" -ForegroundColor Yellow
        $login.Headers.GetEnumerator() | ForEach-Object { Write-Host "    $($_.Key): $($_.Value)" -ForegroundColor Gray }
        Write-Host "  Response body: $($login.Content)" -ForegroundColor Yellow
        exit 1
    }
    
    $loginJson = $login.Content | ConvertFrom-Json
    if (-not $loginJson.success) {
        Write-Fail "Login success=false"
        Write-Host "  Response: $($login.Content)" -ForegroundColor Yellow
        if ($loginJson.correlationId) { Write-Host "  CorrelationId: $($loginJson.correlationId)" -ForegroundColor Gray }
        if ($loginJson.errorId) { Write-Host "  ErrorId: $($loginJson.errorId)" -ForegroundColor Gray }
        exit 1
    }
    
    Write-Pass "Login success"
    if ($loginJson.correlationId) { Write-Host "  CorrelationId: $($loginJson.correlationId)" -ForegroundColor Gray }
    $script:Results += @{ Test = "Login"; Status = "PASS"; CorrelationId = $loginJson.correlationId }
} catch {
    Write-Fail "Login exception: $_"
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  Status: $statusCode" -ForegroundColor Yellow
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "  Response: $responseBody" -ForegroundColor Yellow
            $errJson = $responseBody | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($errJson.correlationId) { Write-Host "  CorrelationId: $($errJson.correlationId)" -ForegroundColor Gray }
            if ($errJson.errorId) { Write-Host "  ErrorId: $($errJson.errorId)" -ForegroundColor Gray }
        } catch {}
    }
    exit 1
}

# 2. Auth-status
Write-Host ""
Write-Host "[2] GET /api/auth-status ..." -ForegroundColor Yellow
try {
    $as = Invoke-WebRequest -Uri "$API/api/auth-status" -Method Get -WebSession $session -UseBasicParsing -ErrorAction Stop
    if ($as.StatusCode -eq 200) {
        Write-Pass "Auth-status returned 200"
        $script:Results += @{ Test = "Auth-status"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Auth-status returned $($as.StatusCode)"
        $script:Results += @{ Test = "Auth-status"; Status = "FAIL"; StatusCode = $as.StatusCode }
    }
} catch {
    Write-Fail "Auth-status exception: $_"
    $script:Results += @{ Test = "Auth-status"; Status = "FAIL"; Error = $_.Exception.Message }
}

# 3. Products
Write-Host ""
Write-Host "[3] GET /api/products ..." -ForegroundColor Yellow
try {
    $pr = Invoke-WebRequest -Uri "$API/api/products" -Method Get -WebSession $session -UseBasicParsing -ErrorAction Stop
    if ($pr.StatusCode -eq 200) {
        Write-Pass "Products returned 200"
        $script:Results += @{ Test = "Products"; Status = "PASS"; StatusCode = 200 }
    } else {
        Write-Fail "Products returned $($pr.StatusCode)"
        $script:Results += @{ Test = "Products"; Status = "FAIL"; StatusCode = $pr.StatusCode }
    }
} catch {
    Write-Fail "Products exception: $_"
    $script:Results += @{ Test = "Products"; Status = "FAIL"; Error = $_.Exception.Message }
}

# 4. Auth URL
Write-Host ""
Write-Host "[4] GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production ..." -ForegroundColor Yellow
try {
    $authUrlReq = Invoke-WebRequest -Uri "$API/api/marketplace/auth-url/aliexpress-dropshipping?environment=production" `
        -Method Get -WebSession $session -UseBasicParsing -ErrorAction Stop
    if ($authUrlReq.StatusCode -eq 200) {
        $authUrlJson = $authUrlReq.Content | ConvertFrom-Json
        if ($authUrlJson.success -and $authUrlJson.data.authUrl) {
            Write-Pass "Auth URL returned 200 with authUrl"
            $script:Results += @{ Test = "Auth-URL"; Status = "PASS"; StatusCode = 200 }
        } else {
            Write-Fail "Auth URL success=false or missing authUrl"
            $script:Results += @{ Test = "Auth-URL"; Status = "FAIL"; Reason = "No authUrl in response" }
        }
    } else {
        Write-Fail "Auth URL returned $($authUrlReq.StatusCode)"
        $script:Results += @{ Test = "Auth-URL"; Status = "FAIL"; StatusCode = $authUrlReq.StatusCode }
    }
} catch {
    Write-Fail "Auth URL exception: $_"
    $script:Results += @{ Test = "Auth-URL"; Status = "FAIL"; Error = $_.Exception.Message }
}

# Summary
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "PASS: $script:PassCount | FAIL: $script:FailCount"
Write-Host ""

if ($script:FailCount -eq 0) {
    Write-Host "All tests PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests FAILED" -ForegroundColor Red
    exit 1
}
