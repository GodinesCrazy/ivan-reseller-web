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
Write-Host ""
Write-Host "📝 Creando regla de salida para Node.js..." -ForegroundColor Cyan
$ruleName = "Node.js - Conexiones Salientes HTTPS"
$ruleDesc = "Permitir conexiones HTTPS/HTTP salientes para Node.js"

# Eliminar regla existente si existe
$null = netsh advfirewall firewall delete rule name="$ruleName" 2>$null

# Crear nueva regla
$command = "netsh advfirewall firewall add rule name=`"$ruleName`" dir=out action=allow program=`"$nodePath`" enable=yes protocol=TCP localport=any remoteport=443,80"
$result = Invoke-Expression $command 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Regla creada exitosamente: $ruleName" -ForegroundColor Green
} else {
    Write-Host "❌ Error creando regla para Node.js" -ForegroundColor Red
    Write-Host "   Detalles: $result" -ForegroundColor Yellow
}

# Crear regla para Chrome (si existe)
if ($chromePath) {
    Write-Host ""
    Write-Host "📝 Creando regla de salida para Chrome..." -ForegroundColor Cyan
    $chromeRuleName = "Chrome - Conexiones Salientes HTTPS"
    
    $null = netsh advfirewall firewall delete rule name="$chromeRuleName" 2>$null
    
    $chromeCommand = "netsh advfirewall firewall add rule name=`"$chromeRuleName`" dir=out action=allow program=`"$chromePath`" enable=yes protocol=TCP localport=any remoteport=443,80"
    $chromeResult = Invoke-Expression $chromeCommand 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Regla creada exitosamente: $chromeRuleName" -ForegroundColor Green
    } else {
        Write-Host "❌ Error creando regla para Chrome" -ForegroundColor Red
        Write-Host "   Detalles: $chromeResult" -ForegroundColor Yellow
    }
}

# Verificar reglas
Write-Host ""
Write-Host "📝 Verificando reglas creadas..." -ForegroundColor Cyan
$existingRules = netsh advfirewall firewall show rule name=all | Select-String "Node.js"
if ($existingRules) {
    Write-Host "✅ Reglas de Node.js encontradas en firewall" -ForegroundColor Green
} else {
    Write-Host "⚠️  No se encontraron reglas de Node.js" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Proceso completado!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Próximos pasos:" -ForegroundColor Cyan
Write-Host "   1. Verificar reglas en 'Firewall de Windows Defender con seguridad avanzada'" -ForegroundColor White
Write-Host "   2. Ejecutar: npm run diagnose:connectivity" -ForegroundColor White
Write-Host "   3. Si persiste, verificar antivirus" -ForegroundColor White
