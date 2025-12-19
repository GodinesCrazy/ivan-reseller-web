# Smoke Test Script for Railway Production
# Tests critical endpoints with timeouts to prevent hangs

param(
    [string]$BaseUrl = "https://ivan-reseller-web-production.up.railway.app",
    [int]$TimeoutSec = 10
)

$ErrorActionPreference = "Stop"
$results = @()

function Test-Endpoint {
    param(
        [string]$Path,
        [string]$Method = "GET",
        [int]$ExpectedStatus = 200,
        [int]$MaxTimeMs = 10000
    )
    
    $url = "$BaseUrl$Path"
    $startTime = Get-Date
    $statusCode = $null
    $responseTime = $null
    $error = $null
    $headers = $null
    
    try {
        Write-Host "Testing $Method $Path..." -ForegroundColor Cyan
        
        $response = Invoke-WebRequest -Uri $url -Method $Method -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
        $statusCode = $response.StatusCode
        $responseTime = ((Get-Date) - $startTime).TotalMilliseconds
        $headers = $response.Headers
        
        $timeMs = [math]::Round($responseTime)
        $timeStr = "${timeMs}ms"
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  ✓ ${Path}: $statusCode ($timeStr)" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ ${Path}: $statusCode (expected $ExpectedStatus) ($timeStr)" -ForegroundColor Yellow
        }
    }
    catch {
        $responseTime = ((Get-Date) - $startTime).TotalMilliseconds
        $error = $_.Exception.Message
        
        $timeMs = [math]::Round($responseTime)
        $timeStr = "${timeMs}ms"
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode.value__
            Write-Host "  ✗ ${Path}: $statusCode (error: $error) ($timeStr)" -ForegroundColor Red
        } else {
            Write-Host "  ✗ ${Path}: TIMEOUT/ERROR ($error) ($timeStr)" -ForegroundColor Red
        }
    }
    
    return @{
        Path = $Path
        Method = $Method
        StatusCode = $statusCode
        ResponseTimeMs = [math]::Round($responseTime)
        Error = $error
        Headers = $headers
        Success = ($statusCode -eq $ExpectedStatus -and $responseTime -lt $MaxTimeMs)
    }
}

Write-Host "`n=== Railway Smoke Test ===" -ForegroundColor Magenta
Write-Host "Base URL: $BaseUrl" -ForegroundColor Gray
Write-Host "Timeout: ${TimeoutSec}s per request`n" -ForegroundColor Gray

# Test critical endpoints
$results += Test-Endpoint -Path "/health" -ExpectedStatus 200 -MaxTimeMs 1000

# Test /ready (can be 200 or 503)
$readyResult = Test-Endpoint -Path "/ready" -ExpectedStatus 200 -MaxTimeMs 5000
if ($readyResult.StatusCode -eq 503) {
    $readyResult.Success = $true  # 503 is also acceptable for /ready
}
$results += $readyResult

$results += Test-Endpoint -Path "/version" -ExpectedStatus 200 -MaxTimeMs 1000

# Test / (can be 200 or 404, but NOT 502)
$rootResult = Test-Endpoint -Path "/" -ExpectedStatus 200 -MaxTimeMs 1000
if ($rootResult.StatusCode -eq 404) {
    $rootResult.Success = $true  # 404 is acceptable for root
} elseif ($rootResult.StatusCode -eq 502) {
    $rootResult.Success = $false  # 502 is NOT acceptable
}
$results += $rootResult

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Magenta
$passed = ($results | Where-Object { $_.Success }).Count
$total = $results.Count
Write-Host "Passed: $passed/$total" -ForegroundColor $(if ($passed -eq $total) { "Green" } else { "Yellow" })

# Generate evidence markdown
$dateStr = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$evidence = "# Railway Smoke Test Evidence`n"
$evidence += "**Date:** $dateStr`n"
$evidence += "**Base URL:** $BaseUrl`n`n"
$evidence += "## Results`n`n"
$evidence += "| Endpoint | Status | Time (ms) | Success |`n"
$evidence += '|----------|--------|-----------|---------|' + "`n"

foreach ($result in $results) {
    $status = if ($result.StatusCode) { $result.StatusCode } else { "ERROR" }
    $time = if ($result.ResponseTimeMs) { $result.ResponseTimeMs } else { "N/A" }
    $success = if ($result.Success) { "✓" } else { "✗" }
    $evidence += "`n| $($result.Method) $($result.Path) | $status | $time | $success |"
    
    if ($result.Error) {
        $evidence += "`n  - Error: $($result.Error)"
    }
    if ($result.Headers -and $result.Headers['X-App-Commit']) {
        $evidence += "`n  - X-App-Commit: $($result.Headers['X-App-Commit'])"
    }
}

$verdict = if ($passed -eq $total) { "PASS" } else { "FAIL" }
$evidence += "`n## Verdict`n"
$evidence += "**Status:** $verdict`n"
$evidence += "**Passed:** $passed/$total`n`n"
$evidence += "## Criteria`n"
$evidence += "- `/health` must respond 200 in < 1s`n"
$evidence += "- `/ready` must respond 200/503 in < 5s (never timeout)`n"
$evidence += "- `/version` must respond 200 in < 1s`n"
$evidence += "- `/` must respond 200/404 in < 1s (never 502)`n"

# Save evidence
$evidencePath = "docs/CERT_EVIDENCE_SMOKE.md"
$evidence | Out-File -FilePath $evidencePath -Encoding UTF8
Write-Host "`nEvidence saved to: $evidencePath" -ForegroundColor Cyan

# Exit with error code if any test failed
if ($passed -lt $total) {
    exit 1
}
