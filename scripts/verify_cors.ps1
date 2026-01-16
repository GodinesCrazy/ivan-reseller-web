# ✅ PRODUCTION: Script de verificación completa de CORS
# Verifica que el backend responda correctamente a CORS para el dominio de producción

param(
    [Parameter(Mandatory=$true)]
    [string]$BackendUrl,
    
    [string]$Origin = "https://www.ivanreseller.com"
)

$BackendUrl = $BackendUrl.TrimEnd('/')
$script:HasErrors = $false

function Write-Step {
    param([string]$Message)
    Write-Host "`n▶ $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
    $script:HasErrors = $true
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Gray
}

Write-Host "`n🔍 VERIFICACIÓN COMPLETA DE CORS" -ForegroundColor Magenta
Write-Host "=================================" -ForegroundColor Magenta
Write-Host "Backend: $BackendUrl" -ForegroundColor Gray
Write-Host "Origin: $Origin" -ForegroundColor Gray
Write-Host ""

# 1. Preflight OPTIONS a /api/products
Write-Step "Testing Preflight OPTIONS to /api/products"
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/products" `
        -Method OPTIONS `
        -Headers @{
            "Origin" = $Origin
            "Access-Control-Request-Method" = "GET"
            "Access-Control-Request-Headers" = "Content-Type, Authorization"
        } `
        -UseBasicParsing `
        -ErrorAction Stop
    
    if ($response.StatusCode -eq 204) {
        Write-Success "Preflight responded with 204"
    } else {
        Write-Error "Preflight returned unexpected status $($response.StatusCode)"
    }
    
    $corsOrigin = $response.Headers['Access-Control-Allow-Origin']
    $corsCreds = $response.Headers['Access-Control-Allow-Credentials']
    $corsMethods = $response.Headers['Access-Control-Allow-Methods']
    $corsHeaders = $response.Headers['Access-Control-Allow-Headers']
    $vary = $response.Headers['Vary']
    
    Write-Host "   Headers CORS:" -ForegroundColor Gray
    if ($corsOrigin) {
        Write-Host "   ✅ Access-Control-Allow-Origin: $corsOrigin" -ForegroundColor Green
        if ($corsOrigin -eq $Origin) {
            Write-Success "Origin matches exactly!"
        } else {
            Write-Warning "Origin mismatch (expected: $Origin, got: $corsOrigin)"
        }
    } else {
        Write-Error "Access-Control-Allow-Origin header missing!"
    }
    
    if ($corsCreds -eq "true") {
        Write-Host "   ✅ Access-Control-Allow-Credentials: $corsCreds" -ForegroundColor Green
    } else {
        Write-Warning "Access-Control-Allow-Credentials missing or not 'true'"
    }
    
    if ($corsMethods) {
        Write-Host "   ✅ Access-Control-Allow-Methods: $corsMethods" -ForegroundColor Green
    }
    
    if ($corsHeaders) {
        Write-Host "   ✅ Access-Control-Allow-Headers: $corsHeaders" -ForegroundColor Green
    }
    
    if ($vary -and $vary -like "*Origin*") {
        Write-Host "   ✅ Vary: $vary" -ForegroundColor Green
    }
} catch {
    Write-Error "Preflight failed: $($_.Exception.Message)"
}

# 2. Preflight OPTIONS a /api/dashboard/stats
Write-Step "Testing Preflight OPTIONS to /api/dashboard/stats"
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/dashboard/stats" `
        -Method OPTIONS `
        -Headers @{
            "Origin" = $Origin
            "Access-Control-Request-Method" = "GET"
            "Access-Control-Request-Headers" = "Content-Type, Authorization"
        } `
        -UseBasicParsing `
        -ErrorAction Stop
    
    if ($response.StatusCode -eq 204 -or $response.StatusCode -eq 200) {
        Write-Success "Preflight responded with $($response.StatusCode)"
    } else {
        Write-Error "Preflight returned unexpected status $($response.StatusCode)"
    }
    
    $corsOrigin = $response.Headers['Access-Control-Allow-Origin']
    $corsCreds = $response.Headers['Access-Control-Allow-Credentials']
    $corsMethods = $response.Headers['Access-Control-Allow-Methods']
    $corsHeaders = $response.Headers['Access-Control-Allow-Headers']
    $vary = $response.Headers['Vary']
    
    if ($corsOrigin) {
        Write-Info "Access-Control-Allow-Origin: $corsOrigin"
        if ($corsOrigin -eq $Origin) {
            Write-Success "Origin matches exactly!"
        } else {
            Write-Warning "Origin mismatch (expected: $Origin, got: $corsOrigin)"
        }
    } else {
        Write-Error "Access-Control-Allow-Origin header missing!"
    }
    
    if ($corsCreds -eq "true") {
        Write-Success "Access-Control-Allow-Credentials: $corsCreds"
    } else {
        Write-Warning "Access-Control-Allow-Credentials missing or not 'true'"
    }
    
    if ($corsMethods) {
        Write-Info "Access-Control-Allow-Methods: $corsMethods"
        if ($corsMethods -like "*GET*" -and $corsMethods -like "*POST*") {
            Write-Success "Methods include GET and POST"
        }
    } else {
        Write-Warning "Access-Control-Allow-Methods missing"
    }
    
    if ($corsHeaders) {
        Write-Info "Access-Control-Allow-Headers: $corsHeaders"
        if ($corsHeaders -like "*Authorization*") {
            Write-Success "Headers include Authorization"
        }
    }
    
    if ($vary -and $vary -like "*Origin*") {
        Write-Success "Vary: $vary (correct)"
    } else {
        Write-Warning "Vary header missing or doesn't include Origin"
    }
} catch {
    Write-Error "Preflight failed: $($_.Exception.Message)"
}

# 3. Actual GET request a /api/products
Write-Step "Testing Actual GET Request to /api/products"
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/products" `
        -Method GET `
        -Headers @{
            "Origin" = $Origin
        } `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Info "Status: $($response.StatusCode)"
    
    $corsOrigin = $response.Headers['Access-Control-Allow-Origin']
    $vary = $response.Headers['Vary']
    
    if ($corsOrigin) {
        Write-Host "   ✅ Access-Control-Allow-Origin: $corsOrigin" -ForegroundColor Green
        if ($corsOrigin -eq $Origin) {
            Write-Success "Origin matches exactly!"
        } else {
            Write-Warning "Origin mismatch (expected: $Origin, got: $corsOrigin)"
        }
    } else {
        Write-Error "Access-Control-Allow-Origin header missing in GET response!"
    }
    
    if ($vary -and $vary -like "*Origin*") {
        Write-Success "Vary: $vary (correct)"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Warning "Request returned 401 (Unauthorized) - this is expected without auth token"
        Write-Info "Checking if CORS headers are present despite 401..."
        
        try {
            $errorResponse = $_.Exception.Response
            $corsOrigin = $errorResponse.Headers['Access-Control-Allow-Origin']
            if ($corsOrigin) {
                Write-Success "CORS headers present in error response: Access-Control-Allow-Origin = $corsOrigin"
            } else {
                Write-Error "CORS headers missing in 401 error response!"
            }
        } catch {
            Write-Warning "Could not verify CORS headers in error response"
        }
    } else {
        Write-Error "Request failed with status $statusCode: $($_.Exception.Message)"
    }
}

