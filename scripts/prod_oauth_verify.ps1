# Production OAuth Verification Script (PowerShell)
# Verifica que el OAuth de AliExpress usa el client_id correcto (524880)
# Genera reporte en docs/PROD_OAUTH_VERIFY.md

$ErrorActionPreference = "Continue"
$script:HasErrors = $false
$script:Results = @()

$PRODUCTION_DOMAIN = "www.ivanreseller.com"
$BASE_URL = "https://$PRODUCTION_DOMAIN"
$EXPECTED_CLIENT_ID = "524880"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host ">> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    $script:HasErrors = $true
}

function Write-Info {
    param([string]$Message)
    Write-Host "  INFO: $Message" -ForegroundColor Gray
}

# Start verification
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "PRODUCTION OAUTH VERIFICATION" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Domain: $BASE_URL" -ForegroundColor Gray
Write-Host "Expected Client ID: $EXPECTED_CLIENT_ID" -ForegroundColor Gray
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Test 1: /api/aliexpress/oauth-debug
Write-Step "Testing /api/aliexpress/oauth-debug endpoint"
$debugUrl = "$BASE_URL/api/aliexpress/oauth-debug"
Write-Info "URL: $debugUrl"
Write-Info "Note: This endpoint requires X-Debug-Key header in production"

try {
    # Try without debug key first (should fail in production with 403)
    $response = Invoke-WebRequest -Uri $debugUrl -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Info "Response Status: $($response.StatusCode)"
    if ($response.StatusCode -eq 200) {
        $json = $response.Content | ConvertFrom-Json
        if ($json.success) {
            Write-Success "oauth-debug endpoint accessible (200)"
            Write-Info "appKeyMasked: $($json.data.appKeyMasked)"
            Write-Info "envSource: $($json.data.envSource)"
            Write-Info "callbackUrl: $($json.data.callbackUrl)"
            Write-Info "oauthHost: $($json.data.oauthHost)"
            $script:Results += @{
                Endpoint = "oauth-debug"
                Status = 200
                Pass = $true
                Message = "Endpoint accessible"
                Data = $json.data
            }
        } else {
            Write-ErrorMsg "oauth-debug returned success=false"
            $script:Results += @{
                Endpoint = "oauth-debug"
                Status = 200
                Pass = $false
                Message = "success=false in response"
            }
        }
    }
} catch {
    $statusCode = $null
    try {
        $statusCode = $_.Exception.Response.StatusCode.value__
    } catch {
        # No status code
    }
    
    if ($statusCode -eq 403) {
        Write-Info "oauth-debug requires X-Debug-Key (403) - This is expected in production"
        $script:Results += @{
            Endpoint = "oauth-debug"
            Status = 403
            Pass = $true
            Message = "Protected endpoint (requires X-Debug-Key) - OK"
        }
    } elseif ($statusCode) {
        Write-ErrorMsg "oauth-debug returned status $statusCode"
        $script:Results += @{
            Endpoint = "oauth-debug"
            Status = $statusCode
            Pass = $false
            Message = "Unexpected status $statusCode"
        }
    } else {
        Write-ErrorMsg "oauth-debug request failed: $($_.Exception.Message)"
        $script:Results += @{
            Endpoint = "oauth-debug"
            Status = $null
            Pass = $false
            Message = "Request failed: $($_.Exception.Message)"
        }
    }
}

# Test 2: /api/aliexpress/auth (should redirect with client_id)
Write-Step "Testing /api/aliexpress/auth endpoint (OAuth redirect)"
$authUrl = "$BASE_URL/api/aliexpress/auth"
Write-Info "URL: $authUrl"
Write-Info "Expected: Redirect (302) to AliExpress OAuth with client_id=$EXPECTED_CLIENT_ID"

