# Restart Redis and redeploy backend on Railway so workers and dashboard jobs run again.
# Requires: Railway CLI installed and project linked (e.g. run from backend/ with railway link).
# Usage: from repo root, .\backend\scripts\railway-restart-redis-and-backend.ps1
#        or from backend/, .\scripts\railway-restart-redis-and-backend.ps1

$ErrorActionPreference = "Stop"

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Railway CLI not found. Install it from https://docs.railway.app/develop/cli and run 'railway link' from the backend directory." -ForegroundColor Red
    exit 1
}

$backendDir = $PSScriptRoot + "\.."
Push-Location $backendDir

try {
    Write-Host "Restarting Redis..." -ForegroundColor Cyan
    railway service restart -s Redis -y
    if ($LASTEXITCODE -ne 0) { throw "railway service restart -s Redis -y failed" }

    Write-Host "Redeploying backend..." -ForegroundColor Cyan
    railway service redeploy -s ivan-reseller-backend -y
    if ($LASTEXITCODE -ne 0) { throw "railway service redeploy -s ivan-reseller-backend -y failed" }

    Write-Host "Done. Check Control Center (Redis and Workers should turn ok after the backend finishes deploying)." -ForegroundColor Green
} finally {
    Pop-Location
}
