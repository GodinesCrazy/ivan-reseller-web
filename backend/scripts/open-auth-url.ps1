# Script para abrir la URL de autorización de AliExpress
# Ejecuta: .\scripts\open-auth-url.ps1

$authUrl = "https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "ABRIENDO URL DE AUTORIZACIÓN DE ALIEXPRESS" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "URL:" -ForegroundColor Yellow
Write-Host $authUrl -ForegroundColor White
Write-Host ""
Write-Host "INSTRUCCIONES:" -ForegroundColor Yellow
Write-Host "1. Se abrirá tu navegador con la página de autorización" -ForegroundColor Gray
Write-Host "2. Inicia sesión en AliExpress si es necesario" -ForegroundColor Gray
Write-Host "3. Autoriza la aplicación 'IvanReseller Affiliate API'" -ForegroundColor Gray
Write-Host "4. Serás redirigido a una URL con el código" -ForegroundColor Gray
Write-Host "5. Copia el valor del parámetro 'code' de la URL" -ForegroundColor Gray
Write-Host "6. Ejecuta: npx tsx scripts/final-test-aliexpress.ts TU_CODIGO" -ForegroundColor Gray
Write-Host ""

Start-Process $authUrl

Write-Host "? Navegador abierto. Sigue las instrucciones arriba." -ForegroundColor Green
Write-Host ""
