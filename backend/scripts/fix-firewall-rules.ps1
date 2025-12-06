# Script PowerShell para crear reglas de firewall para Node.js
# Ejecutar como Administrador: PowerShell -ExecutionPolicy Bypass -File fix-firewall-rules.ps1

Write-Host "🔧 Configurando Reglas de Firewall para Node.js..." -ForegroundColor Cyan

# Verificar si se ejecuta como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ Este script debe ejecutarse como Administrador" -ForegroundColor Red
    Write-Host "   Click derecho en PowerShell > 'Ejecutar como administrador'" -ForegroundColor Yellow
    exit 1
}

# Buscar Node.js
$nodePaths = @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe",
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
)

$nodePath = $null
foreach ($path in $nodePaths) {
    if (Test-Path $path) {
        $nodePath = $path
        Write-Host "✅ Node.js encontrado en: $nodePath" -ForegroundColor Green
        break
    }
}

if (-not $nodePath) {
    Write-Host "⚠️  Node.js no encontrado en ubicaciones estándar" -ForegroundColor Yellow
    $nodePath = Read-Host "Ingresa la ruta completa a node.exe"
    if (-not (Test-Path $nodePath)) {
        Write-Host "❌ Ruta no válida: $nodePath" -ForegroundColor Red
        exit 1
    }
}

# Buscar Chrome (para Puppeteer)
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        Write-Host "✅ Chrome encontrado en: $chromePath" -ForegroundColor Green
        break
    }
}

# Crear regla para Node.js (Salida)
Write-Host "`n📝 Creando regla de salida para Node.js..." -ForegroundColor Cyan
$ruleName = "Node.js - Conexiones Salientes HTTPS"

# Eliminar regla existente si existe
netsh advfirewall firewall delete rule name="$ruleName" 2>$null | Out-Null

# Crear nueva regla
netsh advfirewall firewall add rule name="$ruleName" dir=out action=allow program="$nodePath" enable=yes protocol=TCP localport=any remoteport=443,80 description="Permitir conexiones HTTPS/HTTP salientes para Node.js" | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Regla creada exitosamente: $ruleName" -ForegroundColor Green
} else {
    Write-Host "❌ Error creando regla para Node.js" -ForegroundColor Red
}

# Crear regla para Chrome (si existe)
if ($chromePath) {
    Write-Host "`n📝 Creando regla de salida para Chrome..." -ForegroundColor Cyan
    $chromeRuleName = "Chrome - Conexiones Salientes HTTPS"
    
    netsh advfirewall firewall delete rule name="$chromeRuleName" 2>$null | Out-Null
    netsh advfirewall firewall add rule name="$chromeRuleName" dir=out action=allow program="$chromePath" enable=yes protocol=TCP localport=any remoteport=443,80 description="Permitir conexiones HTTPS/HTTP salientes para Chrome (Puppeteer)" | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Regla creada exitosamente: $chromeRuleName" -ForegroundColor Green
    } else {
        Write-Host "❌ Error creando regla para Chrome" -ForegroundColor Red
    }
}

# Crear regla para permitir conexiones salientes a puerto 443 en general (si es necesario)
Write-Host "`n📝 Verificando reglas de puerto 443..." -ForegroundColor Cyan
$portRule = netsh advfirewall firewall show rule name="Node.js HTTPS Outbound" 2>$null
if (-not $portRule) {
    Write-Host "⚠️  Considera crear regla general para puerto 443 si los problemas persisten" -ForegroundColor Yellow
}

Write-Host "`n✅ Proceso completado!" -ForegroundColor Green
Write-Host "`n💡 Próximos pasos:" -ForegroundColor Cyan
Write-Host "   1. Verificar reglas en 'Firewall de Windows Defender con seguridad avanzada'" -ForegroundColor White
Write-Host "   2. Ejecutar: npm run diagnose:connectivity" -ForegroundColor White
Write-Host "   3. Si persiste, verificar antivirus" -ForegroundColor White

