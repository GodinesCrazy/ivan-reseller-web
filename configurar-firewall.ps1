<# 
.SYNOPSIS
    Configurar Firewall de Windows para Ivan Reseller System
    
.DESCRIPTION
    Este script configura automáticamente las reglas de Firewall necesarias
    para permitir acceso externo al sistema Ivan Reseller (puertos 3000 y 5173)
    
.NOTES
    - Requiere ejecución como ADMINISTRADOR
    - Versión: 1.0
    - Última actualización: Octubre 2025
#>

# Verificar si se ejecuta como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host ""
    Write-Host "================================" -ForegroundColor Red
    Write-Host "  ⚠️  REQUIERE ADMINISTRADOR" -ForegroundColor Red
    Write-Host "================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Este script debe ejecutarse como ADMINISTRADOR" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Cómo ejecutar como administrador:" -ForegroundColor Cyan
    Write-Host "1. Click derecho en este archivo" -ForegroundColor White
    Write-Host "2. Seleccionar 'Ejecutar con PowerShell'" -ForegroundColor White
    Write-Host "3. O abrir PowerShell como Admin y ejecutar:" -ForegroundColor White
    Write-Host "   .\configurar-firewall.ps1" -ForegroundColor Green
    Write-Host ""
    pause
    exit 1
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  🛡️  CONFIGURAR FIREWALL" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Función para verificar si una regla existe
function Test-FirewallRule {
    param([string]$DisplayName)
    $rule = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
    return $null -ne $rule
}

