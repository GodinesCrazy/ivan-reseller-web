# Promise Gate Script - Ivan Reseller Web
# Valida que la promesa (claims A-E) está lista para producción
# Ejecuta: builds, lint, tests, smoke checks, validación de flags, docs obligatorios
# PowerShell script para Windows

param(
    [switch]$SkipTests = $false,
    [switch]$SkipSmoke = $false,
    [string]$BackendUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"
$script:ExitCode = 0
$script:Results = @{
    BackendBuild = "SKIPPED"
    FrontendBuild = "SKIPPED"
    BackendTest = "SKIPPED"
    FrontendTest = "SKIPPED"
    SmokeHealth = "SKIPPED"
    SmokeReady = "SKIPPED"
    SmokeOpportunities = "SKIPPED"
    SmokeCors = "SKIPPED"
    DocsCapabilityMatrix = "SKIPPED"
    DocsE2EEvidence = "SKIPPED"
    DocsGapsBacklog = "SKIPPED"
    DocsEvidencePack = "SKIPPED"
    DocsP0Completion = "SKIPPED"
    DocsP0Amazon = "SKIPPED"
    DocsP0AliExpress = "SKIPPED"
    CredentialsValidation = "SKIPPED"
    HealthCheck = "SKIPPED"
    ReadyCheck = "SKIPPED"
    OpportunitiesHealth = "SKIPPED"
    FlagsValidation = "SKIPPED"
}

function Write-Status {
    param([string]$Message, [string]$Status = "INFO")
    $color = switch ($Status) {
        "SUCCESS" { "Green" }
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        "SKIPPED" { "Gray" }
        default { "White" }
    }
    Write-Host "[$Status] $Message" -ForegroundColor $color
}

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Directory,
        [string]$Command,
        [string]$ResultKey = ""
    )
    
    Write-Status "Running: $Name" "INFO"
    
    if (-not (Test-Path $Directory)) {
        Write-Status "Directory not found: $Directory" "SKIPPED"
        if ($ResultKey) { $script:Results[$ResultKey] = "SKIPPED" }
        return "SKIPPED"
    }
    
    $originalLocation = Get-Location
    try {
        Set-Location $Directory
        $output = Invoke-Expression $Command 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            Write-Status "$Name: PASSED" "SUCCESS"
            if ($ResultKey) { $script:Results[$ResultKey] = "PASSED" }
            return "PASSED"
        } else {
            Write-Status "$Name: FAILED (exit code: $exitCode)" "ERROR"
            if ($output) { Write-Host $output }
            if ($ResultKey) { $script:Results[$ResultKey] = "FAILED" }
            $script:ExitCode = 1
            return "FAILED"
        }
    } catch {
        Write-Status "$Name: ERROR - $($_.Exception.Message)" "ERROR"
        if ($ResultKey) { $script:Results[$ResultKey] = "FAILED" }
        $script:ExitCode = 1
        return "FAILED"
    } finally {
        Set-Location $originalLocation
    }
}

function Test-Endpoint {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Name,
        [string]$ResultKey = "",
        [int]$ExpectedStatus = 200
    )
    
    Write-Status "Testing: $Name ($Method $Url)" "INFO"
    
    try {
        $response = try {
            if ($Method -eq "GET") {
                Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -TimeoutSec 10 -UseBasicParsing
            } else {
                Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -TimeoutSec 10 -UseBasicParsing -Body "{}" -ContentType "application/json"
            }
        } catch {
            $_.Exception.Response
        }
        
        $statusCode = if ($response.StatusCode) { $response.StatusCode } else { 0 }
        
        if ($statusCode -eq $ExpectedStatus) {
            Write-Status "$Name: PASSED (HTTP $statusCode)" "SUCCESS"
            if ($ResultKey) { $script:Results[$ResultKey] = "PASSED" }
            return "PASSED"
        } else {
            Write-Status "$Name: FAILED (HTTP $statusCode, expected $ExpectedStatus)" "ERROR"
            if ($ResultKey) { $script:Results[$ResultKey] = "FAILED" }
            $script:ExitCode = 1
            return "FAILED"
        }
    } catch {
        Write-Status "$Name: ERROR - $($_.Exception.Message)" "ERROR"
        if ($ResultKey) { $script:Results[$ResultKey] = "FAILED" }
        $script:ExitCode = 1
        return "FAILED"
    }
}

