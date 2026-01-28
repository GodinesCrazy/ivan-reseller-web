# Railway Deployment Script for Windows PowerShell
# Uso: .\deploy-railway.ps1

Write-Host "?? Railway Deployment Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Verificar Railway CLI
Write-Host "?? Verificando Railway CLI..." -ForegroundColor Yellow
$railwayVersion = railway --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "? Railway CLI no está instalado" -ForegroundColor Red
    Write-Host "   Instala con: npm install -g @railway/cli" -ForegroundColor Yellow
    Write-Host "   O visita: https://railway.app/cli" -ForegroundColor Yellow
    exit 1
}
Write-Host "? Railway CLI encontrado: $railwayVersion" -ForegroundColor Green
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "? No se encontró package.json" -ForegroundColor Red
    Write-Host "   Ejecuta este script desde el directorio backend/" -ForegroundColor Yellow
    exit 1
}

# Verificar build local
Write-Host "?? Verificando build local..." -ForegroundColor Yellow
if (-not (Test-Path "dist/server.js")) {
    Write-Host "??  dist/server.js no existe. Ejecutando build..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "? Build falló" -ForegroundColor Red
        exit 1
    }
}
Write-Host "? Build verificado" -ForegroundColor Green
Write-Host ""

# Login check
Write-Host "?? Verificando autenticación Railway..." -ForegroundColor Yellow
railway whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "??  No estás autenticado. Ejecutando login..." -ForegroundColor Yellow
    railway login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "? Login falló" -ForegroundColor Red
        exit 1
    }
}
Write-Host "? Autenticado en Railway" -ForegroundColor Green
Write-Host ""

# Verificar proyecto linkado
Write-Host "?? Verificando proyecto..." -ForegroundColor Yellow
$projectInfo = railway status 2>&1
if ($LASTEXITCODE -ne 0 -or $projectInfo -match "No project linked") {
    Write-Host "??  Proyecto no linkado. Ejecutando link..." -ForegroundColor Yellow
    railway link
    if ($LASTEXITCODE -ne 0) {
        Write-Host "? Link falló" -ForegroundColor Red
        exit 1
    }
}
Write-Host "? Proyecto linkado" -ForegroundColor Green
Write-Host ""

# Verificar variables críticas
Write-Host "?? Verificando variables de entorno críticas..." -ForegroundColor Yellow
$vars = railway variables 2>&1
$hasJWT = $vars -match "JWT_SECRET"
$hasNodeEnv = $vars -match "NODE_ENV"

if (-not $hasNodeEnv) {
    Write-Host "??  NODE_ENV no configurado. Configurando..." -ForegroundColor Yellow
    railway variables set NODE_ENV=production
}

if (-not $hasJWT) {
    Write-Host "??  JWT_SECRET no configurado" -ForegroundColor Red
    Write-Host "   Configura JWT_SECRET antes de continuar:" -ForegroundColor Yellow
    Write-Host "   railway variables set JWT_SECRET='tu-secreto-minimo-32-caracteres'" -ForegroundColor Cyan
    $continue = Read-Host "?Continuar de todas formas? (s/N)"
    if ($continue -ne "s" -and $continue -ne "S") {
        exit 1
    }
}
Write-Host "? Variables críticas verificadas" -ForegroundColor Green
Write-Host ""

# Deployment
Write-Host "?? Iniciando deployment..." -ForegroundColor Cyan
Write-Host ""
railway up
if ($LASTEXITCODE -ne 0) {
    Write-Host "? Deployment falló" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "? Deployment completado!" -ForegroundColor Green
Write-Host ""
Write-Host "?? Próximos pasos:" -ForegroundColor Cyan
Write-Host "   1. Ver logs: railway logs --follow" -ForegroundColor White
Write-Host "   2. Ver URL: railway domain" -ForegroundColor White
Write-Host "   3. Verificar health: Invoke-WebRequest (railway domain)/health" -ForegroundColor White
Write-Host ""
