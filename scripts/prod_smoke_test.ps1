# Production Smoke Test Script (PowerShell)
# Valida que las rutas criticas de produccion funcionen correctamente
# NO usa secrets - solo prueba endpoints publicos

$ErrorActionPreference = "Continue"
$script:HasErrors = $false
$script:TestResults = @()

$PRODUCTION_DOMAIN = "www.ivanreseller.com"
$BASE_URL = "https://$PRODUCTION_DOMAIN"
$REPORT_PATH = "docs/PROD_SMOKE_TEST_RESULT.md"

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

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [int[]]$ExpectedStatusCodes = @(200),
        [bool]$CheckRedirect = $false,
        [string[]]$ForbiddenBodyPatterns = @()
    )
    
    Write-Step "Testing $Name"
    Write-Info "URL: $Url"
    
    $result = @{
        Name = $Name
        Url = $Url
        Status = $null
        Pass = $false
        Message = ""
        BodyPreview = ""
        IsRedirect = $false
        RedirectLocation = ""
    }
    
    try {
        if ($CheckRedirect) {
            # Test for redirect
            try {
                $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
                $result.Status = $response.StatusCode
                $result.Pass = $false
                $result.Message = "Expected redirect but got status $($response.StatusCode)"
                Write-ErrorMsg "$Name - Expected redirect but got status $($response.StatusCode)"
            } catch {
                $statusCode = $_.Exception.Response.StatusCode.value__
                if ($statusCode -eq 302 -or $statusCode -eq 301 -or $statusCode -eq 307 -or $statusCode -eq 308) {
                    $result.Status = $statusCode
                    $result.Pass = $true
                    $result.IsRedirect = $true
                    $result.Message = "Redirect $statusCode (OK)"
                    try {
                        $location = $_.Exception.Response.Headers.Location
                        if ($location) {
                            $result.RedirectLocation = $location.ToString()
                            Write-Info "Redirects to: $location"
                        }
                    } catch {
                        # Location not available
                    }
                    Write-Success "$Name - Redirects correctly ($statusCode)"
                } elseif ($statusCode -eq 502) {
                    $result.Status = $statusCode
                    $result.Pass = $false
                    $result.Message = "502 Bad Gateway - Backend not reachable"
                    Write-ErrorMsg "$Name - 502 Bad Gateway (backend not reachable)"
                } elseif ($statusCode -eq 404) {
                    $result.Status = $statusCode
                    $result.Pass = $false
                    $result.Message = "404 Not Found - Route not found or rewrite not working"
                    Write-ErrorMsg "$Name - 404 Not Found (route not found)"
                } else {
                    $result.Status = $statusCode
                    $result.Pass = $false
                    $result.Message = "Unexpected status $statusCode (expected redirect)"
                    Write-ErrorMsg "$Name - Unexpected status $statusCode"
                }
            }
        } else {
            # Test for normal response
            $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -ErrorAction Stop
            $result.Status = $response.StatusCode
            $body = $response.Content
            
            # Check if status is expected
            if ($ExpectedStatusCodes -contains $response.StatusCode) {
                $result.Pass = $true
                $result.Message = "Status $($response.StatusCode) (OK)"
                
                # Check for forbidden body patterns
                $hasForbiddenPattern = $false
                foreach ($pattern in $ForbiddenBodyPatterns) {
                    if ($body -match $pattern) {
                        $hasForbiddenPattern = $true
                        $result.Pass = $false
                        $result.Message = "Body contains forbidden pattern: $pattern"
                        Write-ErrorMsg "$Name - Body contains forbidden pattern: $pattern"
                        break
                    }
                }
                
                if (-not $hasForbiddenPattern) {
                    Write-Success "$Name - Status $($response.StatusCode) (OK)"
                }
            } else {
                $result.Pass = $false
                $result.Message = "Status $($response.StatusCode) (expected: $($ExpectedStatusCodes -join ', '))"
                Write-ErrorMsg "$Name - Status $($response.StatusCode) (expected: $($ExpectedStatusCodes -join ', '))"
            }
            
            # Store body preview
            if ($body.Length -gt 200) {
                $result.BodyPreview = $body.Substring(0, 200) + "..."
            } else {
                $result.BodyPreview = $body
            }
        }
    } catch {
        $statusCode = $null
        try {
            $statusCode = $_.Exception.Response.StatusCode.value__
        } catch {
            # No status code available
        }
        
        if ($statusCode) {
            $result.Status = $statusCode
            if ($statusCode -eq 502) {
                $result.Pass = $false
                $result.Message = "502 Bad Gateway - Backend not reachable"
                Write-ErrorMsg "$Name - 502 Bad Gateway (backend not reachable)"
            } elseif ($statusCode -eq 404) {
                $result.Pass = $false
                $result.Message = "404 Not Found - Route not found"
                Write-ErrorMsg "$Name - 404 Not Found (route not found)"
            } elseif ($ExpectedStatusCodes -contains $statusCode) {
                $result.Pass = $true
                $result.Message = "Status $statusCode (OK)"
                Write-Success "$Name - Status $statusCode (OK)"
            } else {
                $result.Pass = $false
                $result.Message = "Request failed: $($_.Exception.Message)"
                Write-ErrorMsg "$Name - Request failed: $($_.Exception.Message)"
            }
        } else {
            $result.Pass = $false
            $result.Message = "Request failed: $($_.Exception.Message)"
            Write-ErrorMsg "$Name - Request failed: $($_.Exception.Message)"
        }
    }
    
    $script:TestResults += $result
    return $result
}