function Test-DocumentExists {
    param(
        [string]$Path,
        [string]$Name,
        [string]$ResultKey = ""
    )
    
    Write-Status "Checking: $Name" "INFO"
    
    if (Test-Path $Path) {
        $size = (Get-Item $Path).Length
        if ($size -gt 0) {
            Write-Status "$Name: EXISTS ($([math]::Round($size/1KB, 2)) KB)" "SUCCESS"
            if ($ResultKey) { $script:Results[$ResultKey] = "PASSED" }
            return "PASSED"
        } else {
            Write-Status "$Name: EXISTS but EMPTY" "WARNING"
            if ($ResultKey) { $script:Results[$ResultKey] = "WARNING" }
            return "WARNING"
        }
    } else {
        Write-Status "$Name: NOT FOUND" "ERROR"
        if ($ResultKey) { $script:Results[$ResultKey] = "FAILED" }
        $script:ExitCode = 1
        return "FAILED"
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Promise Gate - Ivan Reseller Web" -ForegroundColor Cyan
Write-Host "  Validating Claims A-E Readiness" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ========================================
# 1. BUILDS
# ========================================
Write-Host "=== 1. BUILDS ===" -ForegroundColor Yellow
Write-Host ""

$rootDir = Split-Path -Parent $PSScriptRoot

# Backend Build
Invoke-Step -Name "Backend Build" -Directory "$rootDir\backend" -Command "npm run build" -ResultKey "BackendBuild"

# Frontend Build
Invoke-Step -Name "Frontend Build" -Directory "$rootDir\frontend" -Command "npm run build" -ResultKey "FrontendBuild"

Write-Host ""

# ========================================
# 2. TESTS (if not skipped)
# ========================================
if (-not $SkipTests) {
    Write-Host "=== 2. TESTS ===" -ForegroundColor Yellow
    Write-Host ""
    
    # Backend Tests
    if (Test-Path "$rootDir\backend\package.json") {
        $packageContent = Get-Content "$rootDir\backend\package.json" -Raw | ConvertFrom-Json
        if ($packageContent.scripts.test) {
            Invoke-Step -Name "Backend Tests" -Directory "$rootDir\backend" -Command "npm test" -ResultKey "BackendTest"
        } else {
            Write-Status "Backend Tests: SKIPPED (no test script)" "SKIPPED"
            $script:Results["BackendTest"] = "SKIPPED"
        }
    }
    
    # Frontend Tests
    if (Test-Path "$rootDir\frontend\package.json") {
        $packageContent = Get-Content "$rootDir\frontend\package.json" -Raw | ConvertFrom-Json
        if ($packageContent.scripts.test) {
            Invoke-Step -Name "Frontend Tests" -Directory "$rootDir\frontend" -Command "npm test" -ResultKey "FrontendTest"
        } else {
            Write-Status "Frontend Tests: SKIPPED (no test script)" "SKIPPED"
            $script:Results["FrontendTest"] = "SKIPPED"
        }
    }
    
    Write-Host ""
}

# ========================================
# 3. SMOKE TESTS (if not skipped and backend URL provided)
# ========================================
if (-not $SkipSmoke -and $BackendUrl) {
    Write-Host "=== 3. SMOKE TESTS ===" -ForegroundColor Yellow
    Write-Host ""
    
    # Health Check
    Test-Endpoint -Url "$BackendUrl/health" -Method "GET" -Name "Health Check" -ResultKey "SmokeHealth" -ExpectedStatus 200
    
    # Ready Check
    Test-Endpoint -Url "$BackendUrl/ready" -Method "GET" -Name "Ready Check" -ResultKey "SmokeReady" -ExpectedStatus 200
    
    # Opportunities Endpoint (Claim A) - should return 401 without auth
    Test-Endpoint -Url "$BackendUrl/api/opportunities?query=test&maxItems=1" -Method "GET" -Name "Opportunities API (Claim A)" -ResultKey "SmokeOpportunities" -ExpectedStatus 401
    
    # CORS Preflight (Claim C - Multi-marketplace)
    try {
        $corsHeaders = @{
            "Origin" = "https://www.ivanreseller.com"
            "Access-Control-Request-Method" = "POST"
            "Access-Control-Request-Headers" = "Content-Type"
        }
        Test-Endpoint -Url "$BackendUrl/api/marketplace/publish" -Method "OPTIONS" -Headers $corsHeaders -Name "CORS Preflight (Claim C)" -ResultKey "SmokeCors" -ExpectedStatus 204
    } catch {
        Write-Status "CORS Preflight: SKIPPED (OPTIONS not supported in test)" "SKIPPED"
        $script:Results["SmokeCors"] = "SKIPPED"
    }
    
    Write-Host ""
}

# ========================================
# 4. DOCUMENTATION CHECKS (Obligatory)
# ========================================
Write-Host "=== 4. DOCUMENTATION (Obligatory) ===" -ForegroundColor Yellow
Write-Host ""

$docsDir = "$rootDir\docs\audit"

Test-DocumentExists -Path "$docsDir\CAPABILITY_TRUTH_MATRIX.md" -Name "Capability Truth Matrix" -ResultKey "DocsCapabilityMatrix"
Test-DocumentExists -Path "$docsDir\E2E_EVIDENCE.md" -Name "E2E Evidence" -ResultKey "DocsE2EEvidence"
Test-DocumentExists -Path "$docsDir\GAPS_TO_PROMISE_BACKLOG.md" -Name "Gaps to Promise Backlog" -ResultKey "DocsGapsBacklog"

Write-Host ""

# ========================================
# 5. EVIDENCE VALIDATION (Obligatory docs)
# ========================================
Write-Host "=== 5. EVIDENCE VALIDATION (Obligatory docs) ===" -ForegroundColor Yellow
Write-Host ""

$evidenceDocs = @(
    @{Path="$docsDir\PROMISE_READY_EVIDENCE_PACK.md"; Name="Promise Ready Evidence Pack"; ResultKey="DocsEvidencePack"},
    @{Path="$docsDir\P0_COMPLETION_REPORT.md"; Name="P0 Completion Report"; ResultKey="DocsP0Completion"},
    @{Path="$docsDir\P0_AMAZON_STATUS.md"; Name="P0 Amazon Status"; ResultKey="DocsP0Amazon"},
    @{Path="$docsDir\P0_ALIEXPRESS_STATUS.md"; Name="P0 AliExpress Status"; ResultKey="DocsP0AliExpress"}
)

foreach ($doc in $evidenceDocs) {
    Test-DocumentExists -Path $doc.Path -Name $doc.Name -ResultKey $doc.ResultKey
}

Write-Host ""

# ========================================
# 6. MINIMAL CREDENTIALS VALIDATION (without exposing secrets)
# ========================================
Write-Host "=== 6. MINIMAL CREDENTIALS VALIDATION ===" -ForegroundColor Yellow
Write-Host ""

$credsValid = $true
$missingCreds = @()

# Check for minimal required environment variables (check if they exist, not their values)
$requiredCreds = @(
    @{Name="DATABASE_URL"; Description="Database connection"},
    @{Name="JWT_SECRET"; Description="JWT secret"},
    @{Name="ENCRYPTION_KEY"; Description="Encryption key"}
)

$optionalCreds = @(
    @{Name="GROQ_API_KEY"; Description="Groq AI API (optional for Claim A)"},
    @{Name="SERP_API_KEY"; Description="SerpAPI for Google Trends (optional for Claim A)"},
    @{Name="PAYPAL_CLIENT_ID"; Description="PayPal Payouts (optional for Claim E)"},
    @{Name="PAYPAL_CLIENT_SECRET"; Description="PayPal Payouts (optional for Claim E)"}
)

Write-Host "Required Credentials:" -ForegroundColor Cyan
foreach ($cred in $requiredCreds) {
    $value = [Environment]::GetEnvironmentVariable($cred.Name, "Process")
    if ([string]::IsNullOrEmpty($value)) {
        $value = [Environment]::GetEnvironmentVariable($cred.Name, "Machine")
    }
    if ([string]::IsNullOrEmpty($value)) {
        # Try to read from .env file
        $envFile = Join-Path $rootDir "backend\.env"
        if (Test-Path $envFile) {
            $content = Get-Content $envFile -Raw
            if ($content -match "$($cred.Name)=(.+)") {
                $value = $matches[1].Trim()
            }
        }
    }
    
    if (-not [string]::IsNullOrEmpty($value)) {
        $masked = if ($value.Length -gt 8) { $value.Substring(0, 4) + "..." + $value.Substring($value.Length - 4) } else { "***" }
        Write-Status "$($cred.Name): CONFIGURED ($masked)" "SUCCESS"
    } else {
        Write-Status "$($cred.Name): NOT FOUND" "ERROR"
        $credsValid = $false
        $missingCreds += $cred.Name
    }
}

Write-Host ""
Write-Host "Optional Credentials (for full functionality):" -ForegroundColor Cyan
foreach ($cred in $optionalCreds) {
    $value = [Environment]::GetEnvironmentVariable($cred.Name, "Process")
    if ([string]::IsNullOrEmpty($value)) {
        $value = [Environment]::GetEnvironmentVariable($cred.Name, "Machine")
    }
    if ([string]::IsNullOrEmpty($value)) {
        $envFile = Join-Path $rootDir "backend\.env"
        if (Test-Path $envFile) {
            $content = Get-Content $envFile -Raw
            if ($content -match "$($cred.Name)=(.+)") {
                $value = $matches[1].Trim()
            }
        }
    }
    
    if (-not [string]::IsNullOrEmpty($value)) {
        $masked = if ($value.Length -gt 8) { $value.Substring(0, 4) + "..." + $value.Substring($value.Length - 4) } else { "***" }
        Write-Status "$($cred.Name): CONFIGURED ($masked)" "SUCCESS"
    } else {
        Write-Status "$($cred.Name): NOT CONFIGURED (optional)" "WARNING"
    }
}

if ($credsValid) {
    Write-Status "Credentials Validation: PASSED (required credentials present)" "SUCCESS"
    $script:Results["CredentialsValidation"] = "PASSED"
} else {
    Write-Status "Credentials Validation: FAILED (missing required credentials: $($missingCreds -join ', '))" "ERROR"
    $script:Results["CredentialsValidation"] = "FAILED"
    $script:ExitCode = 1
}

Write-Host ""

# ========================================
# 7. INTEGRATION HEALTH CHECKS (if backend URL provided)
# ========================================
if (-not $SkipSmoke -and $BackendUrl) {
    Write-Host "=== 7. INTEGRATION HEALTH CHECKS ===" -ForegroundColor Yellow
    Write-Host ""
    
    # Health endpoint
    Test-Endpoint -Url "$BackendUrl/health" -Method "GET" -Name "Health Check" -ResultKey "HealthCheck" -ExpectedStatus 200
    
    # Ready endpoint
    Test-Endpoint -Url "$BackendUrl/ready" -Method "GET" -Name "Ready Check" -ResultKey "ReadyCheck" -ExpectedStatus 200
    
    # Opportunities endpoint (Claim A) - should return 401 without auth, which is expected
    Test-Endpoint -Url "$BackendUrl/api/opportunities?query=test&maxItems=1" -Method "GET" -Name "Opportunities API (Claim A)" -ResultKey "OpportunitiesHealth" -ExpectedStatus 401
    
    Write-Host ""
}

# ========================================
# 8. FLAGS VALIDATION (OFF by default)
# ========================================
Write-Host "=== 8. FLAGS VALIDATION (OFF by default) ===" -ForegroundColor Yellow
Write-Host ""

$flagsValid = $true

# Check environment variables for dangerous flags
$dangerousFlags = @(
    "AUTOPILOT_ENABLED",
    "AUTO_PURCHASE_ENABLED",
    "AUTO_PUBLISH_ENABLED"
)

foreach ($flag in $dangerousFlags) {
    $value = [Environment]::GetEnvironmentVariable($flag, "Process")
    if ($value -eq "true" -or $value -eq "1") {
        Write-Status "Flag $flag is ON (should be OFF by default)" "WARNING"
        $flagsValid = $false
    } else {
        Write-Status "Flag $flag: OK (OFF or not set)" "SUCCESS"
    }
}

if ($flagsValid) {
    Write-Status "Flags Validation: PASSED" "SUCCESS"
    $script:Results["FlagsValidation"] = "PASSED"
} else {
    Write-Status "Flags Validation: WARNING (some flags are ON)" "WARNING"
    $script:Results["FlagsValidation"] = "WARNING"
}

Write-Host ""

# ========================================
# 9. SUMMARY
# ========================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PROMISE GATE SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$passed = 0
$failed = 0
$skipped = 0
$warnings = 0

foreach ($key in $script:Results.Keys) {
    $value = $script:Results[$key]
    $status = switch ($value) {
        "PASSED" { "✅ PASSED"; $passed++ }
        "FAILED" { "❌ FAILED"; $failed++ }
        "SKIPPED" { "⏭️  SKIPPED"; $skipped++ }
        "WARNING" { "⚠️  WARNING"; $warnings++ }
        default { "❓ UNKNOWN"; $skipped++ }
    }
    Write-Host "  $key : $status" -ForegroundColor $(if ($value -eq "PASSED") { "Green" } elseif ($value -eq "FAILED") { "Red" } elseif ($value -eq "WARNING") { "Yellow" } else { "Gray" })
}

Write-Host ""
Write-Host "Total: $passed passed, $failed failed, $warnings warnings, $skipped skipped" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host ""

# ========================================
# 10. PROMISE-READY DECISION
# ========================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PROMISE-READY STATUS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$criticalChecks = @("BackendBuild", "FrontendBuild", "DocsCapabilityMatrix", "DocsE2EEvidence", "DocsGapsBacklog", "DocsEvidencePack", "DocsP0Completion", "CredentialsValidation")
$criticalFailed = $false

foreach ($check in $criticalChecks) {
    if ($script:Results[$check] -eq "FAILED") {
        $criticalFailed = $true
        break
    }
}

# Check for blocked-by-creds status in evidence docs
$blockedByCreds = $false
$evidencePackPath = "$docsDir\PROMISE_READY_EVIDENCE_PACK.md"
if (Test-Path $evidencePackPath) {
    $content = Get-Content $evidencePackPath -Raw
    if ($content -match "BLOCKED_BY_CREDS" -or $content -match "BLOCKED_BY.*CREDS") {
        $blockedByCreds = $true
    }
}

if ($criticalFailed -or $failed -gt 0) {
    Write-Host "❌ PROMISE-READY: NO" -ForegroundColor Red
    Write-Host ""
    Write-Host "Reason: Critical checks failed or missing documentation" -ForegroundColor Red
    Write-Host ""
    Write-Host "Required actions:" -ForegroundColor Yellow
    Write-Host "  1. Fix failed builds/tests" -ForegroundColor Yellow
    Write-Host "  2. Ensure all obligatory docs exist in docs/audit/" -ForegroundColor Yellow
    Write-Host "  3. Configure required credentials (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY)" -ForegroundColor Yellow
    Write-Host "  4. Review GAPS_TO_PROMISE_BACKLOG.md for P0 items" -ForegroundColor Yellow
    $script:ExitCode = 1
} elseif ($blockedByCreds) {
    Write-Host "⚠️ PROMISE-READY: PARTIAL (BLOCKED_BY_CREDS)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Reason: Some claims are blocked by missing credentials" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Required actions:" -ForegroundColor Yellow
    Write-Host "  1. Configure missing credentials for blocked claims" -ForegroundColor Yellow
    Write-Host "  2. See docs/audit/PROMISE_READY_EVIDENCE_PACK.md for details" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Production validations still pending:" -ForegroundColor Yellow
    Write-Host "  - P0.1: Amazon SP-API (requires production credentials)" -ForegroundColor Yellow
    Write-Host "  - P0.2: AliExpress Auto-Purchase (requires production validation)" -ForegroundColor Yellow
    $script:ExitCode = 1
} else {
    Write-Host "✅ PROMISE-READY: YES (CODE COMPLETE - Production validations pending)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Status: All code implemented, but production validations are pending:" -ForegroundColor Yellow
    Write-Host "  - P0.1: Amazon SP-API (requires production credentials and validation)" -ForegroundColor Yellow
    Write-Host "  - P0.2: AliExpress Auto-Purchase (requires production validation)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "See docs/audit/P0_COMPLETION_REPORT.md for DoD checklist" -ForegroundColor Cyan
    Write-Host "See docs/audit/GAPS_TO_PROMISE_BACKLOG.md for full backlog" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

exit $script:ExitCode

