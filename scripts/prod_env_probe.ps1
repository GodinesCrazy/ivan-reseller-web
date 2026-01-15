# Production Environment Probe Script (PowerShell)
# Extrae evidencia de que las variables de entorno de AliExpress están presentes
# mediante pruebas automáticas de endpoints

$ErrorActionPreference = "Continue"
$script:HasErrors = $false
$script:Results = @()

$PRODUCTION_DOMAIN = "www.ivanreseller.com"
$BASE_URL = "https://$PRODUCTION_DOMAIN"
$REPORT_PATH = "docs/PROD_ENV_PROBE.md"

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

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [int[]]$ExpectedStatusCodes = @(200),
        [bool]$CheckRedirect = $false,
        [string[]]$ForbiddenBodyPatterns = @(),
        [string[]]$RequiredBodyPatterns = @()
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
        Body = ""
        IsRedirect = $false
        RedirectLocation = ""
        HasForbiddenPattern = $false
        HasRequiredPattern = $false
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
                            
                            # Check if redirect is to AliExpress OAuth
                            if ($location.ToString() -match "oauth\.aliexpress\.com") {
                                $result.HasRequiredPattern = $true
                                Write-Info "Redirect is to AliExpress OAuth (OK)"
                            }
                        }
                    } catch {
                        # Location not available
                    }
                    Write-Success "$Name - Redirects correctly ($statusCode)"
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
            $result.Body = $body
            
            # Check if status is expected
            if ($ExpectedStatusCodes -contains $response.StatusCode) {
                $result.Pass = $true
                $result.Message = "Status $($response.StatusCode) (OK)"
                
                # Check for forbidden body patterns
                $hasForbiddenPattern = $false
                foreach ($pattern in $ForbiddenBodyPatterns) {
                    if ($body -match $pattern) {
                        $hasForbiddenPattern = $true
                        $result.HasForbiddenPattern = $true
                        $result.Pass = $false
                        $result.Message = "Body contains forbidden pattern: $pattern"
                        Write-ErrorMsg "$Name - Body contains forbidden pattern: $pattern"
                        break
                    }
                }
                
                # Check for required body patterns
                if (-not $hasForbiddenPattern -and $RequiredBodyPatterns.Count -gt 0) {
                    $hasAllRequired = $true
                    foreach ($pattern in $RequiredBodyPatterns) {
                        if ($body -notmatch $pattern) {
                            $hasAllRequired = $false
                            break
                        }
                    }
                    if ($hasAllRequired) {
                        $result.HasRequiredPattern = $true
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
            if ($body.Length -gt 500) {
                $result.BodyPreview = $body.Substring(0, 500) + "..."
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
    
    $script:Results += $result
    return $result
}

# Start tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "PRODUCTION ENV PROBE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Domain: $BASE_URL" -ForegroundColor Gray
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""
Write-Host "Purpose: Verify AliExpress environment variables are present in production" -ForegroundColor Gray
Write-Host "Method: Test endpoints that require env vars and check responses" -ForegroundColor Gray
Write-Host ""

# Test 1: /api/aliexpress/token-status
# This should return 200 even without token (just checks if service is available)
Write-Host "Test 1: Token Status (should work without env vars)" -ForegroundColor Cyan
Test-Endpoint -Name "AliExpress Token Status" -Url "$BASE_URL/api/aliexpress/token-status" -ExpectedStatusCodes @(200, 401, 403)

# Test 2: /api/aliexpress/auth (should redirect if env vars are present)
# This MUST redirect to AliExpress OAuth if env vars are configured
# If env vars are missing, it will return 500 with "APP_KEY no configurado"
Write-Host ""
Write-Host "Test 2: OAuth Auth (critical - must redirect if env vars present)" -ForegroundColor Cyan
Test-Endpoint -Name "AliExpress OAuth Auth" -Url "$BASE_URL/api/aliexpress/auth" -CheckRedirect $true -ForbiddenBodyPatterns @("APP_KEY no configurado", "ALIEXPRESS_APP_KEY no configurado", "env missing")

# Test 3: /api/aliexpress/test-link
# This should return 200/400/401 but NOT "APP_KEY no configurado"
Write-Host ""
Write-Host "Test 3: Test Link (should not say env missing)" -ForegroundColor Cyan
$testLinkUrl = "$BASE_URL/api/aliexpress/test-link?productId=1005001234567890"
Test-Endpoint -Name "AliExpress Test Link" -Url $testLinkUrl -ExpectedStatusCodes @(200, 400, 401, 403) -ForbiddenBodyPatterns @("APP_KEY no configurado", "ALIEXPRESS_APP_KEY no configurado", "env missing")

# Analysis
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "ENV PROBE ANALYSIS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

$authTest = $script:Results | Where-Object { $_.Name -eq "AliExpress OAuth Auth" }
$testLinkTest = $script:Results | Where-Object { $_.Name -eq "AliExpress Test Link" }

$envVarsPresent = $false
$envVarsMissing = $false

if ($authTest) {
    if ($authTest.IsRedirect -and $authTest.RedirectLocation -match "oauth\.aliexpress\.com") {
        Write-Success "ENV VARS PRESENT: /api/aliexpress/auth redirects to AliExpress OAuth"
        $envVarsPresent = $true
    } elseif ($authTest.HasForbiddenPattern) {
        Write-ErrorMsg "ENV VARS MISSING: /api/aliexpress/auth contains 'APP_KEY no configurado'"
        $envVarsMissing = $true
    } elseif ($authTest.Status -eq 500) {
        Write-ErrorMsg "ENV VARS MISSING: /api/aliexpress/auth returns 500 (likely env vars missing)"
        $envVarsMissing = $true
    } else {
        Write-Info "ENV VARS STATUS: Unclear from /api/aliexpress/auth response"
    }
}

if ($testLinkTest) {
    if ($testLinkTest.HasForbiddenPattern) {
        Write-ErrorMsg "ENV VARS MISSING: /api/aliexpress/test-link contains forbidden pattern"
        $envVarsMissing = $true
    } elseif (-not $testLinkTest.HasForbiddenPattern -and $testLinkTest.Status -in @(200, 400, 401)) {
        Write-Success "ENV VARS PRESENT: /api/aliexpress/test-link does not contain 'APP_KEY no configurado'"
        if (-not $envVarsMissing) {
            $envVarsPresent = $true
        }
    }
}

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
    Write-Host "  $status $($result.Name) - $($result.Message)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Total: $($script:Results.Count) tests" -ForegroundColor Cyan
Write-Host "Passed: $($passed.Count)" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)" -ForegroundColor Red

Write-Host ""
if ($envVarsPresent -and -not $envVarsMissing) {
    Write-Success "ENV VARS STATUS: ✅ PRESENT - AliExpress environment variables are configured"
    $envStatus = "PRESENT"
} elseif ($envVarsMissing) {
    Write-ErrorMsg "ENV VARS STATUS: ❌ MISSING - AliExpress environment variables are NOT configured"
    $envStatus = "MISSING"
} else {
    Write-Host "ENV VARS STATUS: ⚠️  UNCLEAR - Cannot determine from endpoint responses" -ForegroundColor Yellow
    $envStatus = "UNCLEAR"
}

# Generate report
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$reportContent = @"
# Production Environment Probe Result

**Date:** $timestamp  
**Base URL:** $BASE_URL  
**Total Tests:** $($script:Results.Count)  
**Passed:** $($passed.Count)  
**Failed:** $($failed.Count)  
**Env Vars Status:** $envStatus

## Test Results

| Test Name | URL | Status | Result | Message | Env Vars Evidence |
|-----------|-----|--------|--------|---------|-------------------|
"@

foreach ($test in $script:Results) {
    $statusDisplay = if ($test.Status) { $test.Status.ToString() } else { "N/A" }
    $resultDisplay = if ($test.Pass) { "PASS" } else { "FAIL" }
    $urlDisplay = $test.Url
    if ($urlDisplay.Length -gt 60) {
        $urlDisplay = $urlDisplay.Substring(0, 57) + "..."
    }
    
    $envEvidence = ""
    if ($test.Name -eq "AliExpress OAuth Auth") {
        if ($test.IsRedirect -and $test.RedirectLocation -match "oauth\.aliexpress\.com") {
            $envEvidence = "✅ Redirects to OAuth (env vars present)"
        } elseif ($test.HasForbiddenPattern) {
            $envEvidence = "❌ Contains 'APP_KEY no configurado' (env vars missing)"
        } elseif ($test.Status -eq 500) {
            $envEvidence = "❌ Returns 500 (likely env vars missing)"
        } else {
            $envEvidence = "⚠️  Unclear"
        }
    } elseif ($test.Name -eq "AliExpress Test Link") {
        if ($test.HasForbiddenPattern) {
            $envEvidence = "❌ Contains forbidden pattern (env vars missing)"
        } elseif (-not $test.HasForbiddenPattern) {
            $envEvidence = "✅ No forbidden patterns (env vars likely present)"
        } else {
            $envEvidence = "⚠️  Unclear"
        }
    } else {
        $envEvidence = "N/A"
    }
    
    $reportContent += "`n| $($test.Name) | ``$urlDisplay`` | $statusDisplay | $resultDisplay | $($test.Message) | $envEvidence |"
}

$reportContent += @"

## Details

"@

foreach ($test in $script:Results) {
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

$reportContent += @"

## Environment Variables Status

**Overall Status:** $envStatus

### Evidence

"@

if ($envVarsPresent -and -not $envVarsMissing) {
    $reportContent += @"
✅ **ENV VARS PRESENT** - AliExpress environment variables are configured in production.

Evidence:
- `/api/aliexpress/auth` redirects to AliExpress OAuth (302/301)
- `/api/aliexpress/test-link` does not contain "APP_KEY no configurado"
- Endpoints respond correctly without env-related errors
"@
} elseif ($envVarsMissing) {
    $reportContent += @"
❌ **ENV VARS MISSING** - AliExpress environment variables are NOT configured in production.

Evidence:
- `/api/aliexpress/auth` returns error containing "APP_KEY no configurado" OR returns 500
- `/api/aliexpress/test-link` may contain forbidden patterns
- Endpoints indicate missing environment variables

**Action Required:** Configure ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET in Railway environment variables.
"@
} else {
    $reportContent += @"
⚠️  **ENV VARS UNCLEAR** - Cannot determine environment variable status from endpoint responses.

**Action Required:** Manual verification of Railway environment variables may be needed.
"@
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
if ($envVarsMissing) {
    Write-Host ""
    Write-Host "[FAIL] AliExpress environment variables are missing in production." -ForegroundColor Red
    exit 1
} elseif ($envVarsPresent) {
    Write-Host ""
    Write-Host "[PASS] AliExpress environment variables are present in production." -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "[WARN] Cannot determine environment variable status. Manual verification may be needed." -ForegroundColor Yellow
    exit 0
}