# 4. Actual GET request a /api/dashboard/stats
Write-Step "Testing Actual GET Request to /api/dashboard/stats"
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/dashboard/stats" `
        -Method GET `
        -Headers @{
            "Origin" = $Origin
        } `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Info "Status: $($response.StatusCode)"
    
    $corsOrigin = $response.Headers['Access-Control-Allow-Origin']
    $vary = $response.Headers['Vary']
    
    if ($corsOrigin) {
        Write-Host "   ✅ Access-Control-Allow-Origin: $corsOrigin" -ForegroundColor Green
        if ($corsOrigin -eq $Origin) {
            Write-Success "Origin matches exactly!"
        } else {
            Write-Warning "Origin mismatch (expected: $Origin, got: $corsOrigin)"
        }
    } else {
        Write-Error "Access-Control-Allow-Origin header missing in GET response!"
    }
    
    if ($vary -and $vary -like "*Origin*") {
        Write-Success "Vary: $vary (correct)"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Warning "Request returned 401 (Unauthorized) - this is expected without auth token"
        Write-Info "Checking if CORS headers are present despite 401..."
        
        # Verificar headers incluso en error
        try {
            $errorResponse = $_.Exception.Response
            $corsOrigin = $errorResponse.Headers['Access-Control-Allow-Origin']
            if ($corsOrigin) {
                Write-Success "CORS headers present in error response: Access-Control-Allow-Origin = $corsOrigin"
            } else {
                Write-Error "CORS headers missing in 401 error response!"
            }
        } catch {
            Write-Warning "Could not verify CORS headers in error response"
        }
    } else {
        Write-Error "Request failed with status $statusCode: $($_.Exception.Message)"
    }
}

# 5. Test /api/dashboard/recent-activity (endpoint que falla según screenshots)
Write-Step "Testing GET Request to /api/dashboard/recent-activity"
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/dashboard/recent-activity?limit=10" `
        -Method GET `
        -Headers @{
            "Origin" = $Origin
        } `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Info "Status: $($response.StatusCode)"
    
    $corsOrigin = $response.Headers['Access-Control-Allow-Origin']
    if ($corsOrigin) {
        Write-Success "Access-Control-Allow-Origin: $corsOrigin"
    } else {
        Write-Error "Access-Control-Allow-Origin header missing!"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Warning "Request returned 401 (Unauthorized) - checking CORS headers..."
        try {
            $errorResponse = $_.Exception.Response
            $corsOrigin = $errorResponse.Headers['Access-Control-Allow-Origin']
            if ($corsOrigin) {
                Write-Success "CORS headers present in 401: Access-Control-Allow-Origin = $corsOrigin"
            } else {
                Write-Error "CORS headers missing in 401 error response!"
            }
        } catch {
            Write-Warning "Could not verify CORS headers"
        }
    } else {
        Write-Error "Request failed: $statusCode"
    }
}

