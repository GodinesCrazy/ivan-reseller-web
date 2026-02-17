# Despliega el backend a Railway (ejecutar desde la raíz del repo).
# Requiere: railway CLI instalado y sesión iniciada (railway login).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Railway - Deploy backend" -ForegroundColor Cyan
Write-Host ""

# Comprobar Railway CLI
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Railway CLI no encontrado. Instala con: npm install -g @railway/cli" -ForegroundColor Red
    exit 1
}

# Comprobar login
$who = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "No hay sesion de Railway. Ejecuta primero: railway login" -ForegroundColor Yellow
    Write-Host "  (se abrira el navegador para autorizar)" -ForegroundColor Gray
    exit 1
}
Write-Host "Sesion OK: $who" -ForegroundColor Green

# Deploy desde backend (root del servicio)
Set-Location backend
Write-Host "Ejecutando: railway up" -ForegroundColor Cyan
railway up
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy fallo." -ForegroundColor Red
    exit 1
}
Write-Host "Deploy enviado. Revisa el estado en https://railway.app" -ForegroundColor Green