# Start tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "PRODUCTION SMOKE TEST" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Domain: $BASE_URL" -ForegroundColor Gray
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Test 1: /health
Test-Endpoint -Name "Health Check" -Url "$BASE_URL/health" -ExpectedStatusCodes @(200)

# Test 2: /api/health
Test-Endpoint -Name "API Health Check" -Url "$BASE_URL/api/health" -ExpectedStatusCodes @(200)

# Test 3: /api/aliexpress/token-status
Test-Endpoint -Name "AliExpress Token Status" -Url "$BASE_URL/api/aliexpress/token-status" -ExpectedStatusCodes @(200, 401, 403)

# Test 4: /api/aliexpress/auth (should redirect)
Test-Endpoint -Name "AliExpress OAuth Auth" -Url "$BASE_URL/api/aliexpress/auth" -CheckRedirect $true

# Test 5: /api/aliexpress/test-link
$testLinkUrl = "$BASE_URL/api/aliexpress/test-link?productId=1005001234567890"
Test-Endpoint -Name "AliExpress Test Link" -Url $testLinkUrl -ExpectedStatusCodes @(200, 400, 401, 403) -ForbiddenBodyPatterns @("env missing", "ALIEXPRESS_APP_KEY no configurado")

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "SMOKE TEST SUMMARY" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

$passed = $script:TestResults | Where-Object { $_.Pass -eq $true }
$failed = $script:TestResults | Where-Object { $_.Pass -eq $false }

Write-Host ""
Write-Host "Results:" -ForegroundColor Cyan
foreach ($test in $script:TestResults) {
    $status = if ($test.Pass) { "[PASS]" } else { "[FAIL]" }
    $color = if ($test.Pass) { "Green" } else { "Red" }
    Write-Host "  $status $($test.Name) - $($test.Message)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Total: $($script:TestResults.Count) tests" -ForegroundColor Cyan
Write-Host "Passed: $($passed.Count)" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)" -ForegroundColor Red

# Generate report
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$reportContent = @"
# Production Smoke Test Result

**Date:** $timestamp  
**Base URL:** $BASE_URL  
**Total Tests:** $($script:TestResults.Count)  
**Passed:** $($passed.Count)  
**Failed:** $($failed.Count)  
**Overall Status:** $(if ($script:HasErrors) { "FAIL" } else { "PASS" })

## Test Results

| Test Name | URL | Status | Result | Message |
|-----------|-----|--------|--------|---------|
"@

foreach ($test in $script:TestResults) {
    $statusDisplay = if ($test.Status) { $test.Status.ToString() } else { "N/A" }
    $resultDisplay = if ($test.Pass) { "PASS" } else { "FAIL" }
    $urlDisplay = $test.Url
    if ($urlDisplay.Length -gt 60) {
        $urlDisplay = $urlDisplay.Substring(0, 57) + "..."
    }
    $reportContent += "`n| $($test.Name) | ``$urlDisplay`` | $statusDisplay | $resultDisplay | $($test.Message) |"
}

$reportContent += @"

## Details

"@

foreach ($test in $script:TestResults) {
    $reportContent += @"

### $($test.Name)

- **URL:** ``$($test.Url)``
- **Status Code:** $(if ($test.Status) { $test.Status.ToString() } else { "N/A" })
- **Result:** $(if ($test.Pass) { "PASS" } else { "FAIL" })
- **Message:** $($test.Message)
"@
    
    if ($test.IsRedirect -and $test.RedirectLocation) {
        $reportContent += "`n- **Redirect Location:** $($test.RedirectLocation)"
    }
    
    if ($test.BodyPreview) {
        $reportContent += "`n- **Body Preview:** ``$($test.BodyPreview)``"
    }
}

# Ensure docs directory exists
$docsDir = Split-Path -Path $REPORT_PATH -Parent
if (-not (Test-Path $docsDir)) {
    New-Item -ItemType Directory -Path $docsDir -Force | Out-Null
}

# Write report
$reportContent | Out-File -FilePath $REPORT_PATH -Encoding UTF8
Write-Host ""
Write-Host "Report saved to: $REPORT_PATH" -ForegroundColor Cyan

# Exit with appropriate code
if ($script:HasErrors) {
    Write-Host ""
    Write-Host "[FAIL] Some tests failed. Production wiring may not be correct." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[PASS] All production endpoints responded correctly!" -ForegroundColor Green
    exit 0
}
