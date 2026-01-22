# AliExpress Dropshipping OAuth E2E - Official PowerShell Script
# Uses Invoke-WebRequest -WebSession (no curl.exe). Run from repo root or backend.
# See docs/ALIEXPRESS_OAUTH_E2E_PROD.md for full OAuth flow.

$ErrorActionPreference = "Stop"
$BaseUrl = if ($env:API_URL) { $env:API_URL } else { "https://www.ivanreseller.com" }
$Username = if ($env:TEST_USERNAME) { $env:TEST_USERNAME } else { "admin" }
$Password = if ($env:TEST_PASSWORD) { $env:TEST_PASSWORD } else { "admin123" }

Write-Host ""
Write-Host "=== AliExpress Dropshipping OAuth E2E (PowerShell) ===" -ForegroundColor Cyan
Write-Host "Base: $BaseUrl | User: $Username"
Write-Host ""

# 1. Login (SessionVariable creates $session for subsequent -WebSession use)
Write-Host "[1] Login POST /api/auth/login ..." -ForegroundColor Yellow
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json -Compress
Write-Host "  Request body (sanitized): $($loginBody -replace '"password":"[^"]+"', '"password":"***"')" -ForegroundColor Gray
Write-Host "  Content-Type: application/json; charset=utf-8" -ForegroundColor Gray

try {
    $login = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post `
        -Body $loginBody -ContentType "application/json; charset=utf-8" `
        -SessionVariable session -UseBasicParsing -ErrorAction Stop
    
    if ($login.StatusCode -ne 200) {
        Write-Host "  FAIL Login: Status $($login.StatusCode)" -ForegroundColor Red
        Write-Host "  Response: $($login.Content)" -ForegroundColor Yellow
        exit 1
    }
    
    $loginJson = $login.Content | ConvertFrom-Json
    if (-not $loginJson.success) {
        Write-Host "  FAIL Login: success=false" -ForegroundColor Red
        Write-Host "  Response: $($login.Content)" -ForegroundColor Yellow
        if ($loginJson.correlationId) { Write-Host "  CorrelationId: $($loginJson.correlationId)" -ForegroundColor Gray }
        if ($loginJson.errorId) { Write-Host "  ErrorId: $($loginJson.errorId)" -ForegroundColor Gray }
        exit 1
    }
    
    Write-Host "  OK Login success" -ForegroundColor Green
    if ($loginJson.correlationId) { Write-Host "  CorrelationId: $($loginJson.correlationId)" -ForegroundColor Gray }
} catch {
    Write-Host "  FAIL Login exception: $_" -ForegroundColor Red
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

# 2. Auth-status & Products
Write-Host ""
Write-Host "[2] GET /api/auth-status ..." -ForegroundColor Yellow
try {
    $as = Invoke-WebRequest -Uri "$BaseUrl/api/auth-status" -Method Get -WebSession $session -UseBasicParsing
    Write-Host "  Status: $($as.StatusCode) OK" -ForegroundColor Green
} catch { Write-Host "  FAIL: $_" -ForegroundColor Red }

Write-Host ""
Write-Host "[3] GET /api/products ..." -ForegroundColor Yellow
try {
    $pr = Invoke-WebRequest -Uri "$BaseUrl/api/products" -Method Get -WebSession $session -UseBasicParsing
    Write-Host "  Status: $($pr.StatusCode) OK" -ForegroundColor Green
} catch { Write-Host "  FAIL: $_" -ForegroundColor Red }

# 3. Auth URL
Write-Host ""
Write-Host "[4] GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production ..." -ForegroundColor Yellow
try {
    $authUrlReq = Invoke-WebRequest -Uri "$BaseUrl/api/marketplace/auth-url/aliexpress-dropshipping?environment=production" `
        -Method Get -WebSession $session -UseBasicParsing
    $authUrlJson = $authUrlReq.Content | ConvertFrom-Json
    if (-not $authUrlJson.success -or -not $authUrlJson.data.authUrl) {
        throw "No authUrl in response"
    }
    $authUrl = $authUrlJson.data.authUrl
    Write-Host "  OK Auth URL obtained" -ForegroundColor Green
    Write-Host "  Preview: $($authUrl.Substring(0, [Math]::Min(80, $authUrl.Length)))..."
    Write-Host ""
    Write-Host "  --- INSTRUCTIONS ---" -ForegroundColor Cyan
    Write-Host "  1. Opening auth URL in browser..."
    Start-Process $authUrl
    Write-Host "  2. Authorize AliExpress Dropshipping in the opened page."
    Write-Host "  3. After callback, run this script again (or call /api/debug/aliexpress-dropshipping-credentials)"
    Write-Host "     to verify credentials are saved."
    Write-Host "  -------------------"
    Write-Host ""
} catch {
    Write-Host "  FAIL Auth URL: $_" -ForegroundColor Red
    Write-Host "  Ensure App Key / App Secret are configured for aliexpress-dropshipping."
    exit 1
}

# 4. Debug credentials
Write-Host "[5] GET /api/debug/aliexpress-dropshipping-credentials ..." -ForegroundColor Yellow
try {
    $debug = Invoke-WebRequest -Uri "$BaseUrl/api/debug/aliexpress-dropshipping-credentials" `
        -Method Get -WebSession $session -UseBasicParsing
    $dj = $debug.Content | ConvertFrom-Json
    if ($dj.ok) {
        $s = $dj.summary
        Write-Host "  OK Credentials endpoint" -ForegroundColor Green
        Write-Host "  Production token: $(if ($s.hasProductionToken) { 'yes' } else { 'no' })"
        Write-Host "  Sandbox token: $(if ($s.hasSandboxToken) { 'yes' } else { 'no' })"
        Write-Host "  Any configured: $(if ($s.anyConfigured) { 'yes' } else { 'no' })"
    } else {
        Write-Host "  Response: $($debug.Content)"
    }
} catch {
    Write-Host "  Status or error: $_"
}

Write-Host ""
Write-Host "=== E2E script finished ===" -ForegroundColor Cyan
Write-Host ""
