# ============================================
# DEPLOYMENT AUTOMATICO - IVAN RESELLER
# ============================================
# Este script te guia paso a paso para hacer el deployment
# Ejecuta: .\deploy-automatico.ps1

Write-Host "DEPLOYMENT AUTOMATICO - IVAN RESELLER" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "backend" -PathType Container)) {
    Write-Host "ERROR: Debes ejecutar este script desde la raiz del proyecto" -ForegroundColor Red
    exit 1
}

# Verificar que git esta configurado
Write-Host "PASO 1: Verificar Git..." -ForegroundColor Yellow
$gitStatus = git status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git no esta inicializado. Inicializando..." -ForegroundColor Yellow
    git init
}

# Verificar cambios sin commitear
$changes = git status --porcelain
if ($changes) {
    Write-Host "Hay cambios sin commitear:" -ForegroundColor Yellow
    Write-Host $changes
    Write-Host ""
    $commit = Read-Host "Quieres hacer commit de estos cambios? (s/n)"
    if ($commit -eq "s" -or $commit -eq "S") {
        $message = Read-Host "Mensaje del commit (o presiona Enter para usar mensaje por defecto)"
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "feat: Preparacion para deployment a produccion"
        }
        git add .
        git commit -m $message
        Write-Host "Cambios commiteados" -ForegroundColor Green
    }
}

# Verificar que hay un remote configurado
$remotes = git remote -v
if (-not $remotes) {
    Write-Host ""
    Write-Host "Configuracion de Git Remote" -ForegroundColor Yellow
    Write-Host "No hay un repositorio remoto configurado." -ForegroundColor Yellow
    $repoUrl = Read-Host "Ingresa la URL de tu repositorio GitHub (ej: https://github.com/GodinesCrazy/ivan-reseller-web.git)"
    if ($repoUrl) {
        git remote add origin $repoUrl
        Write-Host "Remote configurado" -ForegroundColor Green
    }
}

# Push a GitHub
Write-Host ""
Write-Host "PASO 2: Push a GitHub..." -ForegroundColor Yellow
$push = Read-Host "Quieres hacer push a GitHub ahora? (s/n)"
if ($push -eq "s" -or $push -eq "S") {
    $branch = git branch --show-current
    Write-Host "Haciendo push a origin/$branch..." -ForegroundColor Cyan
    git push -u origin $branch
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Push exitoso" -ForegroundColor Green
    } else {
        Write-Host "Push fallo. Verifica tu conexion y permisos." -ForegroundColor Yellow
    }
}

# Generar JWT_SECRET
Write-Host ""
Write-Host "PASO 3: Generar JWT_SECRET..." -ForegroundColor Yellow
$jwtSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "JWT_SECRET generado:" -ForegroundColor Green
    Write-Host $jwtSecret -ForegroundColor Cyan
    Write-Host ""
    Write-Host "GUARDA ESTE VALOR - Lo necesitaras en Railway:" -ForegroundColor Yellow
    Write-Host $jwtSecret -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host ""
    $clipboard = Read-Host "Quieres copiarlo al portapapeles? (s/n)"
    if ($clipboard -eq "s" -or $clipboard -eq "S") {
        $jwtSecret | Set-Clipboard
        Write-Host "Copiado al portapapeles" -ForegroundColor Green
    }
} else {
    Write-Host "Error generando JWT_SECRET. Genera uno manualmente con:" -ForegroundColor Red
    Write-Host 'node -e "console.log(require(''crypto'').randomBytes(32).toString(''hex''))"' -ForegroundColor Yellow
}

# Instrucciones para Railway
Write-Host ""
Write-Host "PASO 4: Configurar Railway (Backend)" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a: https://railway.app" -ForegroundColor Cyan
Write-Host "2. Login con GitHub" -ForegroundColor Cyan
Write-Host "3. Click 'New Project' -> 'Deploy from GitHub repo'" -ForegroundColor Cyan
Write-Host "4. Busca: GodinesCrazy/ivan-reseller-web" -ForegroundColor Cyan
Write-Host "5. Selecciona el repositorio" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuracion del servicio:" -ForegroundColor Yellow
Write-Host "  - Root Directory: backend" -ForegroundColor White
Write-Host "  - Build Command: npm install" -ForegroundColor White
Write-Host "  - Start Command: npm start" -ForegroundColor White
Write-Host ""
Write-Host "Agregar PostgreSQL:" -ForegroundColor Yellow
Write-Host "  - Click '+ New' -> 'Database' -> 'PostgreSQL'" -ForegroundColor White
Write-Host "  - Railway crea automaticamente DATABASE_URL" -ForegroundColor White
Write-Host ""
Write-Host "Agregar Redis (Recomendado):" -ForegroundColor Yellow
Write-Host "  - Click '+ New' -> 'Database' -> 'Redis'" -ForegroundColor White
Write-Host "  - Railway crea automaticamente REDIS_URL" -ForegroundColor White
Write-Host ""
Write-Host "Variables de Entorno en Railway:" -ForegroundColor Yellow
Write-Host "  Click en servicio backend -> 'Variables' -> Agregar:" -ForegroundColor White
Write-Host ""
Write-Host "  NODE_ENV=production" -ForegroundColor Cyan
Write-Host "  PORT=3000" -ForegroundColor Cyan
Write-Host "  JWT_SECRET=$jwtSecret" -ForegroundColor Cyan
Write-Host "  JWT_EXPIRES_IN=7d" -ForegroundColor Cyan
Write-Host "  CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com" -ForegroundColor Cyan
Write-Host "  LOG_LEVEL=info" -ForegroundColor Cyan
Write-Host ""
Write-Host "Obtener URL del Backend:" -ForegroundColor Yellow
Write-Host "  Railway -> Settings -> Networking -> 'Generate Domain'" -ForegroundColor White
Write-Host "  Copia la URL que te da Railway" -ForegroundColor White
Write-Host ""
$railwayUrl = Read-Host "Pega aqui la URL de Railway (o presiona Enter para continuar)"
if ($railwayUrl) {
    $script:RAILWAY_URL = $railwayUrl
    Write-Host "URL guardada: $railwayUrl" -ForegroundColor Green
}

