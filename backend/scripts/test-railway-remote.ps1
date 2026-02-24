# Test Railway backend (health + optional post-sale flow)
# Usage:
#   .\scripts\test-railway-remote.ps1
#     (uses API_URL and INTERNAL_RUN_SECRET from .env)
#   $env:API_URL="https://tu-backend.up.railway.app"; $env:INTERNAL_RUN_SECRET="tu-secreto"; .\scripts\test-railway-remote.ps1
#   .\scripts\test-railway-remote.ps1 -PostSaleFlow
#     (runs full test-post-sale-flow; requires real product URL for real purchase)

param(
    [switch]$PostSaleFlow
)

$ErrorActionPreference = "Stop"
if (Test-Path .env) { Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } } }

$baseUrl = $env:API_URL ?? $env:BACKEND_URL
$secret = $env:INTERNAL_RUN_SECRET

if (-not $baseUrl) { Write-Host "ERROR: Set API_URL or BACKEND_URL (e.g. https://tu-backend.up.railway.app)"; exit 1 }
if (-not $secret) { Write-Host "ERROR: Set INTERNAL_RUN_SECRET"; exit 1 }

$baseUrl = $baseUrl.TrimEnd('/')
Write-Host "Testing: $baseUrl"
Write-Host ""

# 1. Health
Write-Host "[1/2] GET /api/internal/health ..."
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/api/internal/health" -Method Get -Headers @{ "x-internal-secret" = $secret }
    Write-Host "  OK" -ForegroundColor Green
    Write-Host "  hasSecret: $($r.hasSecret)"
} catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Optional post-sale flow
if ($PostSaleFlow) {
    Write-Host ""
    Write-Host "[2/2] POST /api/internal/test-post-sale-flow ..."
    $body = @{
        productUrl = "https://www.aliexpress.com/item/example.html"
        price = 10.99
        customer = @{ name = "John Doe"; email = "john@test.com"; address = "123 Main St, Miami, FL, US" }
    } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$baseUrl/api/internal/test-post-sale-flow" -Method Post -Headers @{
            "Content-Type" = "application/json"
            "x-internal-secret" = $secret
        } -Body $body
        Write-Host "  success: $($r.success), finalStatus: $($r.finalStatus), aliexpressOrderId: $($r.aliexpressOrderId)"
        if ($r.success) { Write-Host "  OK" -ForegroundColor Green } else { Write-Host "  FAIL" -ForegroundColor Red; exit 1 }
    } catch {
        Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
}
} else {
    Write-Host "[2/2] Skipped (use -PostSaleFlow to run full purchase test)"
}

Write-Host ""
Write-Host "Done. Railway health OK."