# 6. Test /api/opportunities/list (endpoint que falla según screenshots)
Write-Step "Testing GET Request to /api/opportunities/list"
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/opportunities/list?page=1&limit=1" `
        -Method GET `
        -Headers @{
            "Origin" = $Origin
        } `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Info "Status: $($response.StatusCode)"
    
    $corsOrigin = $response.Headers['Access-Control-Allow-Origin']
    if ($corsOrigin) {
        Write-Success "Access-Control-Allow-Origin: $corsOrigin"
    } else {
        Write-Error "Access-Control-Allow-Origin header missing!"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Warning "Request returned 401 (Unauthorized) - checking CORS headers..."
        try {
            $errorResponse = $_.Exception.Response
            $corsOrigin = $errorResponse.Headers['Access-Control-Allow-Origin']
            if ($corsOrigin) {
                Write-Success "CORS headers present in 401: Access-Control-Allow-Origin = $corsOrigin"
            } else {
                Write-Error "CORS headers missing in 401 error response!"
            }
        } catch {
            Write-Warning "Could not verify CORS headers"
        }
    } else {
        Write-Error "Request failed: $statusCode"
    }
}

# 7. Test /api/cors-debug endpoint (mejorado)
Write-Step "Testing /api/cors-debug endpoint"
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/api/cors-debug" `
        -Method GET `
        -Headers @{
            "Origin" = $Origin
        } `
        -UseBasicParsing `
        -ErrorAction Stop
    
    if ($response.StatusCode -eq 200) {
        Write-Success "/api/cors-debug responded with 200"
        $data = $response.Content | ConvertFrom-Json
        
        Write-Info "Request Origin: $($data.receivedOrigin)"
        Write-Info "Matched: $($data.matched)"
        Write-Info "Matched Rule: $($data.matchedRule)"
        Write-Info "Matched Origin: $($data.matchedOrigin)"
        
        if ($data.allowedOriginsParsed) {
            Write-Info "Allowed Origins Parsed: $($data.allowedOriginsParsed -join ', ')"
            # Verificar que NO contenga prefijos incrustados
            $hasInvalidPrefix = $data.allowedOriginsParsed | Where-Object { $_ -like "*CORS_ORIGIN=*" -or $_ -like "*CORS_ORIGINS=*" }
            if ($hasInvalidPrefix) {
                Write-Error "Found invalid prefix in allowedOriginsParsed: $hasInvalidPrefix"
            } else {
                Write-Success "No invalid prefixes found in allowedOriginsParsed"
            }
        }
        
        if ($data.allowedHostNoWww) {
            Write-Info "Allowed Hosts (no www): $($data.allowedHostNoWww -join ', ')"
        }
        
        Write-Info "Env CORS_ORIGIN Raw: $($data.envCorsOriginRaw)"
        Write-Info "Env CORS_ORIGINS Raw: $($data.envCorsOriginsRaw)"
        Write-Info "Access-Control-Allow-Origin in response: $($data.'access-control-allow-origin')"
        
        # Verificar que matched sea true
        if ($data.matched -eq $true) {
            Write-Success "Origin matched successfully!"
        } else {
            Write-Error "Origin did NOT match! (matched: $($data.matched))"
        }
        
        # Verificar CORS headers en la respuesta HTTP
        $corsOrigin = $response.Headers['Access-Control-Allow-Origin']
        if ($corsOrigin) {
            Write-Success "CORS header present: Access-Control-Allow-Origin = $corsOrigin"
            if ($corsOrigin -eq $Origin) {
                Write-Success "CORS header matches request origin exactly!"
            } else {
                Write-Warning "CORS header mismatch (expected: $Origin, got: $corsOrigin)"
            }
        } else {
            Write-Error "CORS header missing in HTTP response!"
        }
    }
} catch {
    Write-Warning "/api/cors-debug failed: $($_.Exception.Message)"
}

# Summary
Write-Host "`n📊 VERIFICACIÓN COMPLETA" -ForegroundColor Magenta
Write-Host "========================" -ForegroundColor Magenta

if ($script:HasErrors) {
    Write-Error "Verificación completada con errores. Revisa la configuración de CORS."
    exit 1
} else {
    Write-Success "Todas las verificaciones pasaron. CORS está configurado correctamente."
    exit 0
}

