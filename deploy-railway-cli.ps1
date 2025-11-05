# ============================================
# DEPLOYMENT CON RAILWAY CLI
# ============================================
# Requiere: npm install -g @railway/cli
# Ejecuta: railway login (primera vez)

Write-Host "🚂 DEPLOYMENT CON RAILWAY CLI" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Verificar Railway CLI
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railwayInstalled) {
    Write-Host "❌ Railway CLI no está instalado" -ForegroundColor Red
    Write-Host ""
    Write-Host "Instalar con:" -ForegroundColor Yellow
    Write-Host "  npm install -g @railway/cli" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Luego ejecuta:" -ForegroundColor Yellow
    Write-Host "  railway login" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ Railway CLI detectado" -ForegroundColor Green
Write-Host ""

# Generar JWT_SECRET
Write-Host "🔐 Generando JWT_SECRET..." -ForegroundColor Yellow
$jwtSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ JWT_SECRET: $jwtSecret" -ForegroundColor Green
    $jwtSecret | Set-Clipboard
    Write-Host "✅ Copiado al portapapeles" -ForegroundColor Green
} else {
    Write-Host "❌ Error generando JWT_SECRET" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 Variables de Entorno Necesarias:" -ForegroundColor Yellow
Write-Host "  NODE_ENV=production" -ForegroundColor Cyan
Write-Host "  PORT=3000" -ForegroundColor Cyan
Write-Host "  JWT_SECRET=$jwtSecret" -ForegroundColor Cyan
Write-Host "  JWT_EXPIRES_IN=7d" -ForegroundColor Cyan
Write-Host "  CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com" -ForegroundColor Cyan
Write-Host "  LOG_LEVEL=info" -ForegroundColor Cyan
Write-Host ""

# Opciones
Write-Host "¿Qué quieres hacer?" -ForegroundColor Yellow
Write-Host "1. Crear nuevo proyecto en Railway" -ForegroundColor White
Write-Host "2. Conectar a proyecto existente" -ForegroundColor White
Write-Host "3. Solo mostrar comandos" -ForegroundColor White
$opcion = Read-Host "Opción (1/2/3)"

if ($opcion -eq "1") {
    Write-Host ""
    Write-Host "Creando nuevo proyecto..." -ForegroundColor Cyan
    Write-Host "Ejecuta estos comandos:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "cd backend" -ForegroundColor Cyan
    Write-Host "railway init" -ForegroundColor Cyan
    Write-Host "railway add" -ForegroundColor Cyan
    Write-Host "railway link" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Luego configura variables:" -ForegroundColor Yellow
    Write-Host "railway variables set NODE_ENV=production" -ForegroundColor Cyan
    Write-Host "railway variables set PORT=3000" -ForegroundColor Cyan
    Write-Host "railway variables set JWT_SECRET=$jwtSecret" -ForegroundColor Cyan
    Write-Host "railway variables set CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Agregar PostgreSQL:" -ForegroundColor Yellow
    Write-Host "railway add postgresql" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Agregar Redis:" -ForegroundColor Yellow
    Write-Host "railway add redis" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Deploy:" -ForegroundColor Yellow
    Write-Host "railway up" -ForegroundColor Cyan
} elseif ($opcion -eq "2") {
    Write-Host ""
    Write-Host "Conectando a proyecto existente..." -ForegroundColor Cyan
    Write-Host "Ejecuta:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "cd backend" -ForegroundColor Cyan
    Write-Host "railway link" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Luego configura variables (ver arriba)" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "📋 Comandos para Railway CLI:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "cd backend" -ForegroundColor Cyan
    Write-Host "railway login" -ForegroundColor Cyan
    Write-Host "railway init" -ForegroundColor Cyan
    Write-Host "railway add postgresql" -ForegroundColor Cyan
    Write-Host "railway add redis" -ForegroundColor Cyan
    Write-Host "railway variables set NODE_ENV=production" -ForegroundColor Cyan
    Write-Host "railway variables set JWT_SECRET=$jwtSecret" -ForegroundColor Cyan
    Write-Host "railway variables set CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com" -ForegroundColor Cyan
    Write-Host "railway up" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "✅ Listo! Sigue los comandos arriba" -ForegroundColor Green

