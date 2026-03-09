# Configurar variables de MercadoLibre en Railway
# Requiere: railway login, railway link (desde la raíz del repo)
# Uso: .\scripts\set-railway-mercadolibre-vars.ps1
#      .\scripts\set-railway-mercadolibre-vars.ps1 -ServiceName ivan-reseller-backend

param(
    [string]$ServiceName = "ivan-reseller-backend"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."

Write-Host "=== Configurar variables MercadoLibre en Railway ===" -ForegroundColor Cyan
Write-Host ""

# Verificar Railway CLI
$railway = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railway) {
    Write-Host "ERROR: Railway CLI no instalado. Ejecuta: npm install -g @railway/cli" -ForegroundColor Red
    exit 1
}

# Cargar .env.local si existe
$envPath = Join-Path $root "backend\.env.local"
$envVars = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $envVars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
        }
    }
}

# Valores por defecto para MercadoLibre (según plan)
$vars = @{
    BACKEND_URL = $envVars["BACKEND_URL"]
    MERCADOLIBRE_CLIENT_ID = $envVars["MERCADOLIBRE_CLIENT_ID"]
    MERCADOLIBRE_CLIENT_SECRET = $envVars["MERCADOLIBRE_CLIENT_SECRET"]
    MERCADOLIBRE_REDIRECT_URI = $envVars["MERCADOLIBRE_REDIRECT_URI"]
    MERCADOLIBRE_SITE_ID = $envVars["MERCADOLIBRE_SITE_ID"]
    CORS_ORIGIN = $envVars["CORS_ORIGIN"]
}

# Aplicar defaults si no están en .env.local
if (-not $vars["BACKEND_URL"]) { $vars["BACKEND_URL"] = "https://ivanreseller.com" }
if (-not $vars["MERCADOLIBRE_CLIENT_ID"]) { $vars["MERCADOLIBRE_CLIENT_ID"] = "8432109661263766" }
if (-not $vars["MERCADOLIBRE_REDIRECT_URI"]) { $vars["MERCADOLIBRE_REDIRECT_URI"] = "https://ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre" }
if (-not $vars["MERCADOLIBRE_SITE_ID"]) { $vars["MERCADOLIBRE_SITE_ID"] = "MLC" }
if (-not $vars["CORS_ORIGIN"]) { $vars["CORS_ORIGIN"] = "https://www.ivanreseller.com,https://ivanreseller.com" }

# Pedir MERCADOLIBRE_CLIENT_SECRET si no está
if (-not $vars["MERCADOLIBRE_CLIENT_SECRET"]) {
    $vars["MERCADOLIBRE_CLIENT_SECRET"] = Read-Host "MERCADOLIBRE_CLIENT_SECRET (desde MercadoLibre Developer Portal)"
}

Write-Host "Variables a configurar:" -ForegroundColor Yellow
$vars.GetEnumerator() | ForEach-Object {
    $val = $_.Value
    if ($_.Key -eq "MERCADOLIBRE_CLIENT_SECRET" -and $val.Length -gt 4) { $val = $val.Substring(0,4) + "***" }
    Write-Host "  $($_.Key)=$val" -ForegroundColor Gray
}
Write-Host ""

Set-Location $root

foreach ($kv in $vars.GetEnumerator()) {
    $val = $kv.Value
    if ([string]::IsNullOrWhiteSpace($val)) { continue }
    Write-Host "Setting $($kv.Key)..." -ForegroundColor Gray
    $arg = "$($kv.Key)=$val"
    # Pasar KEY=value como un solo argument (comillas para valores con comas, ej. CORS_ORIGIN)
    & railway variable set "$arg" -s $ServiceName 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & railway variables --set "$arg" -s $ServiceName 2>&1 | Out-Null
    }
}

Write-Host ""
Write-Host "=== Listo ===" -ForegroundColor Green
Write-Host "Variables MercadoLibre configuradas en servicio: $ServiceName"
Write-Host "Railway redesplegará automáticamente. O ejecuta: railway redeploy -s $ServiceName"
