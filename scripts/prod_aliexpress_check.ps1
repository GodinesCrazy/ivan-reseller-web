# Production AliExpress Check Script (PowerShell)
# Verifica rapidamente los endpoints criticos de AliExpress

$ErrorActionPreference = "Continue"
$script:HasErrors = $false
$script:Results = @()

$PRODUCTION_DOMAIN = "www.ivanreseller.com"
$BASE_URL = "https://$PRODUCTION_DOMAIN"

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
        [bool]$CheckRedirect = $false
    )
    
    Write-Step "Testing $Name"
    Write-Info "URL: $Url"
    
    try {
        if ($CheckRedirect) {
            # Test for redirect
            try {
                $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
                Write-ErrorMsg "$Name - Expected redirect but got status $($response.StatusCode)"
                $script:Results += @{
                    Name = $Name
                    Status = $response.StatusCode
                    Pass = $false
                    Message = "Expected redirect but got $($response.StatusCode)"
                }
            } catch {
                $statusCode = $_.Exception.Response.StatusCode.value__
                if ($statusCode -eq 302 -or $statusCode -eq 301 -or $statusCode -eq 307 -or $statusCode -eq 308) {
                    Write-Success "$Name - Redirects correctly ($statusCode)"
                    try {
                        $location = $_.Exception.Response.Headers.Location
                        if ($location) {
                            Write-Info "Redirects to: $location"
                        }
                    } catch {
                        # Location not available
                    }
                    $script:Results += @{
                        Name = $Name
                        Status = $statusCode
                        Pass = $true
                        Message = "Redirect $statusCode (OK)"
                    }
                } elseif ($statusCode -eq 500) {
                    Write-ErrorMsg "$Name - 500 Internal Server Error"
                    $script:Results += @{
                        Name = $Name
                        Status = $statusCode
                        Pass = $false
                        Message = "500 Internal Server Error"
                    }
                } else {
                    Write-ErrorMsg "$Name - Unexpected status $statusCode (expected redirect)"
                    $script:Results += @{
                        Name = $Name
                        Status = $statusCode
                        Pass = $false
                        Message = "Unexpected status $statusCode"
                    }
                }
            }
        } else {
            # Test for normal response
            $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -ErrorAction Stop
            $statusCode = $response.StatusCode
            
            if ($ExpectedStatusCodes -contains $statusCode) {
                Write-Success "$Name - Status $statusCode (OK)"
                $script:Results += @{
                    Name = $Name
                    Status = $statusCode
                    Pass = $true
                    Message = "Status $statusCode (OK)"
                }
            } else {
                Write-ErrorMsg "$Name - Status $statusCode (expected: $($ExpectedStatusCodes -join ', '))"
                $script:Results += @{
                    Name = $Name
                    Status = $statusCode
                    Pass = $false
                    Message = "Status $statusCode (expected: $($ExpectedStatusCodes -join ', '))"
                }
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
            if ($statusCode -eq 500) {
                Write-ErrorMsg "$Name - 500 Internal Server Error"
                $script:Results += @{
                    Name = $Name
                    Status = $statusCode
                    Pass = $false
                    Message = "500 Internal Server Error"
                }
            } elseif ($ExpectedStatusCodes -contains $statusCode) {
                Write-Success "$Name - Status $statusCode (OK)"
                $script:Results += @{
                    Name = $Name
                    Status = $statusCode
                    Pass = $true
                    Message = "Status $statusCode (OK)"
                }
            } else {
                Write-ErrorMsg "$Name - Status $statusCode"
                $script:Results += @{
                    Name = $Name
                    Status = $statusCode
                    Pass = $false
                    Message = "Status $statusCode"
                }
            }
        } else {
            Write-ErrorMsg "$Name - Request failed: $($_.Exception.Message)"
            $script:Results += @{
                Name = $Name
                Status = $null
                Pass = $false
                Message = "Request failed: $($_.Exception.Message)"
            }
        }
    }
}

# Start tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "PRODUCTION ALIEXPRESS CHECK" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "Domain: $BASE_URL" -ForegroundColor Gray
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Test 1: /api/aliexpress/token-status
Test-Endpoint -Name "AliExpress Token Status" -Url "$BASE_URL/api/aliexpress/token-status" -ExpectedStatusCodes @(200, 401, 403)

# Test 2: /api/aliexpress/auth (should redirect)
Test-Endpoint -Name "AliExpress OAuth Auth" -Url "$BASE_URL/api/aliexpress/auth" -CheckRedirect $true

# Test 3: /api/aliexpress/test-link
$testLinkUrl = "$BASE_URL/api/aliexpress/test-link?productId=1005001234567890"
Test-Endpoint -Name "AliExpress Test Link" -Url $testLinkUrl -ExpectedStatusCodes @(200, 400, 401, 403)

# Summary
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
    Write-Host "  $status $($result.Name)$statusCode - $($result.Message)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Total: $($script:Results.Count) tests" -ForegroundColor Cyan
Write-Host "Passed: $($passed.Count)" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)" -ForegroundColor Red

# Exit with appropriate code
if ($script:HasErrors) {
    Write-Host ""
    Write-Host "[FAIL] Some tests failed." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[PASS] All AliExpress endpoints responded correctly!" -ForegroundColor Green
    exit 0
}

