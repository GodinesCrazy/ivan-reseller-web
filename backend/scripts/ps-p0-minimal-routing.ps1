# ? P0: Script de validacin de routing mnimo
# Prueba Railway directo y Vercel proxy para /health, /ready, /api/debug/ping, /api/debug/build-info
# Reintentos 5 veces con delay 2s si 502
# Termina con PASS/FAIL

param(
    [string]$RailwayUrl = "https://ivan-reseller-web-production.up.railway.app",
    [string]$VercelUrl = "https://ivanreseller.com",
    [int]$MaxRetries = 5,
    [int]$RetryDelay = 2
)

$ErrorActionPreference = "Continue"

# Colores para output
function Write-Success { param([string]$Message) Write-Host "? $Message" -ForegroundColor Green }
function Write-Error { param([string]$Message) Write-Host "? $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "??  $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "??  $Message" -ForegroundColor Cyan }

Write-Host ""
Write-Host "?? P0 MINIMAL ROUTING VALIDATION" -ForegroundColor Magenta
Write-Host "=================================" -ForegroundColor Magenta
Write-Host "Railway URL: $RailwayUrl"
Write-Host "Vercel URL: $VercelUrl"
Write-Host "Max Retries: $MaxRetries"
Write-Host "Retry Delay: ${RetryDelay}s"
Write-Host "=================================" -ForegroundColor Magenta
Write-Host ""

# Endpoints a probar
$Endpoints = @(
    "/health",
    "/ready",
    "/api/debug/ping",
    "/api/debug/build-info"
)

# Funcin para hacer request con reintentos
function Test-Endpoint {
    param(
        [string]$Url,
        [string]$Endpoint,
        [string]$Source,
        [int]$MaxRetries,
        [int]$RetryDelay
    )
    
    $FullUrl = "$Url$Endpoint"
    $Attempt = 0
    $Success = $false
    $LastError = $null
    $LastStatusCode = $null
    $LastResponse = $null
    $LastHeaders = $null
    
    while ($Attempt -lt $MaxRetries -and -not $Success) {
        $Attempt++
        
        try {
            Write-Info "[${Source}] Attempt ${Attempt}/${MaxRetries}: ${FullUrl}"
            
            $Response = Invoke-WebRequest -Uri $FullUrl -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            
            $LastStatusCode = $Response.StatusCode
            $LastResponse = $Response.Content
            $LastHeaders = $Response.Headers
            
            if ($LastStatusCode -eq 200) {
                $Success = $true
                Write-Success "[${Source}] ${Endpoint} -> 200 OK"
                
                # Parse JSON response si es posible
                try {
                    $JsonResponse = $Response.Content | ConvertFrom-Json
                    $ResponsePreview = ($JsonResponse | ConvertTo-Json -Compress -Depth 2).Substring(0, [Math]::Min(100, ($JsonResponse | ConvertTo-Json -Compress -Depth 2).Length))
                    Write-Info "  Response: $ResponsePreview..."
                } catch {
                    $ResponsePreview = $Response.Content.Substring(0, [Math]::Min(100, $Response.Content.Length))
                    Write-Info "  Response: $ResponsePreview..."
                }
                
                # Mostrar headers clave
                $KeyHeaders = @('X-Response-Time', 'X-Health', 'X-Mode', 'Content-Type')
                foreach ($Header in $KeyHeaders) {
                    if ($Response.Headers[$Header]) {
                        Write-Info "  ${Header}: $($Response.Headers[$Header])"
                    }
                }
            } else {
                Write-Warning "[$Source] $Endpoint -> $LastStatusCode (expected 200)"
                if ($Attempt -lt $MaxRetries) {
                    Write-Info "  Retrying in ${RetryDelay}s..."
                    Start-Sleep -Seconds $RetryDelay
                }
            }
        } catch {
            $LastError = $_.Exception.Message
            
            # Intentar extraer status code del error
            if ($_.Exception.Response) {
                try {
                    $LastStatusCode = [int]$_.Exception.Response.StatusCode.value__
                } catch {
                    $LastStatusCode = $null
                }
            }
            
            if ($LastStatusCode -eq 502) {
                Write-Warning "[${Source}] ${Endpoint} -> 502 Bad Gateway (attempt ${Attempt}/${MaxRetries})"
                if ($Attempt -lt $MaxRetries) {
                    Write-Info "  Retrying in ${RetryDelay}s..."
                    Start-Sleep -Seconds $RetryDelay
                }
            } elseif ($LastStatusCode) {
                Write-Warning "[${Source}] ${Endpoint} -> ${LastStatusCode} (attempt ${Attempt}/${MaxRetries})"
                if ($Attempt -lt $MaxRetries) {
                    Write-Info "  Retrying in ${RetryDelay}s..."
                    Start-Sleep -Seconds $RetryDelay
                }
            } else {
                Write-Warning "[$Source] $Endpoint -> Error: $LastError (attempt $Attempt/$MaxRetries)"
                if ($Attempt -lt $MaxRetries) {
                    Write-Info "  Retrying in ${RetryDelay}s..."
                    Start-Sleep -Seconds $RetryDelay
                }
            }
        }
    }
    
    return @{
        Success = $Success
        StatusCode = $LastStatusCode
        Response = $LastResponse
        Headers = $LastHeaders
        Error = $LastError
        Attempts = $Attempt
    }
}

