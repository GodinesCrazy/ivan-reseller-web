# Deploy Scraper Bridge to Railway and wire backend
# REQUIRED: Run in an interactive terminal (railway login opens browser)
# Adjust $backendService if your backend has a different name.

$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$backendService = "ivan-reseller-backend"  # Change if needed

Write-Host "=== 1. Railway CLI ===" -ForegroundColor Cyan
railway --version
if ($LASTEXITCODE -ne 0) { npm install -g @railway/cli }

Write-Host "`n=== 2. Railway Login (opens browser) ===" -ForegroundColor Cyan
railway login
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n=== 3. Link to project ===" -ForegroundColor Cyan
Set-Location $root
railway link
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n=== 4. Deploy scraper-bridge ===" -ForegroundColor Cyan
railway up -s scraper-bridge --path-as-root scraper-bridge
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n=== 5. Generate domain for scraper-bridge ===" -ForegroundColor Cyan
$domainOut = railway domain -s scraper-bridge 2>&1
$bridgeUrl = ($domainOut | Select-String -Pattern "https://[^\s]+" | ForEach-Object { $_.Matches.Value }) | Select-Object -First 1
if (-not $bridgeUrl) {
    Write-Host "Domain output: $domainOut"
    $bridgeUrl = Read-Host "Paste Bridge public URL (e.g. https://scraper-bridge-xxx.up.railway.app)"
}

Write-Host "`n=== 6. Set backend variables ===" -ForegroundColor Cyan
railway variables --set "SCRAPER_BRIDGE_ENABLED=true" -s $backendService
railway variables --set "SCRAPER_BRIDGE_URL=$bridgeUrl" -s $backendService

Write-Host "`n=== 7. Restart backend ===" -ForegroundColor Cyan
railway redeploy -s $backendService

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Bridge public URL: $bridgeUrl"
Write-Host "Backend restarted: yes"
