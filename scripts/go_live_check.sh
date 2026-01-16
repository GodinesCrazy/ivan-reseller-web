#!/bin/bash
# GO LIVE Validation Script for Linux/Mac
# Validates that both frontend and backend are ready for deployment

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
HAS_ERRORS=false

function step() {
    echo ""
    echo "▶ $1"
}

function success() {
    echo "✅ $1"
}

function error() {
    echo "❌ $1"
    HAS_ERRORS=true
}

function warning() {
    echo "⚠️  $1"
}

echo ""
echo "🚀 GO LIVE VALIDATION SCRIPT"
echo "================================"

# 1. Build Backend
step "Building Backend..."
cd backend
echo "   Running: npm ci"
if ! npm ci > /dev/null 2>&1; then
    error "Backend npm ci failed"
    exit 1
fi

echo "   Running: npm run build"
if ! npm run build > /dev/null 2>&1; then
    error "Backend build failed"
    exit 1
fi
success "Backend built successfully"
cd ..

# 2. Build Frontend
step "Building Frontend..."
cd frontend
echo "   Running: npm ci --include=dev"
if ! npm ci --include=dev > /dev/null 2>&1; then
    error "Frontend npm ci failed"
    exit 1
fi

echo "   Running: npm run build"
if ! npm run build > /dev/null 2>&1; then
    error "Frontend build failed"
    exit 1
fi

if [ -f "dist/index.html" ]; then
    success "Frontend built successfully (dist/index.html exists)"
else
    error "Frontend build output missing (dist/index.html not found)"
    exit 1
fi
cd ..

# 3. Test Backend Endpoints
step "Testing Backend Endpoints..."
echo "   Backend URL: $BACKEND_URL"

# Test /health
echo "   Testing GET $BACKEND_URL/health"
if HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health" 2>/dev/null); then
    if [ "$HEALTH_RESPONSE" = "200" ]; then
        success "/health endpoint responding (200)"
    else
        error "/health endpoint returned status $HEALTH_RESPONSE"
    fi
else
    warning "/health endpoint not accessible (backend may not be running)"
    echo "   This is OK if you're only validating builds"
fi

# Test /ready
echo "   Testing GET $BACKEND_URL/ready"
if READY_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/ready" 2>/dev/null); then
    if [ "$READY_RESPONSE" = "200" ] || [ "$READY_RESPONSE" = "503" ]; then
        success "/ready endpoint responding ($READY_RESPONSE)"
    else
        error "/ready endpoint returned unexpected status $READY_RESPONSE"
    fi
else
    warning "/ready endpoint not accessible (backend may not be running)"
    echo "   This is OK if you're only validating builds"
fi

# Summary
echo ""
echo "📊 VALIDATION SUMMARY"
echo "====================="

if [ "$HAS_ERRORS" = true ]; then
    error "Validation completed with errors. Please fix issues before deploying."
    exit 1
else
    success "All validations passed! Ready for GO LIVE."
    echo ""
    echo "Next steps:"
    echo "1. Configure environment variables in Railway (backend)"
    echo "2. Configure environment variables in Vercel (frontend)"
    echo "3. Deploy and verify endpoints are accessible"
    exit 0
fi

