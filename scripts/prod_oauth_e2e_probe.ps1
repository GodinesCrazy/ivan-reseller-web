# AliExpress OAuth E2E Production Probe Script
# Valida que el endpoint oauth-redirect-url funcione correctamente
# y que clientIdTail sea "4880" (últimos 4 dígitos de AppKey 524880)

$ErrorActionPreference = "Stop"

# Colores para output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

Write-ColorOutput Green "=========================================="
Write-ColorOutput Green "AliExpress OAuth E2E Production Probe"
Write-ColorOutput Green "=========================================="
Write-Output ""

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC"
Write-Output "Timestamp: $timestamp"
Write-Output ""

# Configuración
$baseUrl = "https://www.ivanreseller.com"
$endpoint = "$baseUrl/api/aliexpress/oauth-redirect-url"
$debugKey = $env:DEBUG_KEY

if (-not $debugKey) {
    Write-ColorOutput Yellow "⚠️  WARNING: DEBUG_KEY no está configurado en variables de entorno"
    Write-ColorOutput Yellow "   El script intentará sin X-Debug-Key (puede fallar en producción)"
    Write-Output ""
    $headers = @{}
} else {
    Write-Output "✅ DEBUG_KEY encontrado en variables de entorno"
    $headers = @{
        "X-Debug-Key" = $debugKey
    }
    Write-Output ""
}

