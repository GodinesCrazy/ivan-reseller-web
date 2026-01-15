#!/bin/bash
# ✅ GO-LIVE: Production Smoke Test Script (Bash)
# Valida que las rutas críticas de producción funcionen correctamente
# NO usa secrets - solo prueba endpoints públicos

set -e

PRODUCTION_DOMAIN="www.ivanreseller.com"
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

function info() {
    echo "ℹ️  $1"
}

echo ""
echo "🔥 PRODUCTION SMOKE TEST"
echo "======================="
echo "Domain: https://${PRODUCTION_DOMAIN}"
echo ""

# 1. Test /health
step "Testing /health endpoint"
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${PRODUCTION_DOMAIN}/health" 2>/dev/null || echo "000")
if [ "$HEALTH_CODE" = "200" ]; then
    success "/health responded with 200"
    HEALTH_BODY=$(curl -s "https://${PRODUCTION_DOMAIN}/health" 2>/dev/null || echo "{}")
    if command -v jq &> /dev/null; then
        STATUS=$(echo "$HEALTH_BODY" | jq -r '.status // "unknown"')
        info "  Status: $STATUS"
    fi
else
    error "/health returned status $HEALTH_CODE (expected 200)"
fi

# 2. Test /api/aliexpress/token-status
step "Testing /api/aliexpress/token-status endpoint"
TOKEN_STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${PRODUCTION_DOMAIN}/api/aliexpress/token-status" 2>/dev/null || echo "000")
if [ "$TOKEN_STATUS_CODE" = "200" ]; then
    success "/api/aliexpress/token-status responded with 200"
elif [ "$TOKEN_STATUS_CODE" = "401" ] || [ "$TOKEN_STATUS_CODE" = "403" ]; then
    success "/api/aliexpress/token-status responded with $TOKEN_STATUS_CODE (expected auth required)"
else
    error "/api/aliexpress/token-status returned status $TOKEN_STATUS_CODE (expected 200/401/403, NOT 502)"
    if [ "$TOKEN_STATUS_CODE" = "502" ]; then
        error "  → 502 indicates backend not reachable - rewrite may not be working"
    fi
fi

# 3. Test /api/aliexpress/auth (should redirect 302 or 301)
step "Testing /api/aliexpress/auth endpoint (should redirect)"
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "https://${PRODUCTION_DOMAIN}/api/aliexpress/auth" 2>/dev/null || echo "000")
AUTH_REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" -I "https://${PRODUCTION_DOMAIN}/api/aliexpress/auth" 2>/dev/null | head -n 1 | grep -oE "[0-9]{3}" || echo "000")
if [ "$AUTH_REDIRECT" = "302" ] || [ "$AUTH_REDIRECT" = "301" ] || [ "$AUTH_REDIRECT" = "307" ] || [ "$AUTH_REDIRECT" = "308" ]; then
    success "/api/aliexpress/auth redirects correctly ($AUTH_REDIRECT)"
    AUTH_LOCATION=$(curl -s -I "https://${PRODUCTION_DOMAIN}/api/aliexpress/auth" 2>/dev/null | grep -i "location:" | cut -d' ' -f2- | tr -d '\r' || echo "")
    if [ -n "$AUTH_LOCATION" ]; then
        info "  Redirects to: $AUTH_LOCATION"
    fi
elif [ "$AUTH_REDIRECT" = "502" ]; then
    error "/api/aliexpress/auth returned 502 (backend not reachable - rewrite not working)"
elif [ "$AUTH_REDIRECT" = "404" ]; then
    error "/api/aliexpress/auth returned 404 (route not found or rewrite not working)"
else
    error "/api/aliexpress/auth returned status $AUTH_REDIRECT (expected 302/301 redirect)"
fi

# 4. Test /api/aliexpress/test-link
step "Testing /api/aliexpress/test-link endpoint"
TEST_LINK_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${PRODUCTION_DOMAIN}/api/aliexpress/test-link?productId=1005001234567890" 2>/dev/null || echo "000")
TEST_LINK_BODY=$(curl -s "https://${PRODUCTION_DOMAIN}/api/aliexpress/test-link?productId=1005001234567890" 2>/dev/null || echo "")
if [ "$TEST_LINK_CODE" = "200" ]; then
    success "/api/aliexpress/test-link responded with 200"
    if echo "$TEST_LINK_BODY" | grep -qi "env missing\|ALIEXPRESS_APP_KEY no configurado"; then
        error "/api/aliexpress/test-link body contains 'env missing' or 'APP_KEY no configurado'"
        info "  Body preview: $(echo "$TEST_LINK_BODY" | head -c 200)"
    else
        info "  Response OK (not 'env missing')"
    fi
elif [ "$TEST_LINK_CODE" = "502" ]; then
    error "/api/aliexpress/test-link returned 502 (backend not reachable)"
elif [ "$TEST_LINK_CODE" = "404" ]; then
    error "/api/aliexpress/test-link returned 404 (route not found)"
else
    warning "/api/aliexpress/test-link returned status $TEST_LINK_CODE"
    if echo "$TEST_LINK_BODY" | grep -qi "env missing\|ALIEXPRESS_APP_KEY no configurado"; then
        error "  Response body contains 'env missing' or 'APP_KEY no configurado'"
    fi
fi

# Summary
echo ""
echo "📊 SMOKE TEST SUMMARY"
echo "===================="

if [ "$HAS_ERRORS" = true ]; then
    echo ""
    error "❌ FAIL - Some tests failed. Production wiring may not be correct."
    echo ""
    echo "Common issues:"
    echo "  - 502 errors: Backend not reachable, check vercel.json rewrites"
    echo "  - 404 errors: Routes not found, check rewrite patterns"
    echo "  - 'env missing' errors: Backend responding but config missing (different issue)"
    exit 1
else
    echo ""
    success "✅ PASS - All production endpoints responded correctly!"
    echo ""
    echo "Production wiring is correct. ✅"
    echo ""
    echo "Test URLs:"
    echo "  - Health: https://${PRODUCTION_DOMAIN}/health"
    echo "  - Token Status: https://${PRODUCTION_DOMAIN}/api/aliexpress/token-status"
    echo "  - OAuth Auth: https://${PRODUCTION_DOMAIN}/api/aliexpress/auth"
    echo "  - Test Link: https://${PRODUCTION_DOMAIN}/api/aliexpress/test-link?productId=1005001234567890"
    exit 0
fi

