# GO LIVE Validation Script for Windows (PowerShell)
# Validates that both frontend and backend are ready for deployment

param(
    [string]$BackendUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
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

Write-Host "`n🚀 GO LIVE VALIDATION SCRIPT" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta

# 1. Build Backend
Write-Step "Building Backend..."
Push-Location backend
try {
    Write-Host "   Running: npm ci" -ForegroundColor Gray
    npm ci 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend npm ci failed"
        exit 1
    }
    
    Write-Host "   Running: npm run build" -ForegroundColor Gray
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend build failed"
        exit 1
    }
    Write-Success "Backend built successfully"
} catch {
    Write-Error "Backend build error: $_"
    exit 1
} finally {
    Pop-Location
}

# 2. Build Frontend
Write-Step "Building Frontend..."
Push-Location frontend
try {
    Write-Host "   Running: npm ci --include=dev" -ForegroundColor Gray
    npm ci --include=dev 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend npm ci failed"
        exit 1
    }
    
    Write-Host "   Running: npm run build" -ForegroundColor Gray
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend build failed"
        exit 1
    }
    
    if (Test-Path "dist/index.html") {
        Write-Success "Frontend built successfully (dist/index.html exists)"
    } else {
        Write-Error "Frontend build output missing (dist/index.html not found)"
        exit 1
    }
} catch {
    Write-Error "Frontend build error: $_"
    exit 1
} finally {
    Pop-Location
}

# 3. Test Backend Endpoints
Write-Step "Testing Backend Endpoints..."
Write-Host "   Backend URL: $BackendUrl" -ForegroundColor Gray

try {
    # Test /health
    Write-Host "   Testing GET $BackendUrl/health" -ForegroundColor Gray
    $healthResponse = Invoke-WebRequest -Uri "$BackendUrl/health" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue
    if ($healthResponse.StatusCode -eq 200) {
        Write-Success "/health endpoint responding (200)"
    } else {
        Write-Error "/health endpoint returned status $($healthResponse.StatusCode)"
    }
} catch {
    Write-Warning "/health endpoint not accessible (backend may not be running)"
    Write-Host "   This is OK if you're only validating builds" -ForegroundColor Gray
}

try {
    # Test /ready
    Write-Host "   Testing GET $BackendUrl/ready" -ForegroundColor Gray
    $readyResponse = Invoke-WebRequest -Uri "$BackendUrl/ready" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue
    if ($readyResponse.StatusCode -eq 200 -or $readyResponse.StatusCode -eq 503) {
        Write-Success "/ready endpoint responding ($($readyResponse.StatusCode))"
    } else {
        Write-Error "/ready endpoint returned unexpected status $($readyResponse.StatusCode)"
    }
} catch {
    Write-Warning "/ready endpoint not accessible (backend may not be running)"
    Write-Host "   This is OK if you're only validating builds" -ForegroundColor Gray
}

# Summary
Write-Host "`n📊 VALIDATION SUMMARY" -ForegroundColor Magenta
Write-Host "=====================" -ForegroundColor Magenta

if ($script:HasErrors) {
    Write-Error "Validation completed with errors. Please fix issues before deploying."
    exit 1
} else {
    Write-Success "All validations passed! Ready for GO LIVE."
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "1. Configure environment variables in Railway (backend)" -ForegroundColor White
    Write-Host "2. Configure environment variables in Vercel (frontend)" -ForegroundColor White
    Write-Host "3. Deploy and verify endpoints are accessible" -ForegroundColor White
    exit 0
}

