# ============================================
# ACTUALIZAR PROYECTO EN GITHUB
# ============================================
# Este script prepara y sube los cambios a GitHub

Write-Host ""
Write-Host "ACTUALIZAR PROYECTO EN GITHUB" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "backend")) {
    Write-Host "ERROR: Debes ejecutar este script desde la raiz del proyecto" -ForegroundColor Red
    pause
    exit 1
}

# Verificar estado de Git
Write-Host "Verificando estado de Git..." -ForegroundColor Yellow
git status

Write-Host ""
Write-Host "Archivos que se van a agregar:" -ForegroundColor Yellow
Write-Host "  - railway.json (configuracion actualizada)" -ForegroundColor White
Write-Host "  - Guias de deployment (nuevas)" -ForegroundColor White
Write-Host "  - backend/nixpacks.toml (configuracion Railway)" -ForegroundColor White

Write-Host ""
$confirm = Read-Host "¿Deseas continuar con el commit y push? (S/N)"
if ($confirm -ne "S" -and $confirm -ne "s") {
    Write-Host "Cancelado." -ForegroundColor Yellow
    pause
    exit 0
}

# Agregar archivos relevantes
Write-Host ""
Write-Host "Agregando archivos..." -ForegroundColor Yellow
git add railway.json
git add CONFIGURACION_RAILWAY_EXACTA.md
git add GUIA_VISUAL_RAILWAY.md
git add INSTRUCCIONES_INMEDIATAS.md
git add SOLUCION_ERROR_RAILWAY.md
git add SOLUCION_RAILWAY_COMPLETA.md
git add backend/nixpacks.toml

# Ignorar archivos temporales
if (Test-Path "Para Railway c2172a854870ad2623c493.txt") {
    Write-Host "Ignorando archivo temporal..." -ForegroundColor Yellow
}

# Commit
Write-Host ""
Write-Host "Creando commit..." -ForegroundColor Yellow
$commitMessage = "fix: Configurar Railway con rootDirectory backend y build commands"
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo crear el commit. Verifica que hay cambios para commitear." -ForegroundColor Red
    pause
    exit 1
}

# Push
Write-Host ""
Write-Host "Subiendo cambios a GitHub..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Cambios subidos exitosamente a GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Railway deberia detectar los cambios y redesplegar automaticamente." -ForegroundColor Cyan
    Write-Host "Si no, ve a Railway Dashboard y haz 'Redeploy' manualmente." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "ERROR: No se pudo subir los cambios. Verifica tu conexion y permisos." -ForegroundColor Red
}

Write-Host ""
pause

