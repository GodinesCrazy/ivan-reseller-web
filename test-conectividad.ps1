<#
.SYNOPSIS
    Test de Conectividad - Ivan Reseller System
    
.DESCRIPTION
    Script para verificar que el sistema sea accesible desde red local e internet
    
.NOTES
    Versión: 1.0
    Última actualización: Octubre 2025
#>

param(
    [switch]$Full  # Realizar test completo incluyendo test desde internet
)

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  🔍 TEST DE CONECTIVIDAD" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Función para test HTTP
function Test-HttpEndpoint {
    param(
        [string]$Url,
        [string]$Name,
        [int]$TimeoutSec = 5
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow
    Write-Host "  URL: $Url" -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✅ ACCESIBLE (HTTP $($response.StatusCode))" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "  ⚠️  Responde pero código: $($response.StatusCode)" -ForegroundColor Yellow
            return $false
        }
    }
    catch {
        Write-Host "  ❌ NO ACCESIBLE" -ForegroundColor Red
        Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
        return $false
    }
}

# Función para test de puerto
function Test-Port {
    param(
        [string]$Computer,
        [int]$Port,
        [int]$TimeoutMilliseconds = 2000
    )
    
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcpClient.BeginConnect($Computer, $Port, $null, $null)
        $wait = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)
        
        if ($wait) {
            $tcpClient.EndConnect($asyncResult)
            $tcpClient.Close()
            return $true
        }
        else {
            $tcpClient.Close()
            return $false
        }
    }
    catch {
        return $false
    }
}

# ============================================
# 1. INFORMACIÓN DE RED
# ============================================

Write-Host "📊 INFORMACIÓN DE RED" -ForegroundColor Cyan
Write-Host ""

# IP Local
$ipLocal = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*"} | Select-Object -First 1).IPAddress
if ($ipLocal) {
    Write-Host "  IP Local:    $ipLocal" -ForegroundColor White
    $urlLocal = "http://${ipLocal}:5173"
}
else {
    Write-Host "  IP Local:    No detectada" -ForegroundColor Yellow
    $urlLocal = $null
}

# IP Pública
Write-Host "  Obteniendo IP pública..." -ForegroundColor Gray
try {
    $ipPublica = (Invoke-RestMethod -Uri "https://api.ipify.org?format=text" -TimeoutSec 5).Trim()
    Write-Host "  IP Pública:  $ipPublica" -ForegroundColor White
    $urlPublica = "http://${ipPublica}:5173"
}
catch {
    Write-Host "  IP Pública:  No disponible" -ForegroundColor Yellow
    $urlPublica = $null
}

Write-Host ""

# ============================================
# 2. TEST DE PUERTOS LOCALES
# ============================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "🔌 TEST DE PUERTOS LOCALES" -ForegroundColor Cyan
Write-Host ""

$port3000Running = $false
$port5173Running = $false

# Puerto 3000 (Backend)
Write-Host "Puerto 3000 (Backend API):" -ForegroundColor Yellow
$listening = netstat -an | Select-String ":3000.*LISTENING"
if ($listening) {
    Write-Host "  ✅ LISTENING" -ForegroundColor Green
    $port3000Running = $true
    
    # Test de conexión
    if (Test-Port -Computer "localhost" -Port 3000) {
        Write-Host "  ✅ Conexión exitosa" -ForegroundColor Green
    }
}
else {
    Write-Host "  ❌ NO ESTÁ CORRIENDO" -ForegroundColor Red
    Write-Host "     Ejecuta: cd backend && npm run dev" -ForegroundColor Gray
}

Write-Host ""

# Puerto 5173 (Frontend)
Write-Host "Puerto 5173 (Frontend):" -ForegroundColor Yellow
$listening = netstat -an | Select-String ":5173.*LISTENING"
if ($listening) {
    Write-Host "  ✅ LISTENING" -ForegroundColor Green
    $port5173Running = $true
    
    # Test de conexión
    if (Test-Port -Computer "localhost" -Port 5173) {
        Write-Host "  ✅ Conexión exitosa" -ForegroundColor Green
    }
}
else {
    Write-Host "  ❌ NO ESTÁ CORRIENDO" -ForegroundColor Red
    Write-Host "     Ejecuta: cd frontend && npm run dev" -ForegroundColor Gray
}

Write-Host ""

# ============================================
# 3. TEST DE ENDPOINTS HTTP
# ============================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "🌐 TEST DE ENDPOINTS HTTP" -ForegroundColor Cyan
Write-Host ""

$localhostWorks = $false
$lanWorks = $false

# Test localhost
Write-Host "[1/3] Test Localhost (127.0.0.1)" -ForegroundColor Magenta
Write-Host ""
if ($port3000Running) {
    $localhostWorks = Test-HttpEndpoint -Url "http://localhost:3000/health" -Name "Backend Health"
}
else {
    Write-Host "  ⚠️  Backend no está corriendo, saltando test" -ForegroundColor Yellow
}
Write-Host ""

if ($port5173Running) {
    $localhostFrontend = Test-HttpEndpoint -Url "http://localhost:5173" -Name "Frontend"
    $localhostWorks = $localhostWorks -and $localhostFrontend
}
else {
    Write-Host "  ⚠️  Frontend no está corriendo, saltando test" -ForegroundColor Yellow
}

Write-Host ""

