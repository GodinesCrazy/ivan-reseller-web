#!/usr/bin/env pwsh

# Script para iniciar el sistema Ivan Reseller Web
Write-Host "🚀 Iniciando sistema Ivan Reseller Web..." -ForegroundColor Green

# Verificar que estamos en el directorio correcto
if (!(Test-Path "backend") -or !(Test-Path "frontend")) {
    Write-Host "❌ Error: Ejecuta este script desde el directorio raíz del proyecto" -ForegroundColor Red
    exit 1
}

# Función para verificar si un puerto está ocupado
function Test-Port {
    param($Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
    return $connection.TcpTestSucceeded
}

# Verificar puertos
Write-Host "🔍 Verificando puertos disponibles..." -ForegroundColor Yellow

if (Test-Port 3000) {
    Write-Host "⚠️  Puerto 3000 (backend) está ocupado. Intentando liberarlo..." -ForegroundColor Yellow
    # Intentar matar procesos en puerto 3000
    $processes = netstat -ano | Select-String ":3000" | ForEach-Object { ($_ -split '\s+')[-1] }
    foreach ($pid in $processes) {
        if ($pid -and $pid -ne "0") {
            try {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "✅ Proceso $pid terminado" -ForegroundColor Green
            }
            catch {
                Write-Host "⚠️  No se pudo terminar proceso $pid" -ForegroundColor Yellow
            }
        }
    }
}

if (Test-Port 5173) {
    Write-Host "⚠️  Puerto 5173 (frontend) está ocupado. Intentando liberarlo..." -ForegroundColor Yellow
    # Intentar matar procesos en puerto 5173
    $processes = netstat -ano | Select-String ":5173" | ForEach-Object { ($_ -split '\s+')[-1] }
    foreach ($pid in $processes) {
        if ($pid -and $pid -ne "0") {
            try {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "✅ Proceso $pid terminado" -ForegroundColor Green
            }
            catch {
                Write-Host "⚠️  No se pudo terminar proceso $pid" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host ""
Write-Host "📦 Instalando dependencias del backend..." -ForegroundColor Cyan
Set-Location backend
npm install --silent

Write-Host "🗄️  Configurando base de datos..." -ForegroundColor Cyan
npx prisma generate --silent
npx prisma db push --accept-data-loss --silent
npx prisma db seed --silent

Write-Host "🚀 Iniciando backend (Puerto 3000)..." -ForegroundColor Green
# Asegurar que el backend conozca el puente del scraper (SCRAPER_BRIDGE_URL)
$env:SCRAPER_BRIDGE_URL = "http://127.0.0.1:8077"
$backend = Start-Process -FilePath "cmd" -ArgumentList "/c", "set SCRAPER_BRIDGE_URL=$env:SCRAPER_BRIDGE_URL && npm run dev:skip" -PassThru -WindowStyle Hidden

Set-Location ../frontend

Write-Host "📦 Instalando dependencias del frontend..." -ForegroundColor Cyan
npm install --silent

Write-Host "🌐 Iniciando frontend (Puerto 5173)..." -ForegroundColor Green
$frontend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -PassThru -WindowStyle Hidden

Set-Location ..

Write-Host ""
Write-Host "✨ Sistema iniciado exitosamente!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "🌐 Frontend: http://localhost:5173" -ForegroundColor Blue
Write-Host "🔧 Backend:  http://localhost:3000" -ForegroundColor Blue  
Write-Host "📊 API Docs: http://localhost:3000/health" -ForegroundColor Blue
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "📋 Credenciales por defecto:" -ForegroundColor Magenta
Write-Host "   Email: admin@ivanreseller.com" -ForegroundColor White
Write-Host "   Password: admin123" -ForegroundColor White
Write-Host ""
Write-Host "🛠️  Comandos útiles:" -ForegroundColor Yellow
Write-Host "   Parar sistema: Ctrl+C en ambas ventanas" -ForegroundColor White
Write-Host "   Ver logs: npm run dev en backend/ y frontend/" -ForegroundColor White
Write-Host "   Base datos: npx prisma studio (en backend/)" -ForegroundColor White
Write-Host ""
Write-Host "💡 El sistema puede tardar unos segundos en cargar completamente..." -ForegroundColor Yellow

# Esperar un momento y verificar si los servicios están corriendo
Start-Sleep 5

Write-Host "🔍 Verificando servicios..." -ForegroundColor Cyan

if (Test-Port 3000) {
    Write-Host "✅ Backend funcionando en puerto 3000" -ForegroundColor Green
} else {
    Write-Host "❌ Backend no responde en puerto 3000" -ForegroundColor Red
}

if (Test-Port 5173) {
    Write-Host "✅ Frontend funcionando en puerto 5173" -ForegroundColor Green
} else {
    Write-Host "❌ Frontend no responde en puerto 5173" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 ¡Sistema listo! Abre http://localhost:5173 en tu navegador" -ForegroundColor Green

# Abrir el navegador automáticamente
Start-Process "http://localhost:5173"

# Inicializar microservicio Python (scraper) si existe
if (Test-Path "ivan_reseller/server_unified.py") {
    Write-Host "�Ys? Iniciando microservicio Python (Scraper) en 8077..." -ForegroundColor Green
    $scraper = Start-Process -FilePath "cmd" -ArgumentList "/c", "set PORT=8077 && python ivan_reseller\server_unified.py" -PassThru -WindowStyle Hidden
    Start-Sleep 3
    if (Test-Port 8077) {
        Write-Host "�o. Scraper funcionando en puerto 8077" -ForegroundColor Green
    } else {
        Write-Host "�s���?  Scraper no respondi�� en 8077 (contin��a sin puente)" -ForegroundColor Yellow
    }
}