try {
    # Use curl-like approach to get headers only
    $response = Invoke-WebRequest -Uri $authUrl -Method GET -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
    Write-ErrorMsg "auth endpoint did not redirect (got status $($response.StatusCode))"
    $script:Results += @{
        Endpoint = "auth"
        Status = $response.StatusCode
        Pass = $false
        Message = "Expected redirect but got $($response.StatusCode)"
        ClientId = $null
    }
} catch {
    $statusCode = $null
    $location = $null
    
    try {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $location = $_.Exception.Response.Headers.Location
    } catch {
        # Headers not available
    }
    
    if ($statusCode -eq 302 -or $statusCode -eq 301 -or $statusCode -eq 307 -or $statusCode -eq 308) {
        Write-Success "auth endpoint redirects correctly ($statusCode)"
        
        if ($location) {
            Write-Info "Redirect Location: $location"
            
            # Extract client_id from URL
            $clientId = $null
            if ($location -match 'client_id=([^&]+)') {
                $clientId = $matches[1]
                Write-Info "Extracted client_id: $clientId"
                
                if ($clientId -eq $EXPECTED_CLIENT_ID) {
                    Write-Success "client_id matches expected value ($EXPECTED_CLIENT_ID)"
                    $script:Results += @{
                        Endpoint = "auth"
                        Status = $statusCode
                        Pass = $true
                        Message = "Redirect OK, client_id=$clientId (PASS)"
                        ClientId = $clientId
                        Location = $location
                    }
                } else {
                    Write-ErrorMsg "client_id mismatch: got '$clientId', expected '$EXPECTED_CLIENT_ID'"
                    $script:Results += @{
                        Endpoint = "auth"
                        Status = $statusCode
                        Pass = $false
                        Message = "client_id mismatch: got '$clientId', expected '$EXPECTED_CLIENT_ID'"
                        ClientId = $clientId
                        Location = $location
                    }
                }
            } else {
                Write-ErrorMsg "Could not extract client_id from redirect URL"
                Write-Info "URL: $location"
                $script:Results += @{
                    Endpoint = "auth"
                    Status = $statusCode
                    Pass = $false
                    Message = "client_id parameter not found in redirect URL"
                    Location = $location
                }
            }
        } else {
            Write-ErrorMsg "Redirect location header not found"
            $script:Results += @{
                Endpoint = "auth"
                Status = $statusCode
                Pass = $false
                Message = "Location header missing"
            }
        }
    } elseif ($statusCode -eq 500) {
        Write-ErrorMsg "auth endpoint returned 500 Internal Server Error"
        $script:Results += @{
            Endpoint = "auth"
            Status = $statusCode
            Pass = $false
            Message = "500 Internal Server Error"
        }
    } elseif ($statusCode) {
        Write-ErrorMsg "auth endpoint returned unexpected status $statusCode"
        $script:Results += @{
            Endpoint = "auth"
            Status = $statusCode
            Pass = $false
            Message = "Unexpected status $statusCode"
        }
    } else {
        Write-ErrorMsg "auth endpoint request failed: $($_.Exception.Message)"
        $script:Results += @{
            Endpoint = "auth"
            Status = $null
            Pass = $false
            Message = "Request failed: $($_.Exception.Message)"
        }
    }
}

# Generate report
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "SUMMARY" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

$passed = $script:Results | Where-Object { $_.Pass -eq $true }
$failed = $script:Results | Where-Object { $_.Pass -eq $false }

Write-Host ""
Write-Host "Results:" -ForegroundColor Cyan
foreach ($result in $script:Results) {
    $status = if ($result.Pass) { "[PASS]" } else { "[FAIL]" }
    $color = if ($result.Pass) { "Green" } else { "Red" }
    $statusCode = if ($result.Status) { " ($($result.Status))" } else { "" }
    $clientIdInfo = if ($result.ClientId) { " | client_id=$($result.ClientId)" } else { "" }
    Write-Host "  $status $($result.Endpoint)$statusCode$clientIdInfo - $($result.Message)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Total: $($script:Results.Count) tests" -ForegroundColor Cyan
Write-Host "Passed: $($passed.Count)" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)" -ForegroundColor Red

# Generate markdown report
$reportPath = "docs/PROD_OAUTH_VERIFY.md"
$reportDir = Split-Path -Parent $reportPath
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$reportContent = @"
# Production OAuth Verification Report

**Fecha:** $timestamp  
**Domain:** $PRODUCTION_DOMAIN  
**Expected Client ID:** $EXPECTED_CLIENT_ID

---

## Resumen

- **Total Tests:** $($script:Results.Count)
- **Passed:** $($passed.Count)
- **Failed:** $($failed.Count)
- **Estado Final:** $(if ($script:HasErrors) { "❌ FAIL" } else { "✅ PASS" })

---

## Resultados Detallados

"@

foreach ($result in $script:Results) {
    $status = if ($result.Pass) { "✅ PASS" } else { "❌ FAIL" }
    $reportContent += @"
### $($result.Endpoint)

- **Status:** $($result.Status)
- **Resultado:** $status
- **Mensaje:** $($result.Message)
"@
    
    if ($result.ClientId) {
        $reportContent += @"
- **Client ID Detectado:** $($result.ClientId)
- **Esperado:** $EXPECTED_CLIENT_ID
- **Match:** $(if ($result.ClientId -eq $EXPECTED_CLIENT_ID) { "✅ SÍ" } else { "❌ NO" })
"@
    }
    
    if ($result.Location) {
        $reportContent += @"
- **Redirect URL:** $($result.Location)
"@
    }
    
    if ($result.Data) {
        $reportContent += @"
- **appKeyMasked:** $($result.Data.appKeyMasked)
- **envSource:** $($result.Data.envSource)
- **callbackUrl:** $($result.Data.callbackUrl)
- **oauthHost:** $($result.Data.oauthHost)
"@
    }
    
    $reportContent += "`n"
}

$reportContent += @"

---

## Conclusión

$(if ($script:HasErrors) {
    "❌ **FALLO DETECTADO:** El OAuth no está configurado correctamente. Verificar que ALIEXPRESS_APP_KEY=524880 en Railway."
} else {
    "✅ **VERIFICACIÓN EXITOSA:** El OAuth está configurado correctamente con client_id=$EXPECTED_CLIENT_ID."
})

---

**Última actualización:** $timestamp
"@

$reportContent | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host ""
Write-Host "Reporte generado: $reportPath" -ForegroundColor Cyan

# Exit with appropriate code
if ($script:HasErrors) {
    Write-Host ""
    Write-Host "[FAIL] OAuth verification failed. See report: $reportPath" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[PASS] OAuth verification passed! Report: $reportPath" -ForegroundColor Green
    exit 0
}