# Test LAN
if ($urlLocal -and $ipLocal -ne "127.0.0.1") {
    Write-Host "[2/3] Test Red Local ($ipLocal)" -ForegroundColor Magenta
    Write-Host ""
    
    if ($port3000Running) {
        $lanWorks = Test-HttpEndpoint -Url "http://${ipLocal}:3000/health" -Name "Backend Health (LAN)"
    }
    Write-Host ""
    
    if ($port5173Running) {
        $lanFrontend = Test-HttpEndpoint -Url "http://${ipLocal}:5173" -Name "Frontend (LAN)"
        $lanWorks = $lanWorks -and $lanFrontend
    }
    Write-Host ""
}

# Test Internet (solo si se solicita)
if ($Full -and $urlPublica) {
    Write-Host "[3/3] Test Internet ($ipPublica)" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "  ⚠️  Este test verifica si tu IP pública es accesible" -ForegroundColor Yellow
    Write-Host "     Requiere Port Forwarding configurado en el router" -ForegroundColor Yellow
    Write-Host ""
    
    if ($port3000Running) {
        Test-HttpEndpoint -Url "http://${ipPublica}:3000/health" -Name "Backend Health (Internet)" | Out-Null
    }
    Write-Host ""
    
    if ($port5173Running) {
        Test-HttpEndpoint -Url "http://${ipPublica}:5173" -Name "Frontend (Internet)" | Out-Null
    }
    Write-Host ""
}
elseif (-not $Full) {
    Write-Host "[3/3] Test Internet: SALTADO" -ForegroundColor Gray
    Write-Host "  Ejecuta con -Full para test desde internet" -ForegroundColor Gray
    Write-Host "  Ejemplo: .\test-conectividad.ps1 -Full" -ForegroundColor Gray
    Write-Host ""
}

# ============================================
# 4. VERIFICAR FIREWALL
# ============================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "🛡️  REGLAS DE FIREWALL" -ForegroundColor Cyan
Write-Host ""

$firewallRules = Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Ivan Reseller*" -or $_.DisplayName -like "*Node*"}

if ($firewallRules) {
    $firewallRules | ForEach-Object {
        $status = if ($_.Enabled) { "✅" } else { "❌" }
        Write-Host "  $status $($_.DisplayName)" -ForegroundColor $(if ($_.Enabled) { "Green" } else { "Red" })
    }
}
else {
    Write-Host "  ⚠️  No se encontraron reglas de firewall" -ForegroundColor Yellow
    Write-Host "     Ejecuta: .\configurar-firewall.ps1" -ForegroundColor Gray
}

Write-Host ""

# ============================================
# 5. RESUMEN
# ============================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 RESUMEN" -ForegroundColor Cyan
Write-Host ""

# Estado de servicios
Write-Host "Estado de Servicios:" -ForegroundColor Yellow
Write-Host "  Backend (3000):  $(if ($port3000Running) { '✅ Running' } else { '❌ Stopped' })" -ForegroundColor $(if ($port3000Running) { "Green" } else { "Red" })
Write-Host "  Frontend (5173): $(if ($port5173Running) { '✅ Running' } else { '❌ Stopped' })" -ForegroundColor $(if ($port5173Running) { "Green" } else { "Red" })

Write-Host ""

# URLs de acceso
Write-Host "URLs de Acceso:" -ForegroundColor Yellow

if ($localhostWorks) {
    Write-Host "  ✅ Localhost:  http://localhost:5173" -ForegroundColor Green
}
else {
    Write-Host "  ❌ Localhost:  No accesible" -ForegroundColor Red
}

if ($lanWorks -and $urlLocal) {
    Write-Host "  ✅ Red Local:  $urlLocal" -ForegroundColor Green
}
elseif ($urlLocal) {
    Write-Host "  ⚠️  Red Local:  $urlLocal (no verificado)" -ForegroundColor Yellow
}

if ($urlPublica) {
    Write-Host "  ⚪ Internet:    $urlPublica" -ForegroundColor Gray
    Write-Host "     (requiere Port Forwarding)" -ForegroundColor Gray
}

Write-Host ""

# Recomendaciones
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 RECOMENDACIONES" -ForegroundColor Cyan
Write-Host ""

$hasIssues = $false

if (-not $port3000Running) {
    Write-Host "  • Inicia el backend: cd backend && npm run dev" -ForegroundColor Yellow
    $hasIssues = $true
}

if (-not $port5173Running) {
    Write-Host "  • Inicia el frontend: cd frontend && npm run dev" -ForegroundColor Yellow
    $hasIssues = $true
}

if (-not $firewallRules) {
    Write-Host "  • Configura el firewall: .\configurar-firewall.ps1" -ForegroundColor Yellow
    $hasIssues = $true
}

if ($urlPublica -and -not $Full) {
    Write-Host "  • Para acceso desde internet:" -ForegroundColor Yellow
    Write-Host "    1. Configura Port Forwarding en router (puertos 3000, 5173)" -ForegroundColor Gray
    Write-Host "    2. Ejecuta: .\test-conectividad.ps1 -Full" -ForegroundColor Gray
    Write-Host "    3. Si falla, revisa ACCESO_IP_PUERTO.md" -ForegroundColor Gray
}

if (-not $hasIssues -and $localhostWorks) {
    Write-Host "  ✅ Todo funcionando correctamente!" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Opción de abrir browser
if ($localhostWorks) {
    $open = Read-Host "¿Abrir navegador? (S/N)"
    if ($open -match '^[SsYy]') {
        Start-Process "http://localhost:5173"
        Write-Host ""
        Write-Host "✅ Navegador abierto" -ForegroundColor Green
    }
}

Write-Host ""
