#!/bin/bash
# ✅ GO-LIVE: Smoke Test Script for Linux/Mac
# Valida que los endpoints críticos del backend respondan correctamente

set -e

BACKEND_URL="${1}"
FRONTEND_URL="${2:-}"

if [ -z "$BACKEND_URL" ]; then
    echo "❌ Error: BACKEND_URL is required"
    echo "Usage: $0 <BACKEND_URL> [FRONTEND_URL]"
    exit 1
fi

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

function info() {
    echo "ℹ️  $1"
}

echo ""
echo "🔥 SMOKE TEST - Backend Endpoints"
echo "===================================="
echo "Backend URL: $BACKEND_URL"
if [ -n "$FRONTEND_URL" ]; then
    echo "Frontend URL: $FRONTEND_URL"
fi
echo ""

# Normalizar URL (eliminar trailing slash)
BACKEND_URL=$(echo "$BACKEND_URL" | sed 's|/$||')

# 1. Test /health
step "Testing /health endpoint"
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health" 2>/dev/null || echo "000")
if [ "$HEALTH_CODE" = "200" ]; then
    HEALTH_BODY=$(curl -s "$BACKEND_URL/health" 2>/dev/null || echo "{}")
    success "/health responded with 200"
    if command -v jq &> /dev/null; then
        STATUS=$(echo "$HEALTH_BODY" | jq -r '.status // "unknown"')
        SERVICE=$(echo "$HEALTH_BODY" | jq -r '.service // "unknown"')
        UPTIME=$(echo "$HEALTH_BODY" | jq -r '.uptime // "unknown"')
        info "  Status: $STATUS"
        info "  Service: $SERVICE"
        info "  Uptime: ${UPTIME}s"
    fi
else
    error "/health returned status $HEALTH_CODE"
fi

# 2. Test /ready
step "Testing /ready endpoint"
READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/ready" 2>/dev/null || echo "000")
if [ "$READY_CODE" = "200" ] || [ "$READY_CODE" = "503" ]; then
    READY_BODY=$(curl -s "$BACKEND_URL/ready" 2>/dev/null || echo "{}")
    if [ "$READY_CODE" = "200" ]; then
        if command -v jq &> /dev/null; then
            READY_STATUS=$(echo "$READY_BODY" | jq -r '.ready // false')
            if [ "$READY_STATUS" = "true" ]; then
                success "/ready responded with 200 (ready: true)"
            else
                warning "/ready returned 200 but ready: false"
            fi
        else
            success "/ready responded with 200"
        fi
    else
        warning "/ready returned 503 (not ready)"
    fi
else
    error "/ready returned unexpected status $READY_CODE"
fi

# 3. Test /version
step "Testing /version endpoint"
VERSION_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/version" 2>/dev/null || echo "000")
if [ "$VERSION_CODE" = "200" ]; then
    VERSION_BODY=$(curl -s "$BACKEND_URL/version" 2>/dev/null || echo "{}")
    success "/version responded with 200"
    if command -v jq &> /dev/null; then
        ENV=$(echo "$VERSION_BODY" | jq -r '.env // "unknown"')
        SERVICE=$(echo "$VERSION_BODY" | jq -r '.serviceName // "unknown"')
        NODE=$(echo "$VERSION_BODY" | jq -r '.node // "unknown"')
        info "  Environment: $ENV"
        info "  Service: $SERVICE"
        info "  Node: $NODE"
    fi
else
    error "/version returned status $VERSION_CODE"
fi

# 4. Test /config
step "Testing /config endpoint"
CONFIG_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/config" 2>/dev/null || echo "000")
if [ "$CONFIG_CODE" = "200" ]; then
    CONFIG_BODY=$(curl -s "$BACKEND_URL/config" 2>/dev/null || echo "{}")
    success "/config responded with 200"
    if command -v jq &> /dev/null; then
        CORS_COUNT=$(echo "$CONFIG_BODY" | jq -r '.corsOriginCount // 0')
        HAS_DB=$(echo "$CONFIG_BODY" | jq -r '.hasDbUrl // false')
        HAS_REDIS=$(echo "$CONFIG_BODY" | jq -r '.hasRedisUrl // false')
        API_HOST=$(echo "$CONFIG_BODY" | jq -r '.apiUrl // "unknown"')
        info "  CORS Origins: $CORS_COUNT"
        info "  Database: $HAS_DB"
        info "  Redis: $HAS_REDIS"
        info "  API URL Host: $API_HOST"
    fi
else
    error "/config returned status $CONFIG_CODE"
fi

# 5. Test CORS Preflight (OPTIONS)
step "Testing CORS preflight (OPTIONS)"
ORIGIN="${FRONTEND_URL:-https://test.example.com}"
CORS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BACKEND_URL/health" \
    -H "Origin: $ORIGIN" \
    -H "Access-Control-Request-Method: GET" \
    2>/dev/null || echo "000")
if [ "$CORS_CODE" = "204" ] || [ "$CORS_CODE" = "200" ]; then
    success "CORS preflight responded correctly ($CORS_CODE)"
    CORS_HEADERS=$(curl -s -I -X OPTIONS "$BACKEND_URL/health" \
        -H "Origin: $ORIGIN" \
        -H "Access-Control-Request-Method: GET" 2>/dev/null || echo "")
    if echo "$CORS_HEADERS" | grep -qi "Access-Control-Allow-Origin"; then
        ALLOW_ORIGIN=$(echo "$CORS_HEADERS" | grep -i "Access-Control-Allow-Origin" | cut -d' ' -f2 | tr -d '\r')
        info "  Access-Control-Allow-Origin: $ALLOW_ORIGIN"
    fi
    if echo "$CORS_HEADERS" | grep -qi "Access-Control-Allow-Credentials"; then
        ALLOW_CREDS=$(echo "$CORS_HEADERS" | grep -i "Access-Control-Allow-Credentials" | cut -d' ' -f2 | tr -d '\r')
        info "  Access-Control-Allow-Credentials: $ALLOW_CREDS"
    fi
else
    warning "CORS preflight returned status $CORS_CODE (may be expected if Origin not in allowlist)"
fi

# 6. Test Frontend (if provided)
if [ -n "$FRONTEND_URL" ]; then
    step "Testing Frontend URL"
    FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null || echo "000")
    if [ "$FRONTEND_CODE" = "200" ]; then
        success "Frontend responded with 200"
    else
        warning "Frontend returned status $FRONTEND_CODE"
    fi
fi

# Summary
echo ""
echo "📊 SMOKE TEST SUMMARY"
echo "===================="

if [ "$HAS_ERRORS" = true ]; then
    error "Smoke test completed with errors. Backend may not be ready for production."
    exit 1
else
    success "All critical endpoints responded correctly!"
    echo ""
    echo "Backend is ready for production. ✅"
    exit 0
fi

