# Script para abrir la URL de autorizaciùn de AliExpress
# Requiere: $env:ALIEXPRESS_APP_KEY y $env:ALIEXPRESS_REDIRECT_URI (o cargar desde .env.local)
# Ejecuta: .\scripts\open-auth-url.ps1

$appKey = $env:ALIEXPRESS_APP_KEY
$redirectUri = $env:ALIEXPRESS_REDIRECT_URI
if (-not $redirectUri) { $redirectUri = "https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback" }
if (-not $appKey) {
    Write-Host "ERROR: Define ALIEXPRESS_APP_KEY en entorno. Nunca hardcodear en codigo." -ForegroundColor Red
    exit 1
}
$redirectEnc = [System.Uri]::EscapeDataString($redirectUri)
$authUrl = "https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=$appKey&redirect_uri=$redirectEnc"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "ABRIENDO URL DE AUTORIZACIùN DE ALIEXPRESS" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "URL:" -ForegroundColor Yellow
Write-Host $authUrl -ForegroundColor White
Write-Host ""
Write-Host "INSTRUCCIONES:" -ForegroundColor Yellow
Write-Host "1. Se abrirù tu navegador con la pùgina de autorizaciùn" -ForegroundColor Gray
Write-Host "2. Inicia sesiùn en AliExpress si es necesario" -ForegroundColor Gray
Write-Host "3. Autoriza la aplicaciùn 'IvanReseller Affiliate API'" -ForegroundColor Gray
Write-Host "4. Serùs redirigido a una URL con el cùdigo" -ForegroundColor Gray
Write-Host "5. Copia el valor del parùmetro 'code' de la URL" -ForegroundColor Gray
Write-Host "6. Ejecuta: npx tsx scripts/final-test-aliexpress.ts TU_CODIGO" -ForegroundColor Gray
Write-Host ""

Start-Process $authUrl

Write-Host "? Navegador abierto. Sigue las instrucciones arriba." -ForegroundColor Green
Write-Host ""