# Instrucciones para Vercel
Write-Host ""
Write-Host "PASO 5: Configurar Vercel (Frontend)" -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ve a: https://vercel.com/ivan-martys-projects" -ForegroundColor Cyan
Write-Host "   O ve a: https://vercel.com/new" -ForegroundColor Cyan
Write-Host "2. Busca: GodinesCrazy/ivan-reseller-web" -ForegroundColor Cyan
Write-Host "3. Click 'Import'" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuracion:" -ForegroundColor Yellow
Write-Host "  - Framework Preset: Vite" -ForegroundColor White
Write-Host "  - Root Directory: frontend" -ForegroundColor White
Write-Host "  - Build Command: npm run build" -ForegroundColor White
Write-Host "  - Output Directory: dist" -ForegroundColor White
Write-Host ""
Write-Host "Variables de Entorno en Vercel:" -ForegroundColor Yellow
Write-Host "  Dashboard -> Tu proyecto -> Settings -> Environment Variables" -ForegroundColor White
Write-Host ""
if ($railwayUrl) {
    Write-Host "  VITE_API_URL=$railwayUrl" -ForegroundColor Cyan
} else {
    Write-Host "  VITE_API_URL=https://tu-backend-xxxx.up.railway.app" -ForegroundColor Cyan
    Write-Host "  (Reemplaza con la URL real de Railway)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Click 'Deploy'" -ForegroundColor White
Write-Host ""
$vercelUrl = Read-Host "Pega aqui la URL de Vercel (o presiona Enter para continuar)"
if ($vercelUrl) {
    $script:VERCEL_URL = $vercelUrl
    Write-Host "URL guardada: $vercelUrl" -ForegroundColor Green
}

# Actualizar CORS
Write-Host ""
Write-Host "PASO 6: Actualizar CORS en Railway" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host ""
if ($vercelUrl -and $railwayUrl) {
    Write-Host "Actualiza CORS_ORIGIN en Railway con:" -ForegroundColor Yellow
    Write-Host "  CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,$vercelUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Railway se redesplegara automaticamente" -ForegroundColor White
} else {
    Write-Host "1. Volver a Railway" -ForegroundColor Cyan
    Write-Host "2. Abrir servicio backend -> 'Variables'" -ForegroundColor Cyan
    Write-Host "3. Actualizar CORS_ORIGIN:" -ForegroundColor Cyan
    Write-Host "   https://www.ivanreseller.com,https://ivanreseller.com,[URL_DE_VERCEL]" -ForegroundColor White
}

# Configurar dominio
Write-Host ""
Write-Host "PASO 7: Configurar Dominio" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor Yellow
Write-Host ""
Write-Host "En Vercel:" -ForegroundColor Cyan
Write-Host "  1. Dashboard -> Tu Proyecto -> Settings -> Domains" -ForegroundColor White
Write-Host "  2. Agregar: ivanreseller.com y www.ivanreseller.com" -ForegroundColor White
Write-Host "  3. Vercel te dara records DNS" -ForegroundColor White
Write-Host ""
Write-Host "En tu Proveedor DNS:" -ForegroundColor Cyan
Write-Host "  1. Ir a tu panel de DNS (Namecheap, GoDaddy, etc.)" -ForegroundColor White
Write-Host "  2. Agregar los records que Vercel te dio" -ForegroundColor White
Write-Host "  3. Esperar 1-24 horas (propagacion DNS)" -ForegroundColor White

# Verificacion
Write-Host ""
Write-Host "PASO 8: Verificacion" -ForegroundColor Yellow
Write-Host "======================" -ForegroundColor Yellow
Write-Host ""
if ($railwayUrl) {
    Write-Host "Backend Health Check:" -ForegroundColor Cyan
    Write-Host "  $railwayUrl/health" -ForegroundColor White
    Write-Host "  Deberia mostrar: {`"status`":`"ok`"}" -ForegroundColor White
}
if ($vercelUrl) {
    Write-Host ""
    Write-Host "Frontend:" -ForegroundColor Cyan
    Write-Host "  $vercelUrl" -ForegroundColor White
    Write-Host "  Deberia mostrar la pagina de login" -ForegroundColor White
}
Write-Host ""
Write-Host "Login de prueba:" -ForegroundColor Cyan
Write-Host "  Usuario: demo" -ForegroundColor White
Write-Host "  Contrasena: demo123" -ForegroundColor White

# Resumen final
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT CONFIGURADO" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resumen:" -ForegroundColor Yellow
Write-Host "  - Codigo pusheado a GitHub" -ForegroundColor White
Write-Host "  - JWT_SECRET generado y guardado" -ForegroundColor White
if ($railwayUrl) {
    Write-Host "  - Railway URL: $railwayUrl" -ForegroundColor White
}
if ($vercelUrl) {
    Write-Host "  - Vercel URL: $vercelUrl" -ForegroundColor White
}
Write-Host ""
Write-Host "Documentacion completa:" -ForegroundColor Yellow
Write-Host "  - DEPLOYMENT_INMEDIATO.md" -ForegroundColor White
Write-Host "  - DEPLOYMENT_COMPLETO_PRODUCCION.md" -ForegroundColor White
Write-Host ""
Write-Host "Sigue los pasos arriba y tu sitio estara en vivo!" -ForegroundColor Green
Write-Host ""