# Resultados
$Results = @{
    Railway = @{}
    Vercel = @{}
}

$AllPassed = $true

# Probar Railway directo
Write-Host ""
Write-Host "?? TESTING RAILWAY DIRECT" -ForegroundColor Yellow
Write-Host "=========================" -ForegroundColor Yellow
Write-Host ""

foreach ($Endpoint in $Endpoints) {
    $Result = Test-Endpoint -Url $RailwayUrl -Endpoint $Endpoint -Source "RAILWAY" -MaxRetries $MaxRetries -RetryDelay $RetryDelay
    $Results.Railway[$Endpoint] = $Result
    
    if (-not $Result.Success) {
        $AllPassed = $false
        Write-Error "RAILWAY $Endpoint FAILED"
    }
    
    Write-Host ""
}

# Probar Vercel proxy
Write-Host ""
Write-Host "?? TESTING VERCEL PROXY" -ForegroundColor Yellow
Write-Host "=======================" -ForegroundColor Yellow
Write-Host ""

foreach ($Endpoint in $Endpoints) {
    $Result = Test-Endpoint -Url $VercelUrl -Endpoint $Endpoint -Source "VERCEL" -MaxRetries $MaxRetries -RetryDelay $RetryDelay
    $Results.Vercel[$Endpoint] = $Result
    
    if (-not $Result.Success) {
        $AllPassed = $false
        Write-Error "VERCEL $Endpoint FAILED"
    }
    
    # Verificar que /ready NO retorna HTML del frontend
    if ($Endpoint -eq "/ready" -and $Result.Success) {
        if ($Result.Response -match "<!DOCTYPE html>" -or $Result.Response -match "<html") {
            $AllPassed = $false
            Write-Error "VERCEL /ready returns HTML (frontend fallback) - routing misconfigured!"
        } else {
            Write-Success "VERCEL /ready correctly returns JSON (not HTML)"
        }
    }
    
    Write-Host ""
}

# Resumen
Write-Host ""
Write-Host "?? SUMMARY" -ForegroundColor Magenta
Write-Host "==========" -ForegroundColor Magenta
Write-Host ""

Write-Host "RAILWAY DIRECT:" -ForegroundColor Cyan
foreach ($Endpoint in $Endpoints) {
    $Result = $Results.Railway[$Endpoint]
    if ($Result.Success) {
        Write-Success "  ${Endpoint} -> $($Result.StatusCode) OK"
    } else {
        Write-Error "  ${Endpoint} -> FAILED (Status: $($Result.StatusCode), Error: $($Result.Error))"
    }
}

Write-Host ""
Write-Host "VERCEL PROXY:" -ForegroundColor Cyan
foreach ($Endpoint in $Endpoints) {
    $Result = $Results.Vercel[$Endpoint]
    if ($Result.Success) {
        Write-Success "  $Endpoint -> $($Result.StatusCode) OK"
    } else {
        Write-Error "  $Endpoint -> FAILED (Status: $($Result.StatusCode), Error: $($Result.Error))"
    }
}

Write-Host ""
Write-Host "=================================" -ForegroundColor Magenta

if ($AllPassed) {
    Write-Host "? PASS" -ForegroundColor Green
    Write-Host "All endpoints responding with 200 OK" -ForegroundColor Green
    exit 0
} else {
    Write-Host "? FAIL" -ForegroundColor Red
    Write-Host "Some endpoints failed or returned non-200 status" -ForegroundColor Red
    exit 1
}
