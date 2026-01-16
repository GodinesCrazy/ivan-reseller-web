# PowerShell script para probar endpoints OAuth de AliExpress en producción
# Uso: .\scripts\prod_oauth_debug_probe.ps1

$ErrorActionPreference = "Stop"

# Configuración
$PROD_URL = "https://www.ivanreseller.com"
$DEBUG_KEY = $env:DEBUG_KEY  # Debe estar configurado en Railway

# Crear directorio de reportes si no existe
$REPORT_DIR = "docs"
if (-not (Test-Path $REPORT_DIR)) {
    New-Item -ItemType Directory -Path $REPORT_DIR | Out-Null
}

$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$REPORT_FILE = "$REPORT_DIR/PROD_OAUTH_DEBUG.md"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "AliExpress OAuth Debug Probe - Production" -ForegroundColor Cyan
Write-Host "Timestamp: $TIMESTAMP" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Función para hacer requests HTTP
function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [switch]$FollowRedirects = $false
    )
    
    try {
        if ($FollowRedirects) {
            # Para seguir redirects, usamos Invoke-WebRequest con -MaximumRedirection 0 para capturar Location
            $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -MaximumRedirection 0 -ErrorAction SilentlyContinue
            return @{
                StatusCode = $response.StatusCode
                Headers = $response.Headers
                Content = $response.Content
                Success = $true
            }
        } else {
            $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers
            return @{
                StatusCode = $response.StatusCode
                Headers = $response.Headers
                Content = $response.Content
                Success = $true
            }
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 302 -or $statusCode -eq 301 -or $statusCode -eq 307) {
            # Capturar Location header en redirects
            $location = $_.Exception.Response.Headers.Location
            return @{
                StatusCode = $statusCode
                Headers = @{ Location = $location }
                Content = ""
                Success = $true
                IsRedirect = $true
                Location = $location
            }
        }
        return @{
            StatusCode = $statusCode
            Content = $_.Exception.Message
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

# ============================================
# Test 1: OAuth Debug Endpoint
# ============================================
Write-Host "[1/2] Testing /api/aliexpress/oauth-debug..." -ForegroundColor Yellow

$debugHeaders = @{
    "Content-Type" = "application/json"
}

if ($DEBUG_KEY) {
    $debugHeaders["X-Debug-Key"] = $DEBUG_KEY
    Write-Host "   Using X-Debug-Key header" -ForegroundColor Gray
} else {
    Write-Host "   WARNING: DEBUG_KEY not set in environment" -ForegroundColor Yellow
}

$debugResponse = Invoke-ApiRequest -Method "GET" -Url "$PROD_URL/api/aliexpress/oauth-debug" -Headers $debugHeaders

Write-Host "   Status: $($debugResponse.StatusCode)" -ForegroundColor $(if ($debugResponse.Success) { "Green" } else { "Red" })

$debugResult = @{
    Timestamp = $TIMESTAMP
    Endpoint = "/api/aliexpress/oauth-debug"
    StatusCode = $debugResponse.StatusCode
    Success = $debugResponse.Success
    HasDebugKey = [bool]$DEBUG_KEY
}

if ($debugResponse.Success -and $debugResponse.Content) {
    try {
        $debugData = $debugResponse.Content | ConvertFrom-Json
        $debugResult.Data = $debugData
        Write-Host "   AppKey Masked: $($debugData.data.appKeyMasked)" -ForegroundColor Cyan
        Write-Host "   AppKey Length: $($debugData.data.appKeyLength)" -ForegroundColor Cyan
        Write-Host "   Callback URL: $($debugData.data.callbackUrl)" -ForegroundColor Cyan
        Write-Host "   Env Source: $($debugData.data.envSource)" -ForegroundColor Cyan
    } catch {
        Write-Host "   Error parsing JSON: $_" -ForegroundColor Red
        $debugResult.ParseError = $_.Exception.Message
    }
} else {
    Write-Host "   Error: $($debugResponse.Error)" -ForegroundColor Red
    $debugResult.Error = $debugResponse.Error
}

Write-Host ""

# ============================================
# Test 2: OAuth Initiate Endpoint (capture Location header)
# ============================================
Write-Host "[2/2] Testing /api/aliexpress/auth (capturing redirect)..." -ForegroundColor Yellow

$authResponse = Invoke-ApiRequest -Method "GET" -Url "$PROD_URL/api/aliexpress/auth" -FollowRedirects

$authResult = @{
    Timestamp = $TIMESTAMP
    Endpoint = "/api/aliexpress/auth"
    StatusCode = $authResponse.StatusCode
    Success = $authResponse.Success
    IsRedirect = $authResponse.IsRedirect
}

if ($authResponse.IsRedirect -and $authResponse.Location) {
    $redirectUrl = $authResponse.Location
    $authResult.RedirectLocation = $redirectUrl
    
    # Parse redirect URL to extract app_key
    try {
        $uri = [System.Uri]$redirectUrl
        $queryParams = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
        $appKey = $queryParams["client_id"]
        
        if ($appKey) {
            $appKeyMasked = if ($appKey.Length -ge 6) {
                "$($appKey.Substring(0, 4))**$($appKey.Substring($appKey.Length - 2))"
            } else {
                "******"
            }
            
            $authResult.AppKeyFromRedirect = $appKeyMasked
            $authResult.AppKeyLength = $appKey.Length
            $authResult.CallbackFromRedirect = $queryParams["redirect_uri"]
            
            Write-Host "   Status: $($authResponse.StatusCode) (Redirect)" -ForegroundColor Green
            Write-Host "   AppKey in redirect: $appKeyMasked" -ForegroundColor Cyan
            Write-Host "   AppKey length: $($appKey.Length)" -ForegroundColor Cyan
            Write-Host "   Callback in redirect: $($queryParams['redirect_uri'])" -ForegroundColor Cyan
            
            # Sanitize redirect URL for logging
            $sanitizedRedirect = $redirectUrl -replace '(client_secret|secret|sign|token)=[^&]*', '$1=***'
            Write-Host "   Redirect URL (sanitized): $sanitizedRedirect" -ForegroundColor Gray
        } else {
            Write-Host "   WARNING: No client_id found in redirect URL" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   Error parsing redirect URL: $_" -ForegroundColor Red
        $authResult.ParseError = $_.Exception.Message
    }
} else {
    Write-Host "   Status: $($authResponse.StatusCode)" -ForegroundColor $(if ($authResponse.Success) { "Green" } else { "Red" })
    if (-not $authResponse.Success) {
        Write-Host "   Error: $($authResponse.Error)" -ForegroundColor Red
        $authResult.Error = $authResponse.Error
    }
}

Write-Host ""

# ============================================
# Generate Report
# ============================================
Write-Host "Generating report: $REPORT_FILE" -ForegroundColor Cyan

$reportContent = @"
# AliExpress OAuth Debug Report

**Fecha/Hora:** $TIMESTAMP  
**Probe Script:** \`scripts/prod_oauth_debug_probe.ps1\`

---

## Resumen Ejecutivo

### Test 1: OAuth Debug Endpoint
- **Endpoint:** \`/api/aliexpress/oauth-debug\`
- **Status:** $($debugResult.StatusCode)
- **Éxito:** $(if ($debugResult.Success) { "✅ SÍ" } else { "❌ NO" })
- **Debug Key Configurado:** $(if ($debugResult.HasDebugKey) { "✅ SÍ" } else { "❌ NO" })

### Test 2: OAuth Initiate Endpoint
- **Endpoint:** \`/api/aliexpress/auth\`
- **Status:** $($authResult.StatusCode)
- **Éxito:** $(if ($authResult.Success) { "✅ SÍ" } else { "❌ NO" })
- **Redirect Detectado:** $(if ($authResult.IsRedirect) { "✅ SÍ" } else { "❌ NO" })

---

## Evidencia Detallada

### 1. OAuth Debug Endpoint Response

\`\`\`json
$(if ($debugResult.Data) { $debugResult.Data | ConvertTo-Json -Depth 10 } else { "No data available" })
\`\`\`

**Interpretación:**
$(if ($debugResult.Data) {
"- AppKey usado: \`$($debugResult.Data.data.appKeyMasked)\`
- Longitud AppKey: \`$($debugResult.Data.data.appKeyLength)\`
- Callback URL: \`$($debugResult.Data.data.callbackUrl)\`
- Fuente de configuración: \`$($debugResult.Data.data.envSource)\`"
} else {
"- ❌ No se pudo obtener información del endpoint debug"
})

### 2. OAuth Redirect Analysis

**Location Header (sanitizado):**
\`\`\`
$(if ($authResult.RedirectLocation) {
    $authResult.RedirectLocation -replace '(client_secret|secret|sign|token)=[^&]*', '$1=***'
} else {
    "No redirect location found"
})
\`\`\`

**Parámetros Extraídos:**
$(if ($authResult.AppKeyFromRedirect) {
"- AppKey en redirect: \`$($authResult.AppKeyFromRedirect)\`
- Longitud AppKey: \`$($authResult.AppKeyLength)\`
- Callback en redirect: \`$($authResult.CallbackFromRedirect)\`"
} else {
"- ❌ No se pudo extraer AppKey del redirect URL"
})

---

## Análisis Root Cause

### Validación de AppKey

**AppKey Esperado (Railway):** \`524880\` (AliExpress Affiliates)

**AppKey Detectado:**
$(if ($debugResult.Data -and $debugResult.Data.data.appKeyMasked) {
    $detected = $debugResult.Data.data.appKeyMasked
    $expected = "5248**80"
    if ($detected -eq $expected) {
        "- ✅ **CORRECTO:** AppKey coincide con esperado (\`$detected\` = \`$expected\`)"
    } else {
        "- ❌ **INCORRECTO:** AppKey NO coincide (\`$detected\` ≠ \`$expected\`)"
    }
} else {
    "- ⚠️ **NO DETERMINADO:** No se pudo obtener AppKey del endpoint debug"
})

$(if ($authResult.AppKeyFromRedirect) {
    $detectedFromRedirect = $authResult.AppKeyFromRedirect
    $expectedFromRedirect = "5248**80"
    if ($detectedFromRedirect -eq $expectedFromRedirect) {
        "- ✅ **CONFIRMADO EN REDIRECT:** AppKey en redirect coincide (\`$detectedFromRedirect\` = \`$expectedFromRedirect\`)"
    } else {
        "- ❌ **MISMATCH EN REDIRECT:** AppKey en redirect NO coincide (\`$detectedFromRedirect\` ≠ \`$expectedFromRedirect\`)"
    }
})

### Conclusión Root Cause

$(if ($debugResult.Data -and $authResult.AppKeyFromRedirect) {
    $debugAppKey = $debugResult.Data.data.appKeyMasked
    $redirectAppKey = $authResult.AppKeyFromRedirect
    $expected = "5248**80"
    
    if ($debugAppKey -eq $expected -and $redirectAppKey -eq $expected) {
        @"
**✅ AppKey CORRECTO en ambos endpoints**

El backend está enviando el AppKey correcto (\`524880\`) en el redirect OAuth.

**PROBLEMA ES EXTERNO (AliExpress):**
- El error \`param-appkey.not.exists\` / \`appkey不存在\` indica que:
  1. La AppKey \`524880\` NO está activada en AliExpress Affiliate Program
  2. El proceso "Apply Online" en AliExpress no ha sido completado
  3. Los permisos OAuth no han sido concedidos para esta AppKey
  4. El segmento OAuth no está habilitado para esta aplicación

**PRÓXIMOS PASOS MANUALES:**
1. Verificar en [AliExpress Affiliate Program](https://portals.aliexpress.com/) que la AppKey \`524880\` esté registrada
2. Completar el proceso "Apply Online" si está pendiente
3. Verificar que los permisos OAuth estén habilitados
4. Contactar soporte de AliExpress si la AppKey está activa pero OAuth falla
"@
    } else {
        @"
**❌ AppKey INCORRECTO detectado**

El backend está enviando un AppKey diferente al esperado.

**PROBLEMA ES INTERNO (Backend):**
- Debug endpoint muestra: \`$debugAppKey\`
- Redirect muestra: \`$redirectAppKey\`
- Esperado: \`$expected\`

**POSIBLE CAUSA:**
- Variable \`ALIEXPRESS_APP_KEY\` en Railway no está configurada correctamente
- Está usando una AppKey antigua (DropShipping: \`522578\`) en lugar de Affiliates (\`524880\`)

**PRÓXIMOS PASOS:**
1. Verificar en Railway Dashboard → Variables → \`ALIEXPRESS_APP_KEY\` = \`524880\`
2. Reiniciar servicio después de cambiar variable
3. Re-ejecutar este probe para validar fix
"@
    }
} else {
    @"
**⚠️ NO DETERMINADO**

No se pudo obtener suficiente información para determinar el root cause.

**PRÓXIMOS PASOS:**
1. Verificar que \`DEBUG_KEY\` esté configurado en Railway
2. Re-ejecutar este probe
3. Revisar logs del backend en Railway
"@
})

---

## Recomendaciones

1. **Si AppKey es correcto (524880):**
   - Proceder con configuración en AliExpress Affiliate Program
   - Completar proceso "Apply Online"
   - Verificar permisos OAuth

2. **Si AppKey es incorrecto:**
   - Actualizar \`ALIEXPRESS_APP_KEY\` en Railway a \`524880\`
   - Reiniciar servicio
   - Re-validar con este probe

3. **Monitoreo Continuo:**
   - Ejecutar este probe después de cada deploy
   - Verificar que AppKey no cambie accidentalmente
   - Mantener documentación actualizada

---

## Metadata

- **Probe Script:** \`scripts/prod_oauth_debug_probe.ps1\`
- **Timestamp:** $TIMESTAMP
- **Production URL:** $PROD_URL
- **Debug Key Configurado:** $(if ($DEBUG_KEY) { "✅ SÍ" } else { "❌ NO" })

---

*Este reporte fue generado automáticamente por el probe script.*

"@

# Write report to file
$reportContent | Out-File -FilePath $REPORT_FILE -Encoding UTF8

Write-Host "✅ Report generated: $REPORT_FILE" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

if ($debugResult.Success -and $authResult.Success) {
    Write-Host "✅ All tests completed successfully" -ForegroundColor Green
} else {
    Write-Host "⚠️ Some tests failed. Check report for details." -ForegroundColor Yellow
}

if ($debugResult.Data -and $authResult.AppKeyFromRedirect) {
    $appKeyMatch = $debugResult.Data.data.appKeyMasked -eq $authResult.AppKeyFromRedirect
    if ($appKeyMatch) {
        Write-Host "✅ AppKey consistent between endpoints" -ForegroundColor Green
    } else {
        Write-Host "⚠️ AppKey mismatch detected!" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Report saved to: $REPORT_FILE" -ForegroundColor Cyan
Write-Host ""

