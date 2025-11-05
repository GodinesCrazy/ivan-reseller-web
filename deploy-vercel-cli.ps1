# ============================================
# DEPLOYMENT CON VERCEL CLI
# ============================================
# Requiere: npm install -g vercel
# Ejecuta: vercel login (primera vez)

Write-Host "▲ DEPLOYMENT CON VERCEL CLI" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

# Verificar Vercel CLI
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "❌ Vercel CLI no está instalado" -ForegroundColor Red
    Write-Host ""
    Write-Host "Instalar con:" -ForegroundColor Yellow
    Write-Host "  npm install -g vercel" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Luego ejecuta:" -ForegroundColor Yellow
    Write-Host "  vercel login" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ Vercel CLI detectado" -ForegroundColor Green
Write-Host ""

# Obtener URL de Railway
$railwayUrl = Read-Host "Ingresa la URL de Railway (backend) [o presiona Enter para usar placeholder]"
if ([string]::IsNullOrWhiteSpace($railwayUrl)) {
    $railwayUrl = "https://tu-backend-xxxx.up.railway.app"
    Write-Host "⚠️  Usando placeholder. Actualiza después." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Variables de Entorno:" -ForegroundColor Yellow
Write-Host "  VITE_API_URL=$railwayUrl" -ForegroundColor Cyan
Write-Host ""

# Deploy
Write-Host "🚀 Deployando a Vercel..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Ejecuta estos comandos:" -ForegroundColor Yellow
Write-Host ""
Write-Host "cd frontend" -ForegroundColor Cyan
Write-Host "vercel" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cuando te pregunte, configura:" -ForegroundColor Yellow
Write-Host "  - Set up and deploy? Y" -ForegroundColor White
Write-Host "  - Which scope? [Tu cuenta]" -ForegroundColor White
Write-Host "  - Link to existing project? N" -ForegroundColor White
Write-Host "  - Project name? ivan-reseller" -ForegroundColor White
Write-Host "  - Directory? ./" -ForegroundColor White
Write-Host ""
Write-Host "Luego configura variables:" -ForegroundColor Yellow
Write-Host "vercel env add VITE_API_URL production" -ForegroundColor Cyan
Write-Host "# Ingresa: $railwayUrl" -ForegroundColor White
Write-Host ""
Write-Host "Deploy a producción:" -ForegroundColor Yellow
Write-Host "vercel --prod" -ForegroundColor Cyan

Write-Host ""
Write-Host "✅ Listo! Sigue los comandos arriba" -ForegroundColor Green

