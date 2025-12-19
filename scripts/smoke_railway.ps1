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
        
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  ? $Path: $statusCode ($([math]::Round($responseTime))ms)" -ForegroundColor Green
        } else {
            Write-Host "  ? $Path: $statusCode (expected $ExpectedStatus) ($([math]::Round($responseTime))ms)" -ForegroundColor Yellow
        }
    }
    catch {
        $responseTime = ((Get-Date) - $startTime).TotalMilliseconds
        $error = $_.Exception.Message
        
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode.value__
            Write-Host "  ? $Path: $statusCode (error: $error) ($([math]::Round($responseTime))ms)" -ForegroundColor Red
        } else {
            Write-Host "  ? $Path: TIMEOUT/ERROR ($error) ($([math]::Round($responseTime))ms)" -ForegroundColor Red
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
$results += Test-Endpoint -Path "/ready" -ExpectedStatus @(200, 503) -MaxTimeMs 5000
$results += Test-Endpoint -Path "/version" -ExpectedStatus 200 -MaxTimeMs 1000
$results += Test-Endpoint -Path "/" -ExpectedStatus @(200, 404) -MaxTimeMs 1000

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Magenta
$passed = ($results | Where-Object { $_.Success }).Count
$total = $results.Count
Write-Host "Passed: $passed/$total" -ForegroundColor $(if ($passed -eq $total) { "Green" } else { "Yellow" })

# Generate evidence markdown
$evidence = @"
# Railway Smoke Test Evidence
**Date:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Base URL:** $BaseUrl

## Results

| Endpoint | Status | Time (ms) | Success |
|----------|--------|-----------|---------|
"@

foreach ($result in $results) {
    $status = if ($result.StatusCode) { $result.StatusCode } else { "ERROR" }
    $time = if ($result.ResponseTimeMs) { $result.ResponseTimeMs } else { "N/A" }
    $success = if ($result.Success) { "?" } else { "?" }
    $evidence += "`n| $($result.Method) $($result.Path) | $status | $time | $success |"
    
    if ($result.Error) {
        $evidence += "`n  - Error: $($result.Error)"
    }
    if ($result.Headers -and $result.Headers['X-App-Commit']) {
        $evidence += "`n  - X-App-Commit: $($result.Headers['X-App-Commit'])"
    }
}

$evidence += @"

## Verdict
**Status:** $(if ($passed -eq $total) { "PASS" } else { "FAIL" })
**Passed:** $passed/$total

## Criteria
- `/health` must respond 200 in < 1s
- `/ready` must respond 200/503 in < 5s (never timeout)
- `/version` must respond 200 in < 1s
- `/` must respond 200/404 in < 1s (never 502)
"@

# Save evidence
$evidencePath = "docs/CERT_EVIDENCE_SMOKE.md"
$evidence | Out-File -FilePath $evidencePath -Encoding UTF8
Write-Host "`nEvidence saved to: $evidencePath" -ForegroundColor Cyan

# Exit with error code if any test failed
if ($passed -lt $total) {
    exit 1
}