# Función para crear/actualizar regla de firewall
function Set-FirewallRule {
    param(
        [string]$DisplayName,
        [int]$Port,
        [string]$Description
    )
    
    Write-Host "Configurando: $DisplayName (Puerto $Port)" -ForegroundColor Yellow
    
    # Eliminar regla existente si existe
    if (Test-FirewallRule -DisplayName $DisplayName) {
        Write-Host "  - Eliminando regla existente..." -ForegroundColor Gray
        Remove-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
    }
    
    # Crear nueva regla
    try {
        New-NetFirewallRule `
            -DisplayName $DisplayName `
            -Description $Description `
            -Direction Inbound `
            -LocalPort $Port `
            -Protocol TCP `
            -Action Allow `
            -Profile Any `
            -Enabled True `
            -ErrorAction Stop | Out-Null
        
        Write-Host "  ✅ Regla creada exitosamente" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "  ❌ Error al crear regla: $_" -ForegroundColor Red
        return $false
    }
}

# Banner
Write-Host "Este script configurará el Firewall de Windows para permitir" -ForegroundColor White
Write-Host "acceso externo al sistema Ivan Reseller en los puertos:" -ForegroundColor White
Write-Host ""
Write-Host "  • Puerto 5173 (Frontend - React)" -ForegroundColor Cyan
Write-Host "  • Puerto 3000 (Backend - API)" -ForegroundColor Cyan
Write-Host ""

# Confirmar
$confirm = Read-Host "¿Deseas continuar? (S/N)"
if ($confirm -notmatch '^[SsYy]') {
    Write-Host ""
    Write-Host "Operación cancelada" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 0
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# Configurar reglas
$success = $true

# Regla 1: Frontend (Puerto 5173)
$success = $success -and (Set-FirewallRule `
    -DisplayName "Ivan Reseller - Frontend (5173)" `
    -Port 5173 `
    -Description "Permite acceso al frontend React de Ivan Reseller en puerto 5173")

Write-Host ""

# Regla 2: Backend (Puerto 3000)
$success = $success -and (Set-FirewallRule `
    -DisplayName "Ivan Reseller - Backend (3000)" `
    -Port 3000 `
    -Description "Permite acceso a la API backend de Ivan Reseller en puerto 3000")

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# Verificar reglas creadas
Write-Host "Verificando reglas creadas:" -ForegroundColor Yellow
Write-Host ""

$rules = Get-NetFirewallRule | Where-Object {$_.DisplayName -like "Ivan Reseller*"} | Select-Object DisplayName, Enabled, Direction, Action

if ($rules) {
    $rules | ForEach-Object {
        $status = if ($_.Enabled) { "✅ Habilitada" } else { "❌ Deshabilitada" }
        Write-Host "  $status - $($_.DisplayName)" -ForegroundColor $(if ($_.Enabled) { "Green" } else { "Red" })
    }
}
else {
    Write-Host "  ⚠️  No se encontraron reglas" -ForegroundColor Yellow
    $success = $false
}

Write-Host ""

# Obtener información de red
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 Información de Red:" -ForegroundColor Cyan
Write-Host ""

# IP Local
$ipLocal = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*"} | Select-Object -First 1).IPAddress
if ($ipLocal) {
    Write-Host "  IP Local:   $ipLocal" -ForegroundColor White
    Write-Host "  URL Local:  http://${ipLocal}:5173" -ForegroundColor Green
}
else {
    Write-Host "  IP Local:   No detectada" -ForegroundColor Yellow
}

Write-Host ""

# IP Pública
Write-Host "  Obteniendo IP pública..." -ForegroundColor Gray
try {
    $ipPublica = (Invoke-RestMethod -Uri "https://api.ipify.org?format=text" -TimeoutSec 5).Trim()
    Write-Host "  IP Pública: $ipPublica" -ForegroundColor White
    Write-Host "  URL Pública: http://${ipPublica}:5173" -ForegroundColor Green
    Write-Host ""
    Write-Host "  ⚠️  IMPORTANTE: Debes configurar Port Forwarding en tu router" -ForegroundColor Yellow
    Write-Host "     Puertos a abrir: 3000, 5173" -ForegroundColor Yellow
}
catch {
    Write-Host "  IP Pública: No se pudo obtener (sin internet?)" -ForegroundColor Yellow
}

Write-Host ""

# Verificar puertos en uso
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "📡 Estado de Puertos:" -ForegroundColor Cyan
Write-Host ""

$port3000 = netstat -an | Select-String ":3000.*LISTENING"
$port5173 = netstat -an | Select-String ":5173.*LISTENING"

if ($port3000) {
    Write-Host "  ✅ Puerto 3000 (Backend):  ACTIVO" -ForegroundColor Green
}
else {
    Write-Host "  ⚪ Puerto 3000 (Backend):  Inactivo (iniciar backend)" -ForegroundColor Gray
}

if ($port5173) {
    Write-Host "  ✅ Puerto 5173 (Frontend): ACTIVO" -ForegroundColor Green
}
else {
    Write-Host "  ⚪ Puerto 5173 (Frontend): Inactivo (iniciar frontend)" -ForegroundColor Gray
}

Write-Host ""

# Resumen final
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

if ($success) {
    Write-Host "✅ CONFIGURACIÓN COMPLETADA" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Configurar Port Forwarding en tu router:" -ForegroundColor White
    Write-Host "   - Abre http://192.168.1.1 (o IP de tu router)" -ForegroundColor Gray
    Write-Host "   - Busca 'Port Forwarding' o 'Virtual Server'" -ForegroundColor Gray
    Write-Host "   - Añade reglas para puertos 3000 y 5173" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Si no está corriendo, inicia el sistema:" -ForegroundColor White
    Write-Host "   .\iniciar-sistema.bat" -ForegroundColor Green
    Write-Host ""
    Write-Host "3. Accede desde cualquier dispositivo:" -ForegroundColor White
    if ($ipLocal) {
        Write-Host "   Red Local: http://${ipLocal}:5173" -ForegroundColor Green
    }
    if ($ipPublica) {
        Write-Host "   Internet:  http://${ipPublica}:5173" -ForegroundColor Green
    }
}
else {
    Write-Host "⚠️  CONFIGURACIÓN INCOMPLETA" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Algunas reglas no se pudieron crear." -ForegroundColor Yellow
    Write-Host "Verifica los errores arriba e intenta nuevamente." -ForegroundColor White
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# Opciones adicionales
Write-Host "Opciones adicionales:" -ForegroundColor Cyan
Write-Host ""
Write-Host "[1] Ver todas las reglas de Ivan Reseller" -ForegroundColor White
Write-Host "[2] Eliminar reglas de Ivan Reseller" -ForegroundColor White
Write-Host "[3] Verificar puertos abiertos" -ForegroundColor White
Write-Host "[4] Salir" -ForegroundColor White
Write-Host ""

$opcion = Read-Host "Selecciona una opción (1-4)"

switch ($opcion) {
    "1" {
        Write-Host ""
        Write-Host "Reglas de Ivan Reseller:" -ForegroundColor Yellow
        Get-NetFirewallRule | Where-Object {$_.DisplayName -like "Ivan Reseller*"} | Format-Table DisplayName, Enabled, Direction, Action, Profile -AutoSize
    }
    "2" {
        Write-Host ""
        $confirm = Read-Host "¿Estás seguro de eliminar las reglas? (S/N)"
        if ($confirm -match '^[SsYy]') {
            Get-NetFirewallRule | Where-Object {$_.DisplayName -like "Ivan Reseller*"} | Remove-NetFirewallRule
            Write-Host "✅ Reglas eliminadas" -ForegroundColor Green
        }
    }
    "3" {
        Write-Host ""
        Write-Host "Puertos en LISTENING:" -ForegroundColor Yellow
        netstat -an | Select-String "LISTENING" | Select-String ":3000|:5173"
    }
    default {
        # No hacer nada, salir
    }
}

Write-Host ""
pause