# Realizar request
Write-Output "🔍 Ejecutando request a: $endpoint"
Write-Output ""

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Get -Headers $headers -ErrorAction Stop
    
    Write-ColorOutput Green "✅ Request exitoso"
    Write-Output ""
    
    # Validar estructura de respuesta
    if (-not $response.success) {
        Write-ColorOutput Red "❌ ERROR: Response.success es false"
        Write-Output "Response: $($response | ConvertTo-Json -Depth 10)"
        exit 1
    }
    
    if (-not $response.data) {
        Write-ColorOutput Red "❌ ERROR: Response.data no existe"
        Write-Output "Response: $($response | ConvertTo-Json -Depth 10)"
        exit 1
    }
    
    $data = $response.data
    
    # Validar campos requeridos
    $requiredFields = @("oauthBaseUrl", "clientIdMasked", "clientIdTail", "redirectUri", "scope", "stateLength")
    $missingFields = @()
    
    foreach ($field in $requiredFields) {
        if (-not $data.$field) {
            $missingFields += $field
        }
    }
    
    if ($missingFields.Count -gt 0) {
        Write-ColorOutput Red "❌ ERROR: Campos faltantes en response.data: $($missingFields -join ', ')"
        Write-Output "Response: $($response | ConvertTo-Json -Depth 10)"
        exit 1
    }
    
    Write-Output "📊 Datos recibidos:"
    Write-Output "   oauthBaseUrl: $($data.oauthBaseUrl)"
    Write-Output "   clientIdMasked: $($data.clientIdMasked)"
    Write-Output "   clientIdTail: $($data.clientIdTail)"
    Write-Output "   redirectUri: $($data.redirectUri)"
    Write-Output "   scope: $($data.scope)"
    Write-Output "   stateLength: $($data.stateLength)"
    Write-Output ""
    
    # Validación crítica: clientIdTail debe ser "4880"
    if ($data.clientIdTail -ne "4880") {
        Write-ColorOutput Red "❌ VALIDATION FAILED: clientIdTail es '$($data.clientIdTail)', se esperaba '4880'"
        Write-ColorOutput Red "   Esto indica que el AppKey no es 524880 o está mal configurado"
        Write-Output ""
        
        # Registrar en documento de evidencia
        $evidenceFile = "docs/OAUTH_E2E_PROD_EVIDENCE.md"
        if (Test-Path $evidenceFile) {
            $evidenceContent = Get-Content $evidenceFile -Raw
            $newSection = @"

## FASE 2 — Resultado del Probe Script

**Fecha/Hora:** $timestamp

**Resultado:** ❌ **FAIL**

**Razón:** `clientIdTail` es `$($data.clientIdTail)`, se esperaba `4880`

**Datos recibidos:**
- oauthBaseUrl: $($data.oauthBaseUrl)
- clientIdMasked: $($data.clientIdMasked)
- clientIdTail: $($data.clientIdTail) ❌
- redirectUri: $($data.redirectUri)
- scope: $($data.scope)
- stateLength: $($data.stateLength)

**Conclusión:** El AppKey configurado no es 524880 o está mal configurado.

"@
            $evidenceContent += $newSection
            Set-Content -Path $evidenceFile -Value $evidenceContent
            Write-Output "📝 Resultado registrado en $evidenceFile"
        }
        
        exit 1
    }
    
    Write-ColorOutput Green "✅ VALIDATION PASSED: clientIdTail es '4880' (correcto)"
    Write-Output ""
    
    # Validaciones adicionales
    $allValid = $true
    
    if ($data.redirectUri -ne "https://www.ivanreseller.com/api/aliexpress/callback") {
        Write-ColorOutput Yellow "⚠️  WARNING: redirectUri no coincide con producción esperada"
        Write-Output "   Esperado: https://www.ivanreseller.com/api/aliexpress/callback"
        Write-Output "   Actual: $($data.redirectUri)"
        Write-Output ""
        $allValid = $false
    }
    
    if ($data.scope -ne "api") {
        Write-ColorOutput Yellow "⚠️  WARNING: scope no es 'api'"
        Write-Output "   Esperado: api"
        Write-Output "   Actual: $($data.scope)"
        Write-Output ""
        $allValid = $false
    }
    
    if ($data.stateLength -lt 32) {
        Write-ColorOutput Yellow "⚠️  WARNING: stateLength es muy corto (debe ser >= 32 para seguridad CSRF)"
        Write-Output "   Actual: $($data.stateLength)"
        Write-Output ""
        $allValid = $false
    }
    
    # Registrar resultado exitoso en documento de evidencia
    $evidenceFile = "docs/OAUTH_E2E_PROD_EVIDENCE.md"
    if (Test-Path $evidenceFile) {
        $evidenceContent = Get-Content $evidenceFile -Raw
        $newSection = @"

## FASE 2 — Resultado del Probe Script

**Fecha/Hora:** $timestamp

**Resultado:** ✅ **PASS**

**Validaciones:**
- ✅ clientIdTail: `$($data.clientIdTail)` (correcto, debe ser `4880`)
- ✅ redirectUri: `$($data.redirectUri)`
- ✅ scope: `$($data.scope)`
- ✅ stateLength: `$($data.stateLength)` (suficiente para CSRF protection)
- ✅ oauthBaseUrl: `$($data.oauthBaseUrl)`

**Conclusión:** El endpoint funciona correctamente y el AppKey configurado es 524880.

"@
        $evidenceContent += $newSection
        Set-Content -Path $evidenceFile -Value $evidenceContent
        Write-Output "📝 Resultado registrado en $evidenceFile"
    }
    
    Write-Output ""
    Write-ColorOutput Green "=========================================="
    Write-ColorOutput Green "✅ PROBE COMPLETADO EXITOSAMENTE"
    Write-ColorOutput Green "=========================================="
    
    exit 0
    
} catch {
    $errorMessage = $_.Exception.Message
    $statusCode = $_.Exception.Response.StatusCode.value__
    
    Write-ColorOutput Red "❌ ERROR: Request falló"
    Write-Output "   Status Code: $statusCode"
    Write-Output "   Error: $errorMessage"
    Write-Output ""
    
    if ($statusCode -eq 403) {
        Write-ColorOutput Yellow "⚠️  Posible causa: X-Debug-Key inválido o no configurado"
        Write-Output "   Verifica que DEBUG_KEY esté configurado en variables de entorno"
        Write-Output "   y que coincida con el valor en Railway/Vercel"
    }
    
    # Registrar error en documento de evidencia
    $evidenceFile = "docs/OAUTH_E2E_PROD_EVIDENCE.md"
    if (Test-Path $evidenceFile) {
        $evidenceContent = Get-Content $evidenceFile -Raw
        $newSection = @"

## FASE 2 — Resultado del Probe Script

**Fecha/Hora:** $timestamp

**Resultado:** ❌ **FAIL**

**Error:**
- Status Code: $statusCode
- Message: $errorMessage

**Posible causa:** X-Debug-Key inválido o no configurado en producción.

"@
        $evidenceContent += $newSection
        Set-Content -Path $evidenceFile -Value $evidenceContent
        Write-Output "📝 Error registrado en $evidenceFile"
    }
    
    exit 1
}

