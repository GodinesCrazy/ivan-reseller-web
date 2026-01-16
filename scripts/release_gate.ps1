# Release Gate Script - Ivan Reseller Web
# Ejecuta validaciones pre-deployment: lint, build, tests, smoke checks
# PowerShell script para Windows

param(
    [switch]$SkipTests = $false,
    [switch]$SkipSmoke = $false,
    [string]$BackendUrl = ""
)

$ErrorActionPreference = "Stop"
$script:ExitCode = 0
$script:Results = @{
    BackendLint = "SKIPPED"
    BackendBuild = "SKIPPED"
    BackendTest = "SKIPPED"
    FrontendLint = "SKIPPED"
    FrontendBuild = "SKIPPED"
    FrontendTest = "SKIPPED"
    SmokeHealth = "SKIPPED"
    SmokeReady = "SKIPPED"
    SmokeCors = "SKIPPED"
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

function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Directory,
        [string]$Command,
        [string]$SkipIf = ""
    )
    
    Write-Status "Running: $Name" "INFO"
    
    if ($SkipIf -and -not (Test-Path $SkipIf)) {
        Write-Status "Skipping $Name (prerequisite not found: $SkipIf)" "SKIPPED"
        return "SKIPPED"
    }
    
    if (-not (Test-Path $Directory)) {
        Write-Status "Directory not found: $Directory" "SKIPPED"
        return "SKIPPED"
    }
    
    $originalLocation = Get-Location
    try {
        Set-Location $Directory
        $output = Invoke-Expression $Command 2>&1
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            Write-Status "$Name: PASSED" "SUCCESS"
            return "PASSED"
        } else {
            Write-Status "$Name: FAILED (exit code: $exitCode)" "ERROR"
            Write-Host $output
            $script:ExitCode = 1
            return "FAILED"
        }
    } catch {
        Write-Status "$Name: ERROR - $($_.Exception.Message)" "ERROR"
        $script:ExitCode = 1
        return "FAILED"
    } finally {
        Set-Location $originalLocation
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Release Gate - Ivan Reseller Web" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Backend
Write-Host "=== BACKEND ===" -ForegroundColor Yellow
Write-Host ""

# Backend: Lint
$script:Results.BackendLint = Invoke-Step `
    -Name "Backend Lint" `
    -Directory "backend" `
    -Command "npm run lint" `
    -SkipIf "backend/package.json"

# Backend: Build
$script:Results.BackendBuild = Invoke-Step `
    -Name "Backend Build" `
    -Directory "backend" `
    -Command "npm run build" `
    -SkipIf "backend/package.json"

# Backend: Test
if (-not $SkipTests) {
    $script:Results.BackendTest = Invoke-Step `
        -Name "Backend Test" `
        -Directory "backend" `
        -Command "npm test" `
        -SkipIf "backend/package.json"
} else {
    Write-Status "Skipping Backend Test (--SkipTests flag)" "SKIPPED"
    $script:Results.BackendTest = "SKIPPED"
}

Write-Host ""

# Frontend
Write-Host "=== FRONTEND ===" -ForegroundColor Yellow
Write-Host ""

# Frontend: Lint
$script:Results.FrontendLint = Invoke-Step `
    -Name "Frontend Lint" `
    -Directory "frontend" `
    -Command "npm run lint" `
    -SkipIf "frontend/package.json"

# Frontend: Build
$script:Results.FrontendBuild = Invoke-Step `
    -Name "Frontend Build" `
    -Directory "frontend" `
    -Command "npm run build" `
    -SkipIf "frontend/package.json"

# Frontend: Test
if (-not $SkipTests) {
    $script:Results.FrontendTest = Invoke-Step `
        -Name "Frontend Test" `
        -Directory "frontend" `
        -Command "npm test" `
        -SkipIf "frontend/package.json"
} else {
    Write-Status "Skipping Frontend Test (--SkipTests flag)" "SKIPPED"
    $script:Results.FrontendTest = "SKIPPED"
}

Write-Host ""

# Smoke Tests
if (-not $SkipSmoke) {
    Write-Host "=== SMOKE TESTS ===" -ForegroundColor Yellow
    Write-Host ""
    
    if (-not $BackendUrl) {
        $BackendUrl = $env:VITE_API_URL
        if (-not $BackendUrl) {
            $BackendUrl = "http://localhost:3000"
            Write-Status "No backend URL provided, using default: $BackendUrl" "WARNING"
        }
    }
    
    # Remove trailing slash
    $BackendUrl = $BackendUrl.TrimEnd('/')
    
    # Test curl availability
    if (-not (Test-Command "curl")) {
        Write-Status "curl not found, skipping smoke tests" "SKIPPED"
        $script:Results.SmokeHealth = "SKIPPED"
        $script:Results.SmokeReady = "SKIPPED"
        $script:Results.SmokeCors = "SKIPPED"
    } else {
        # Health Check
        Write-Status "Testing: GET $BackendUrl/health" "INFO"
        try {
            $healthResponse = curl -s -f -w "%{http_code}" "$BackendUrl/health" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Status "Health Check: PASSED" "SUCCESS"
                $script:Results.SmokeHealth = "PASSED"
            } else {
                Write-Status "Health Check: FAILED (HTTP $healthResponse)" "ERROR"
                $script:Results.SmokeHealth = "FAILED"
                $script:ExitCode = 1
            }
        } catch {
            Write-Status "Health Check: ERROR - $($_.Exception.Message)" "ERROR"
            $script:Results.SmokeHealth = "FAILED"
            $script:ExitCode = 1
        }
        
        # Ready Check
        Write-Status "Testing: GET $BackendUrl/ready" "INFO"
        try {
            $readyResponse = curl -s -f -w "%{http_code}" "$BackendUrl/ready" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Status "Ready Check: PASSED" "SUCCESS"
                $script:Results.SmokeReady = "PASSED"
            } else {
                Write-Status "Ready Check: FAILED (HTTP $readyResponse)" "ERROR"
                $script:Results.SmokeReady = "FAILED"
                $script:ExitCode = 1
            }
        } catch {
            Write-Status "Ready Check: ERROR - $($_.Exception.Message)" "ERROR"
            $script:Results.SmokeReady = "FAILED"
            $script:ExitCode = 1
        }
        
        # CORS Preflight
        Write-Status "Testing: OPTIONS $BackendUrl/api/dashboard/stats (CORS)" "INFO"
        try {
            $corsResponse = curl -s -f -w "%{http_code}" -X OPTIONS `
                -H "Origin: https://www.ivanreseller.com" `
                -H "Access-Control-Request-Method: GET" `
                "$BackendUrl/api/dashboard/stats" 2>&1
            if ($LASTEXITCODE -eq 0 -or $corsResponse -match "204|200") {
                Write-Status "CORS Preflight: PASSED" "SUCCESS"
                $script:Results.SmokeCors = "PASSED"
            } else {
                Write-Status "CORS Preflight: FAILED (HTTP $corsResponse)" "ERROR"
                $script:Results.SmokeCors = "FAILED"
                $script:ExitCode = 1
            }
        } catch {
            Write-Status "CORS Preflight: ERROR - $($_.Exception.Message)" "ERROR"
            $script:Results.SmokeCors = "FAILED"
            $script:ExitCode = 1
        }
    }
    
    Write-Host ""
}

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$summaryFormat = "{0,-20} {1,-10}"
Write-Host ($summaryFormat -f "Step", "Status")
Write-Host ("-" * 30)

$steps = @(
    @{Name="Backend Lint"; Result=$script:Results.BackendLint},
    @{Name="Backend Build"; Result=$script:Results.BackendBuild},
    @{Name="Backend Test"; Result=$script:Results.BackendTest},
    @{Name="Frontend Lint"; Result=$script:Results.FrontendLint},
    @{Name="Frontend Build"; Result=$script:Results.FrontendBuild},
    @{Name="Frontend Test"; Result=$script:Results.FrontendTest},
    @{Name="Smoke Health"; Result=$script:Results.SmokeHealth},
    @{Name="Smoke Ready"; Result=$script:Results.SmokeReady},
    @{Name="Smoke CORS"; Result=$script:Results.SmokeCors}
)

foreach ($step in $steps) {
    $statusColor = switch ($step.Result) {
        "PASSED" { "Green" }
        "FAILED" { "Red" }
        "SKIPPED" { "Gray" }
        default { "White" }
    }
    Write-Host ($summaryFormat -f $step.Name, $step.Result) -ForegroundColor $statusColor
}

Write-Host ""

# Final decision
$failedSteps = ($steps | Where-Object { $_.Result -eq "FAILED" }).Count
$passedSteps = ($steps | Where-Object { $_.Result -eq "PASSED" }).Count
$skippedSteps = ($steps | Where-Object { $_.Result -eq "SKIPPED" }).Count

Write-Host "Total: $passedSteps PASSED, $failedSteps FAILED, $skippedSteps SKIPPED" -ForegroundColor Cyan

if ($failedSteps -gt 0) {
    Write-Host ""
    Write-Host "❌ RELEASE GATE: NO-GO" -ForegroundColor Red
    Write-Host "   Fix failures before deploying" -ForegroundColor Red
} else {
    Write-Host ""
    Write-Host "✅ RELEASE GATE: GO" -ForegroundColor Green
    Write-Host "   All checks passed (or skipped)" -ForegroundColor Green
}

Write-Host ""

exit $script:ExitCode

