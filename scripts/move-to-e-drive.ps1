# Script: Mover archivos de C: a E: para liberar espacio
# Ejecutar como usuario con permisos
$ErrorActionPreference = "Continue"

$destBase = "E:\MovedFromC"
if (-not (Test-Path $destBase)) { New-Item -ItemType Directory -Path $destBase -Force | Out-Null }

$freed = 0

# 1. npm-cache (~3.6 GB) - Mover y crear junction
$npmCache = "$env:LOCALAPPDATA\npm-cache"
$npmDest = "$destBase\npm-cache"
if (Test-Path $npmCache) {
    Write-Host "Moviendo npm-cache a E:..."
    if (Test-Path $npmDest) { Remove-Item $npmDest -Recurse -Force }
    Robocopy $npmCache $npmDest /E /MOVE /NFL /NDL /NJH /NJS /NC /NS /NP 2>$null
    if (Test-Path $npmDest) {
        Remove-Item $npmCache -Recurse -Force -ErrorAction SilentlyContinue
        cmd /c mklink /J "`"$npmCache`"" "`"$npmDest`"" 2>$null
        npm config set cache $npmDest
        $freed += 3.6
        Write-Host "  npm-cache movido. Junction creado."
    }
}

# 2. Temp - Limpiar (no mover, borrar)
$tempPath = "$env:TEMP"
if (Test-Path $tempPath) {
    Write-Host "Limpiando Temp..."
    Get-ChildItem $tempPath -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    $freed += 1.5
    Write-Host "  Temp limpiado."
}

# 3. npm cache alternativo en Roaming
$npmRoaming = "$env:APPDATA\npm-cache"
if (Test-Path $npmRoaming) {
    $s = (Get-ChildItem $npmRoaming -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB
    if ($s -gt 0.1) {
        Write-Host "Moviendo npm-cache (Roaming)..."
        $npmRDest = "$destBase\npm-cache-roaming"
        Robocopy $npmRoaming $npmRDest /E /MOVE /NFL /NDL /NJH /NJS 2>$null
        $freed += [math]::Round($s, 2)
    }
}

Write-Host "`nEspacio liberado estimado: ~$([math]::Round($freed, 1)) GB"
Write-Host "Destino: $destBase"
